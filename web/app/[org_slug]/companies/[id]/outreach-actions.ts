"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";

// RFC 5322-ish validation. No es 100% pero capta el 99% de errores reales sin
// requerir librería externa. Apollo a veces devuelve email_not_unlocked@domain.com
// que querríamos rechazar igual.
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  if (email.length > 254) return false;
  if (email.includes("email_not_unlocked")) return false;
  return EMAIL_RE.test(email);
}

/**
 * Genera un draft de email de outreach personalizado con Claude.
 * No envía nada — solo crea un row en outreach_messages con status='draft'.
 */
export async function generateOutreachDraftAction(
  orgSlug: string,
  companyId: string,
  contactId: string
) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(orgSlug, user.id);

  const svc = createSupabaseServiceClient();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  if (!apiKey) return { error: "ANTHROPIC_API_KEY no configurada" };

  // Fetch company + contact + signals recientes
  const [companyRes, contactRes, signalsRes] = await Promise.all([
    svc.from("companies").select("*").eq("id", companyId).single(),
    svc.from("company_contacts").select("*").eq("id", contactId).eq("company_id", companyId).single(),
    svc.from("signals").select("type, data, occurred_at, intent_weight").eq("company_id", companyId).order("occurred_at", { ascending: false }).limit(5),
  ]);

  const company = companyRes.data;
  const contact = contactRes.data;
  if (!company) return { error: "Empresa no encontrada" };
  if (!contact) return { error: "Contacto no encontrado" };
  if (!contact.email) return { error: "El contacto no tiene email — no se puede generar outreach" };

  const signalsText = (signalsRes.data || [])
    .map((s: any) => {
      const cat = s.data?.category || s.type;
      const title = s.data?.title || "(sin título)";
      return `- ${cat}: ${title}`;
    })
    .join("\n") || "(sin signals recientes)";

  const userPrompt = `Generá un email de outreach personalizado para:

CONTACTO:
- ${contact.full_name} · ${contact.title || "(rol no conocido)"}
- Email: ${contact.email}
- Decision maker: ${contact.is_decision_maker ? "Sí" : "No"}

EMPRESA:
- ${company.razon_social} · ${company.dominio || ""}
- Sector: ${company.sector || "?"} · ${company.subsector || ""}
- Tamaño: ${company.headcount_range || "?"} empleados · fundada ${company.founded_year || "?"}
- Ubicación: ${[company.location_ciudad, company.location_provincia].filter(Boolean).join(", ")}
- Growth 12m: ${company.organization_headcount_twelve_month_growth != null ? `${(company.organization_headcount_twelve_month_growth * 100).toFixed(1)}%` : "?"}
- Tech stack: ${Array.isArray(company.tech_stack) ? company.tech_stack.slice(0, 8).join(", ") : "—"}
- Apollo intent: ${company.intent_strength || "n/a"}

AI BRIEF:
${company.ai_brief || "(sin brief generado)"}

SIGNALS RECIENTES:
${signalsText}

Generá el email siguiendo el formato del system prompt. Devolvé SOLO un JSON válido con "subject" y "body".`;

  const systemPrompt = `Sos Mariano Noceti, founder de Yacaré (estudio de diseño + desarrollo digital + IA para PYMEs argentinas).

Escribís emails de outreach B2B en castellano rioplatense. Reglas:
1. Asunto corto y específico (no genérico tipo "Propuesta" o "Hola"). Hace referencia a algo concreto de la empresa (un signal reciente, su growth, su sector, su tech stack).
2. Cuerpo: 3-5 párrafos cortos. Sin marketing-speak.
3. Apertura: una observación específica sobre la empresa o la persona (algo que demuestre que investigaste). NO empezar con "espero que estés bien" o "te escribo porque...".
4. Cuerpo: una hipótesis concreta de cómo Yacaré le podría ayudar (basada en su sector + signals + tech stack). No vender humo. Ejemplos de servicios Yacaré: rediseño de productos web, integraciones IA, automatización de operaciones, MVPs.
5. CTA: una pregunta específica + propuesta de 15 min de call esta semana.
6. Firma simple: "Saludos, Mariano".

Si no hay datos suficientes para un email personalizado, devolvé un draft genérico pero indicálo en el subject (e.g. "[BORRADOR — agregá contexto]: ...").

Tu respuesta debe ser SOLO un JSON válido con la estructura:
{"subject": "...", "body": "..."}`;

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
        // 600 alcanza para email outreach 3-5 párrafos + JSON wrapping. Si Claude
        // se queda corto, el frontend muestra warning y se puede regenerar.
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!apiRes.ok) {
      const err = await apiRes.text();
      return { error: `Anthropic ${apiRes.status}: ${err.slice(0, 200)}` };
    }
    const body = await apiRes.json();
    const raw = (body.content || []).map((b: any) => b.text || "").join("\n").trim();
    let parsed: { subject?: string; body?: string };
    try {
      // Claude a veces devuelve el JSON dentro de un code fence
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : raw);
    } catch {
      return { error: "Claude no devolvió JSON válido. Raw: " + raw.slice(0, 200) };
    }
    const subject = parsed.subject?.trim() || "(sin asunto)";
    const emailBody = parsed.body?.trim() || "(sin contenido)";

    // Persist como draft
    const { data: draft, error: insErr } = await svc
      .from("outreach_messages")
      .insert({
        org_id: org.id,
        company_id: companyId,
        contact_id: contactId,
        to_email: contact.email,
        to_name: contact.full_name,
        subject,
        body: emailBody,
        status: "draft",
        generated_by_user_id: user.id,
        ai_model: model,
        context_data: {
          signals_used: (signalsRes.data || []).length,
          has_brief: Boolean(company.ai_brief),
          contact_title: contact.title,
        },
      })
      .select("id")
      .single();

    if (insErr) return { error: insErr.message };

    revalidatePath(`/${orgSlug}/companies/${companyId}`);
    return { success: true, draft_id: draft.id, subject, body: emailBody };
  } catch (e: any) {
    return { error: e?.message || "Error desconocido" };
  }
}

