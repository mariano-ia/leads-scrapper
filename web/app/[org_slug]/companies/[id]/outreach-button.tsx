"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Send, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  generateOutreachDraftAction,
  sendOutreachDraftAction,
  updateOutreachDraftAction,
} from "./outreach-actions";

export function OutreachButton({
  orgSlug,
  companyId,
  contactId,
  toEmail,
}: {
  orgSlug: string;
  companyId: string;
  contactId: string;
  toEmail: string;
}) {
  const [generating, startGen] = useTransition();
  const [sending, startSend] = useTransition();
  const [draft, setDraft] = useState<{ id: string; subject: string; body: string } | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  function handleGenerate() {
    startGen(async () => {
      const result = await generateOutreachDraftAction(orgSlug, companyId, contactId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setDraft({ id: result.draft_id, subject: result.subject, body: result.body });
      setEditSubject(result.subject);
      setEditBody(result.body);
      toast.success("Draft generado · revisalo antes de enviar");
    });
  }

  async function persistEdits() {
    if (!draft) return;
    if (editSubject !== draft.subject || editBody !== draft.body) {
      await updateOutreachDraftAction(orgSlug, draft.id, { subject: editSubject, body: editBody });
      setDraft({ ...draft, subject: editSubject, body: editBody });
    }
  }

  function handleSendResend() {
    if (!draft) return;
    if (!confirm("Enviar este email vía Resend a " + toEmail + "?")) return;
    startSend(async () => {
      await persistEdits();
      const result = await sendOutreachDraftAction(orgSlug, draft.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Email enviado · message_id " + (result.message_id || "?"));
      setDraft(null);
    });
  }

  function mailtoHref() {
    if (!draft) return "#";
    const sp = new URLSearchParams({ subject: editSubject, body: editBody });
    return `mailto:${toEmail}?${sp.toString()}`;
  }

  if (!draft) {
    return (
      <Button
        onClick={handleGenerate}
        disabled={generating}
        size="sm"
        variant="ghost"
        title="Genera un email personalizado con Claude usando empresa, contacto, brief y signals recientes"
      >
        {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
        {generating ? "Generando…" : "Generar email"}
      </Button>
    );
  }

  return (
    <div className="border rounded-md p-3 space-y-2 bg-muted/20 w-full">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Asunto</label>
        <input
          value={editSubject}
          onChange={(e) => setEditSubject(e.target.value)}
          className="w-full px-2 py-1 text-sm border rounded"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Cuerpo</label>
        <textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          rows={10}
          className="w-full px-2 py-1 text-sm border rounded font-sans"
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={handleSendResend} disabled={sending} size="sm" variant="default">
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Enviar via Resend
        </Button>
        <a href={mailtoHref()} target="_blank" rel="noopener" onClick={persistEdits}>
          <Button size="sm" variant="outline">
            <ExternalLink className="h-3 w-3" /> Abrir en mi cliente de mail
          </Button>
        </a>
        <Button onClick={() => setDraft(null)} size="sm" variant="ghost">
          Descartar
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Draft guardado · podés editarlo libremente antes de enviar. "Resend" manda desde {process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL || "leads@yacare.io"} con reply-to a vos.
      </p>
    </div>
  );
}
