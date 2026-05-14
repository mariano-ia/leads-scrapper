"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { addNoteAction } from "@/app/[org_slug]/radar/actions";
import { initials, timeAgo } from "@/lib/utils";

interface Note {
  id: string;
  content: string;
  created_at: string;
  author_email?: string;
}

export function NotesPanel({
  orgSlug,
  companyId,
  initialNotes,
}: {
  orgSlug: string;
  companyId: string;
  initialNotes: Note[];
}) {
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const text = (formData.get("content") as string)?.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await addNoteAction(orgSlug, companyId, text);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Nota agregada");
        setContent("");
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <form action={onSubmit} className="space-y-2">
          <Textarea
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Agregar nota (research, conversación, decisión...). Visible para el equipo de la org."
            rows={3}
            required
            minLength={1}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending || !content.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
              {pending ? "Agregando..." : "Agregar nota"}
            </Button>
          </div>
        </form>

        {initialNotes.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            Sin notas todavía. Sé el primero en agregar contexto sobre esta empresa.
          </p>
        ) : (
          <div className="space-y-3 divide-y">
            {initialNotes.map((n) => (
              <div key={n.id} className="pt-3 first:pt-0 flex gap-3">
                <Avatar className="h-7 w-7 mt-0.5">
                  <AvatarFallback className="text-[10px]">{initials(n.author_email)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{n.author_email || "?"}</span>
                    <span>·</span>
                    <span>{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{n.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
