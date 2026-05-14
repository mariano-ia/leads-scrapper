"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { fetchSignalsForCompanyAction } from "./signals-actions";

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
    .select("id, dominio, apollo_id, apollo_data, last_apollo_sync_at, sector")
    .eq("id", companyId)
    .single();

  if (!company) return { error: "Empresa no encontrada" };
  if (!company.dominio) return { error: "Empresa sin dominio — enrich Apollo no puede" };

  // D2: skip si fue enriquecida en los últimos 30 días (ya tenemos data fresca).
  // Esto previene gastar créditos por dobles clics o flows reiterativos.
  if (company.sector && company.last_apollo_sync_at) {
    const ageDays = (Date.now() - new Date(company.last_apollo_sync_at as string).getTime()) / 86400000;
    if (ageDays < 30) {
      return {
        success: true,
        skipped: true,
        reason: `Ya enriquecida hace ${Math.floor(ageDays)} días — esperá 30 días o usá "Re-enrich" forzado.`,
      };
    }
  }

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

    // tech_stack puede venir como string[] o como objeto[]. Normalizamos a string[].
    const techRaw = org.technology_names || org.technologies || [];
    const techNorm = Array.isArray(techRaw)
      ? techRaw.map((t: any) => (typeof t === "string" ? t : t?.name || null)).filter(Boolean)
      : [];

    // Merge nuevo payload sobre el apollo_data jsonb existente (mantener fields del search).
    const mergedApolloData = {
      ...(company.apollo_data || {}),
      _enrich: org,
      _enriched_at: new Date().toISOString(),
    };

    const update: Record<string, any> = {
      sector: org.industry,
      subsector: org.sub_industry,
      headcount_range: headcount,
      location_pais: org.country || "AR",
      location_provincia: org.state,
      location_ciudad: org.city,
      tech_stack: techNorm,
      apollo_data: mergedApolloData,
      last_apollo_sync_at: new Date().toISOString(),
    };
    // Limpiar nulls/empty arrays (excepto apollo_data + last_apollo_sync_at que siempre van)
    const cleaned = Object.fromEntries(
      Object.entries(update).filter(([k, v]) => {
        if (k === "apollo_data" || k === "last_apollo_sync_at") return true;
        return v != null && (!Array.isArray(v) || v.length > 0);
      })
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
 * Generic emails que NO consideramos leads calificados.
 * Si Apollo devuelve uno de estos al hacer reveal, lo guardamos pero NO lo marcamos
 * como decision-maker y NO suma como "contacto válido".
 */
const GENERIC_EMAIL_PREFIXES = [
  "info", "contacto", "contact", "hello", "hola", "admin", "soporte", "support",
  "ventas", "sales", "marketing", "rrhh", "hr", "jobs", "press", "comercial",
  "atencion", "atencionalcliente", "no-reply", "noreply", "donotreply",
];

function isGenericEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const local = email.split("@")[0]?.toLowerCase() || "";
  return GENERIC_EMAIL_PREFIXES.some((p) => local === p || local.startsWith(`${p}.`) || local.startsWith(`${p}@`));
}

/**
 * Decision-maker detection por título — funciona incluso cuando Apollo no
 * popula `seniority` (común en PYMEs argentinas).
 */
function detectDecisionMaker(title: string | null | undefined, seniority?: string | null): boolean {
  if (seniority) {
    const s = seniority.toLowerCase();
    if (["c_suite", "founder", "owner", "partner", "head", "vp", "director"].includes(s)) {
      return true;
    }
  }
  if (!title) return false;
  const t = title.toLowerCase();
  const kws = [
    "ceo", "cto", "coo", "cfo", "cmo", "cio", "chief", "founder", "fundador",
    "co-founder", "cofounder", "owner", "dueño", "duena",
    "president", "presidente", "vp ", "vice president",
    "director", "directora", "head of", "gerente general", "general manager",
    "managing director", "partner", "socio", "socia",
  ];
  return kws.some((kw) => t.includes(kw));
}

/**
 * Score 0..1 por título para priorizar quiénes revelar primero (más cred efficient).
 */
function titleScore(title: string | null | undefined): number {
  if (!title) return 0.3;
  const t = title.toLowerCase();
  if (/(ceo|founder|fundador|owner|dueñ|president|chief executive)/.test(t)) return 1.0;
  if (/(cto|cmo|cfo|coo|cio|chief|managing director)/.test(t)) return 0.9;
  if (/(director|head of|vp |vice president|general manager|gerente general)/.test(t)) return 0.8;
  if (/(manager|gerente|lead|jefe)/.test(t)) return 0.5;
  if (/(senior|sr\.|principal)/.test(t)) return 0.4;
  return 0.3;
}

/**
 * Buscar decision makers en Apollo people search (api_search) + revelar email
 * vía /people/match. Solo cobramos crédito por reveal exitoso.
 *
 * Flow:
 *   1. POST /mixed_people/api_search por organization_id → lista ofuscada (free).
 *   2. Filtrar por título decisional + has_email=true.
 *   3. Por cada uno, POST /people/match con reveal_personal_emails=true (1 cred).
 *   4. Filtrar emails genéricos (info@, contacto@...).
 *   5. UPSERT en company_contacts.
 */