/**
 * Envía un draft existente vía Resend.
 */
export async function sendOutreachDraftAction(orgSlug: string, draftId: string) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(orgSlug, user.id);

  const svc = createSupabaseServiceClient();
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "leads@yacare.io";
  const fromName = process.env.RESEND_FROM_NAME || "Mariano Noceti · Yacaré";
  if (!resendKey) return { error: "RESEND_API_KEY no configurada" };

  const { data: draft } = await svc
    .from("outreach_messages")
    .select("*")
    .eq("id", draftId)
    .eq("org_id", org.id)
    .single();
  if (!draft) return { error: "Draft no encontrado" };
  if (draft.status !== "draft") return { error: `El draft ya está en estado ${draft.status}` };
  if (!isValidEmail(draft.to_email as string)) {
    await svc.from("outreach_messages").update({ status: "failed" }).eq("id", draftId);
    return { error: `Email destinatario inválido: ${draft.to_email}` };
  }

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [draft.to_email],
        subject: draft.subject,
        text: draft.body,
        reply_to: user.email || undefined,
      }),
    });
    if (!resendRes.ok) {
      const err = await resendRes.text();
      await svc.from("outreach_messages").update({ status: "failed" }).eq("id", draftId);
      return { error: `Resend ${resendRes.status}: ${err.slice(0, 200)}` };
    }
    const respBody = await resendRes.json();
    await svc
      .from("outreach_messages")
      .update({
        status: "sent",
        sent_via: "resend",
        sent_at: new Date().toISOString(),
        resend_message_id: respBody.id || null,
      })
      .eq("id", draftId);

    revalidatePath(`/${orgSlug}/companies/${draft.company_id}`);
    return { success: true, message_id: respBody.id };
  } catch (e: any) {
    return { error: e?.message || "Error desconocido" };
  }
}

/**
 * Actualizar el draft editado por el usuario antes de enviar.
 */
export async function updateOutreachDraftAction(
  orgSlug: string,
  draftId: string,
  patch: { subject?: string; body?: string }
) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(orgSlug, user.id);

  const svc = createSupabaseServiceClient();
  const update: Record<string, string> = {};
  if (patch.subject !== undefined) update.subject = patch.subject;
  if (patch.body !== undefined) update.body = patch.body;
  if (Object.keys(update).length === 0) return { success: true };

  const { data: draft } = await svc
    .from("outreach_messages")
    .select("id, status")
    .eq("id", draftId)
    .eq("org_id", org.id)
    .single();
  if (!draft) return { error: "Draft no encontrado" };
  if (draft.status !== "draft") return { error: `No se puede editar — está en estado ${draft.status}` };

  await svc.from("outreach_messages").update(update).eq("id", draftId);
  return { success: true };
}
