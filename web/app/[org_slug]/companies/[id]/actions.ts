"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";

/**
 * Enrich on-demand: dispara Apollo /organizations/enrich + update.
 * Esto consume 1 crédito.
 *
 * IMPORTANTE: el server action no llama directamente al Python (cross-stack).
 * En su lugar, llama un internal endpoint del backend Python que se va a
 * configurar en F0.5. Por ahora hace fetch directo a Apollo desde JS y
 * persiste vía supabase service.
 */
export async function enrichCompanyAction(orgSlug: string, companyId: string) {
  const user = await requireAuth();
  await requireOrgMembership(orgSlug, user.id);

  const svc = createSupabaseServiceClient();
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) return { error: "APOLLO_API_KEY no configurada" };

  const { data: company } = await svc
    .from("companies")
    .select("id, dominio, apollo_id")
    .eq("id", companyId)
    .single();

  if (!company) return { error: "Empresa no encontrada" };
  if (!company.dominio) return { error: "Empresa sin dominio — enrich Apollo no puede" };

  // Budget check
  const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [{ data: cfg }, { data: usage }] = await Promise.all([
    svc.from("apollo_budget_config").select("*").limit(1).single(),
    svc.from("apollo_credit_usage_monthly").select("*").eq("year_month", ym).maybeSingle(),
  ]);
  if (cfg) {
    const used = (usage?.credits_used as number) || 0;
    if (used + 1 > Number(cfg.monthly_budget_credits) * Number(cfg.hard_stop_pct) / 100) {
      return { error: "Budget Apollo agotado este mes — esperá al próximo ciclo" };
    }
  }

  // Llamar a Apollo
  try {
    const params = new URLSearchParams({ domain: company.dominio });
    const apolloRes = await fetch(`https://api.apollo.io/api/v1/organizations/enrich?${params}`, {
      method: "POST",
      headers: {
        "X-Api-Key": apolloKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (!apolloRes.ok) {
      return { error: `Apollo respondió ${apolloRes.status}` };
    }
    const data = await apolloRes.json();
    const org = (data.organization || data) as any;
    if (!org || !org.id) {
      return { error: "Apollo no encontró perfil para ese dominio" };
    }

    // Update company
    const headcount = (() => {
      const n = org.estimated_num_employees;
      if (n == null) return null;
      if (n < 10) return "1-9";
      if (n < 20) return "10-19";
      if (n < 50) return "20-49";
      if (n < 100) return "50-99";
      if (n < 200) return "100-199";
      if (n < 500) return "200-499";
      if (n < 1000) return "500-999";
      return "1000+";
    })();

    const update: Record<string, any> = {
      sector: org.industry,
      subsector: org.sub_industry,
      headcount_range: headcount,
      location_pais: org.country || "AR",
      location_provincia: org.state,
      location_ciudad: org.city,
      tech_stack: org.technology_names || org.technologies || [],
      last_apollo_sync_at: new Date().toISOString(),
    };
    // Limpiar nulls/empty arrays
    const cleaned = Object.fromEntries(
      Object.entries(update).filter(([_, v]) => v != null && (!Array.isArray(v) || v.length > 0))
    );

    await svc.from("companies").update(cleaned).eq("id", companyId);

    // Update credit usage
    if (usage) {
      await svc
        .from("apollo_credit_usage_monthly")
        .update({
          credits_used: (usage.credits_used as number) + 1,
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", usage.id);
    } else {
      await svc
        .from("apollo_credit_usage_monthly")
        .insert({ year_month: ym, credits_used: 1, last_sync_at: new Date().toISOString() });
    }

    revalidatePath(`/${orgSlug}/companies/${companyId}`);
    return { success: true };
  } catch (e: any) {
    return { error: e?.message || "Error desconocido" };
  }
}

/**
 * Generar brief con Anthropic.
 */
export async function generateBriefAction(orgSlug: string, companyId: string) {
  const user = await requireAuth();
  await requireOrgMembership(orgSlug, user.id);

  const svc = createSupabaseServiceClient();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  if (!apiKey) return { error: "ANTHROPIC_API_KEY no configurada" };

  const { data: company } = await svc.from("companies").select("*").eq("id", companyId).single();
  if (!company) return { error: "Empresa no encontrada" };
  if (!company.sector) {
    return { error: "Empresa todavía no enriquecida — corré 'Enrich' primero" };
  }

  const userPrompt = `Datos de la empresa:

# ${company.razon_social}
- Sector: ${company.sector || "?"}
- Subsector: ${company.subsector || "?"}
- Empleados: ${company.headcount_range || "?"}
- Fundada: ${company.founded_year || "?"}
- Ubicación: ${[company.location_ciudad, company.location_provincia, company.location_pais].filter(Boolean).join(", ") || "?"}
- Web: ${company.dominio || "?"}
- Revenue: ${company.organization_revenue_printed || "?"}
- Growth 12m: ${company.organization_headcount_twelve_month_growth != null ? `${(Number(company.organization_headcount_twelve_month_growth) * 100).toFixed(1)}%` : "?"}
- Growth 24m: ${company.organization_headcount_twenty_four_month_growth != null ? `${(Number(company.organization_headcount_twenty_four_month_growth) * 100).toFixed(1)}%` : "?"}
- Tech: ${Array.isArray(company.tech_stack) ? company.tech_stack.slice(0, 15).join(", ") : "—"}
- Apollo intent: ${company.intent_strength || "n/a"}

Generá el brief siguiendo el formato del system prompt.`;

  const systemPrompt = `Sos un analista B2B que escribe briefs ejecutivos sobre empresas argentinas para un equipo de ventas de Yacaré (estudio de diseño y desarrollo digital con foco en IA para PYMEs).

Cada brief tiene exactamente 4 oraciones cortas, 80-130 palabras totales:
1. Qué hace la empresa (industria, tamaño, modelo)
2. Por qué está en el radar (crecimiento, señales recientes, financiera)
3. Por qué Yacaré podría serle útil (pitch específico, no genérico)
4. Riesgo o caveat (estado actual, competencia, momento del ciclo)

Tono: directo, sin marketing-speak, sin adjetivos vacíos. Castellano rioplatense neutro. Si faltan datos clave, dejarlo claro en lugar de inventar.`;

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      return { error: `Anthropic ${apiRes.status}: ${err.slice(0, 200)}` };
    }
    const body = await apiRes.json();
    const brief = (body.content || []).map((b: any) => b.text || "").join("\n").trim();
    if (!brief) return { error: "Anthropic devolvió vacío" };

    await svc
      .from("companies")
      .update({
        ai_brief: brief,
        ai_brief_generated_at: new Date().toISOString(),
        ai_brief_model: model,
      })
      .eq("id", companyId);

    revalidatePath(`/${orgSlug}/companies/${companyId}`);
    return { success: true };
  } catch (e: any) {
    return { error: e?.message || "Error desconocido" };
  }
}
