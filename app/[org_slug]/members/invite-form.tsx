"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInvitationAction, cancelInvitationAction } from "./invite-actions";

export function InviteForm({ orgSlug }: { orgSlug: string }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createInvitationAction(orgSlug, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Invitación enviada");
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="flex gap-2 items-end flex-wrap">
      <div className="flex-1 min-w-[200px] space-y-1">
        <label className="text-xs text-muted-foreground">Email del invitado</label>
        <Input name="email" type="email" placeholder="persona@empresa.com" required />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Rol</label>
        <select name="role" defaultValue="member" className="h-9 px-2 text-sm border rounded-md bg-background">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
        Invitar
      </Button>
    </form>
  );
}

export function CancelInvitationButton({ orgSlug, invitationId }: { orgSlug: string; invitationId: string }) {
  const [pending, startTransition] = useTransition();
  function onClick() {
    if (!confirm("Cancelar esta invitación?")) return;
    startTransition(async () => {
      const result = await cancelInvitationAction(orgSlug, invitationId);
      if (result?.error) toast.error(result.error);
      else toast.success("Invitación cancelada");
    });
  }
  return (
    <Button onClick={onClick} disabled={pending} size="sm" variant="ghost">
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancelar"}
    </Button>
  );
}
