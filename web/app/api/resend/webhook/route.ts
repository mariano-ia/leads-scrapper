/**
 * Webhook de Resend para tracking de outreach.
 *
 * Eventos que escuchamos (configurar en https://resend.com/webhooks):
 *  - email.delivered → status='sent' (ya lo marcamos al mandar, esto confirma)
 *  - email.bounced → status='bounced'
 *  - email.complained → status='bounced'
 *  - email.failed → status='failed'
 *  - email.opened → no cambia status, podríamos contar opens en context_data
 *  - email.clicked → idem
 *
 * Autenticación: header X-Resend-Webhook-Secret debe matchear RESEND_WEBHOOK_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const expected = process.env.RESEND_WEBHOOK_SECRET;
  if (expected) {
    const got = req.headers.get("x-resend-webhook-secret") || req.headers.get("svix-signature") || "";
    if (got !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = await req.json();
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
      // Unknown event — store anyway in context
      break;
  }

  const update: Record<string, any> = { context_data: newContext };
  if (newStatus && newStatus !== outreach.status) update.status = newStatus;
  await svc.from("outreach_messages").update(update).eq("id", outreach.id);

  return NextResponse.json({ ok: true, status: newStatus || outreach.status });
}