export async function fetchContactsAction(
  orgSlug: string,
  companyId: string,
  opts?: { max?: number }
) {
  const user = await requireAuth();
  await requireOrgMembership(orgSlug, user.id);

  const svc = createSupabaseServiceClient();
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) return { error: "APOLLO_API_KEY no configurada" };

  const max = Math.min(opts?.max ?? 5, 10);

  const { data: company } = await svc
    .from("companies")
    .select("id, apollo_id, dominio")
    .eq("id", companyId)
    .single();
  if (!company) return { error: "Empresa no encontrada" };
  if (!company.apollo_id) return { error: "Empresa sin apollo_id — no se puede buscar contactos" };

  // Budget check — capamos a max créditos
  const ym = new Date().toISOString().slice(0, 7);
  const [{ data: cfg }, { data: usage }] = await Promise.all([
    svc.from("apollo_budget_config").select("*").limit(1).single(),
    svc.from("apollo_credit_usage_monthly").select("*").eq("year_month", ym).maybeSingle(),
  ]);
  if (cfg) {
    const used = (usage?.credits_used as number) || 0;
    const cap = (Number(cfg.monthly_budget_credits) * Number(cfg.hard_stop_pct)) / 100;
    if (used + max > cap) {
      return { error: `Budget Apollo casi agotado (${used}/${cap}). Esperá al próximo ciclo.` };
    }
  }

  try {
    // STEP 1 — listado ofuscado, gratis. Sin filtros de seniority (en PYMEs argentinas
    // Apollo no la popula). Traemos hasta 25 y filtramos en código.
    const searchRes = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers: {
        "X-Api-Key": apolloKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        organization_ids: [company.apollo_id],
        page: 1,
        per_page: 25,
      }),
    });
    if (!searchRes.ok) {
      const txt = await searchRes.text();
      return { error: `Apollo search ${searchRes.status}: ${txt.slice(0, 200)}` };
    }
    const searchData = await searchRes.json();
    const allPeople: any[] = searchData.people || [];

    if (allPeople.length === 0) {
      return { error: "Apollo no tiene personas indexadas para esta empresa" };
    }

    // STEP 2 — priorizar candidatos: score por título × has_email, top `max`.
    // Estrategia con fallback: primero intentamos decisores (score >= 0.5).
    // Si no hay ninguno, traemos los disponibles de menor a mayor score,
    // priorizando los que tienen email — para que el usuario al menos tenga
    // contactos en lugar de un error.
    const scored = allPeople
      .map((p) => ({
        person: p,
        score: titleScore(p.title) * (p.has_email ? 1 : 0.2),
      }))
      .sort((a, b) => b.score - a.score);

    let usedFallback = false;
    let ranked = scored.filter((x) => x.score >= 0.5).slice(0, max);
    if (ranked.length === 0 && scored.length > 0) {
      // Fallback: traer los disponibles (prioriza has_email)
      ranked = scored.slice(0, max);
      usedFallback = true;
    }

    if (ranked.length === 0) {
      return {
        error: `Apollo no tiene personas con datos suficientes para esta empresa (${allPeople.length} indexadas, ninguna con título ni email)`,
      };
    }

    // STEP 3 — reveal en paralelo (cada uno cuesta 1 cred, ya capado por `max`)
    const revealed = await Promise.all(
      ranked.map(async (r) => {
        try {
          const matchRes = await fetch("https://api.apollo.io/api/v1/people/match", {
            method: "POST",
            headers: {
              "X-Api-Key": apolloKey,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              id: r.person.id,
              reveal_personal_emails: true,
              reveal_phone_number: false,
            }),
          });
          if (!matchRes.ok) return { ok: false, person: r.person, error: matchRes.status };
          const matchData = await matchRes.json();
          return { ok: true, person: r.person, match: matchData.person || {} };
        } catch (e: any) {
          return { ok: false, person: r.person, error: e?.message || "fetch_error" };
        }
      })
    );

    // STEP 4 — upsert
    let creditsConsumed = 0;
    let validContacts = 0;
    let genericContacts = 0;
    const now = new Date().toISOString();

    for (const r of revealed) {
      if (!r.ok || !r.match) continue;
      const m: any = r.match;

      const fullName =
        m.name ||
        [m.first_name, m.last_name].filter(Boolean).join(" ") ||
        [r.person.first_name, r.person.last_name].filter(Boolean).join(" ") ||
        "(sin nombre)";

      const email = m.email || null;
      const generic = isGenericEmail(email);

      // Apollo cobra 1 cred si nos da email (genérico o no)
      if (email) creditsConsumed++;

      const row = {
        company_id: companyId,
        apollo_person_id: r.person.id as string,
        full_name: fullName,
        title: m.title || r.person.title || null,
        email,
        email_status: m.email_status || null,
        linkedin_url: m.linkedin_url || r.person.linkedin_url || null,
        phone: m.sanitized_phone || null,
        is_decision_maker: !generic && detectDecisionMaker(m.title || r.person.title, m.seniority || r.person.seniority),
        source: "apollo",
        last_synced_at: now,
      };

      const { data: existing } = await svc
        .from("company_contacts")
        .select("id")
        .eq("company_id", companyId)
        .eq("apollo_person_id", row.apollo_person_id)
        .maybeSingle();
      if (existing) {
        await svc.from("company_contacts").update(row).eq("id", existing.id);
      } else {
        await svc.from("company_contacts").insert(row);
      }

      if (generic) genericContacts++;
      else if (email) validContacts++;
    }

    // Record credits
    if (creditsConsumed > 0) {
      if (usage) {
        await svc
          .from("apollo_credit_usage_monthly")
          .update({
            credits_used: (usage.credits_used as number) + creditsConsumed,
            last_sync_at: now,
          })
          .eq("id", usage.id);
      } else {
        await svc
          .from("apollo_credit_usage_monthly")
          .insert({ year_month: ym, credits_used: creditsConsumed, last_sync_at: now });
      }
    }

    revalidatePath(`/${orgSlug}/companies/${companyId}`);
    return {
      success: true,
      total_in_apollo: allPeople.length,
      ranked_for_reveal: ranked.length,
      revealed: revealed.length,
      valid_contacts: validContacts,
      generic_contacts: genericContacts,
      credits: creditsConsumed,
      fallback_used: usedFallback,
    };
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

