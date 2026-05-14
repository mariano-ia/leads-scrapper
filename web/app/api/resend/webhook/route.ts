/**
 * Webhook de Resend para tracking de outreach.
 *
 * Eventos:
 *  - email.delivered → status='sent'
 *  - email.bounced / email.complained → status='bounced'
 *  - email.failed → status='failed'
 *  - email.opened → cuenta opens en context_data
 *  - email.clicked → cuenta clicks en context_data
 *
 * Resend usa Svix para firmar webhooks (HMAC-SHA256). Verificamos la firma
 * con el SDK oficial — no comparamos strings directamente (defensa contra
 * timing attacks + replay).
 *
 * Configurar en https://resend.com/webhooks:
 *  - URL: https://<vercel-domain>/api/resend/webhook
 *  - Signing secret: copiar a env RESEND_WEBHOOK_SECRET
 */
import { NextRequest, NextResponse } from "next/server";
import { Webhook, WebhookVerificationError } from "svix";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Sin secret configurado → rechazamos en prod, dejamos pasar solo en dev local.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "webhook_secret_not_configured" }, { status: 500 });
    }
  }

  const rawBody = await req.text();

  // Verificación Svix HMAC-SHA256 (constant-time)
  if (secret) {
    try {
      const wh = new Webhook(secret);
      const headers = {
        "svix-id": req.headers.get("svix-id") || "",
        "svix-timestamp": req.headers.get("svix-timestamp") || "",
        "svix-signature": req.headers.get("svix-signature") || "",
      };
      wh.verify(rawBody, headers);
    } catch (e) {
      if (e instanceof WebhookVerificationError) {
        return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
      }
      return NextResponse.json({ error: "verification_failed" }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const type: string = body?.type || body?.event || "";
  const data = body?.data || {};
  const messageId = data?.email_id || data?.id || body?.data?.email_id;
  if (!type || !messageId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const svc = createSupabaseServiceClient();
  const { data: outreach } = await svc
    .from("outreach_messages")
    .select("id, context_data, status")
    .eq("resend_message_id", messageId)
    .maybeSingle();
  if (!outreach) {
    return NextResponse.json({ ok: true, message: "no matching outreach row" });
  }

  const newContext = {
    ...(outreach.context_data || {}),
    last_event: type,
    last_event_at: new Date().toISOString(),
  };

  let newStatus: string | null = null;
  switch (type) {
    case "email.delivered":
      newStatus = outreach.status === "draft" ? "sent" : outreach.status;
      break;
    case "email.bounced":
    case "email.complained":
      newStatus = "bounced";
      break;
    case "email.failed":
      newStatus = "failed";
      break;
    case "email.opened":
      newContext.opens = (Number(newContext.opens) || 0) + 1;
      break;
    case "email.clicked":
      newContext.clicks = (Number(newContext.clicks) || 0) + 1;
      break;
    default:
      break;
  }

  const update: Record<string, any> = { context_data: newContext };
  if (newStatus && newStatus !== outreach.status) update.status = newStatus;
  await svc.from("outreach_messages").update(update).eq("id", outreach.id);

  return NextResponse.json({ ok: true, status: newStatus || outreach.status });
}
