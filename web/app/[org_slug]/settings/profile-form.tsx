"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileNameAction } from "./profile-actions";

export function ProfileForm({
  orgSlug,
  currentName,
  currentEmail,
}: {
  orgSlug: string;
  currentName: string;
  currentEmail: string;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateProfileNameAction(orgSlug, formData);
      if (result?.error) toast.error(result.error);
      else toast.success("Nombre actualizado");
    });
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre para mostrar</Label>
        <Input id="name" name="name" defaultValue={currentName} placeholder="Mariano Noceti" maxLength={80} />
        <p className="text-xs text-muted-foreground">
          Aparece en owner selects, notas, drafts de outreach. Si lo dejás vacío se usa tu email.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input defaultValue={currentEmail} disabled className="text-sm" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending && <Loader2 className="h-3 w-3 animate-spin" />}
        Guardar
      </Button>
    </form>
  );
}