/**
 * Calificar empresa: enrich + contactos + brief en una sola pasada (1 click).
 *
 * Ejecuta en serie, devuelve un resumen step-by-step. Diseñado para el botón
 * principal del detalle.
 *
 * Costo total: 2-6 créditos Apollo (1 enrich + N contactos) + ~$0.003 Claude.
 */
export async function qualifyCompanyAction(
  orgSlug: string,
  companyId: string,
  opts?: { maxContacts?: number; skipBrief?: boolean }
) {
  const user = await requireAuth();
  await requireOrgMembership(orgSlug, user.id);

  const svc = createSupabaseServiceClient();
  const { data: company } = await svc
    .from("companies")
    .select("id, sector, ai_brief")
    .eq("id", companyId)
    .single();
  if (!company) return { error: "Empresa no encontrada" };

  const steps: { name: string; ok: boolean; detail: string }[] = [];

  // 1) Enrich (si falta sector)
  if (!company.sector) {
    const r = await enrichCompanyAction(orgSlug, companyId);
    if (r?.error) steps.push({ name: "enrich", ok: false, detail: r.error });
    else steps.push({ name: "enrich", ok: true, detail: "sector + headcount + ciudad + tech" });
  } else {
    steps.push({ name: "enrich", ok: true, detail: "ya estaba (skip)" });
  }

  // 2) Signals (gratis, Google News) — autopopulate antes de contactos
  try {
    const sg = await fetchSignalsForCompanyAction(orgSlug, companyId);
    if (sg && !sg.error) {
      steps.push({
        name: "signals",
        ok: true,
        detail: sg.inserted ? `${sg.inserted} signal${sg.inserted !== 1 ? "s" : ""} nueva${sg.inserted !== 1 ? "s" : ""}` : "sin novedades en Google News",
      });
    } else {
      steps.push({ name: "signals", ok: false, detail: sg?.error || "no se pudo" });
    }
  } catch (e: any) {
    steps.push({ name: "signals", ok: false, detail: e?.message || "error" });
  }

  // 3) Contactos
  const c = await fetchContactsAction(orgSlug, companyId, { max: opts?.maxContacts ?? 5 });
  if (c?.error) {
    steps.push({ name: "contactos", ok: false, detail: c.error });
  } else {
    const parts: string[] = [];
    if (c.valid_contacts) parts.push(`${c.valid_contacts} válido${c.valid_contacts !== 1 ? "s" : ""}`);
    if (c.generic_contacts) parts.push(`${c.generic_contacts} genérico${c.generic_contacts !== 1 ? "s" : ""}`);
    if (c.credits) parts.push(`${c.credits} créd`);
    steps.push({
      name: "contactos",
      ok: (c.valid_contacts || 0) > 0,
      detail: parts.join(" · ") || `Apollo tiene ${c.total_in_apollo ?? 0} pero ninguna decisional`,
    });
  }

  // 3) Brief (skipeable). Requiere sector poblado.
  if (!opts?.skipBrief) {
    const { data: now } = await svc.from("companies").select("sector, ai_brief").eq("id", companyId).single();
    if (now?.sector && !now.ai_brief) {
      const b = await generateBriefAction(orgSlug, companyId);
      if (b?.error) steps.push({ name: "brief", ok: false, detail: b.error });
      else steps.push({ name: "brief", ok: true, detail: "Claude Sonnet" });
    } else if (now?.ai_brief) {
      steps.push({ name: "brief", ok: true, detail: "ya tenía (skip)" });
    } else {
      steps.push({ name: "brief", ok: false, detail: "enrich falló → sin sector" });
    }
  }

  revalidatePath(`/${orgSlug}/companies/${companyId}`);
  return { success: true, steps };
}
