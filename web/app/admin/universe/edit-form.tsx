"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { publishUniverseVersionAction, rollbackUniverseVersionAction } from "./universe-actions";

export function UniverseEditForm({ currentConfig }: { currentConfig: any }) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    if (!confirm("Publicar una nueva versión activa? La anterior se conserva como historial.")) return;
    startTransition(async () => {
      const result = await publishUniverseVersionAction(formData);
      if (result?.error) toast.error(result.error);
      else toast.success(`Versión v${result.version} publicada y activa`);
    });
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>País</Label>
          <Input name="location_country" defaultValue={currentConfig.location_country || "Argentina"} />
        </div>
        <div className="space-y-1.5">
          <Label>Max companies target</Label>
          <Input name="max_companies_target" type="number" defaultValue={currentConfig.max_companies_target || 50000} />
        </div>
        <div className="space-y-1.5">
          <Label>Headcount min</Label>
          <Input name="headcount_min" type="number" defaultValue={currentConfig.headcount_min || 11} />
        </div>
        <div className="space-y-1.5">
          <Label>Headcount max</Label>
          <Input name="headcount_max" type="number" defaultValue={currentConfig.headcount_max || 500} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Founded year min (opcional)</Label>
          <Input name="founded_year_min" type="number" defaultValue={currentConfig.founded_year_min || ""} placeholder="ej. 2005" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Industries incluidas (una por línea o separadas por coma)</Label>
        <Textarea name="industries" rows={4} defaultValue={(currentConfig.industries || []).join(", ")} placeholder="software, marketing, retail, ..." />
      </div>
      <div className="space-y-1.5">
        <Label>Industries excluidas</Label>
        <Input name="exclude_industries" defaultValue={(currentConfig.exclude_industries || []).join(", ")} placeholder="oil_and_gas, defense, ..." />
      </div>
      <div className="space-y-1.5">
        <Label>Keywords any (opcional)</Label>
        <Input name="keywords_any" defaultValue={(currentConfig.keywords_any || []).join(", ")} placeholder="saas, marketplace, ai-first, ..." />
      </div>
      <div className="space-y-1.5">
        <Label>Notas (opcional)</Label>
        <Textarea name="notes" rows={2} placeholder="Qué cambió en esta versión y por qué" />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Publicar nueva versión
        </Button>
      </div>
    </form>
  );
}

export function RollbackButton({ versionId, versionInt }: { versionId: string; versionInt: number }) {
  const [pending, startTransition] = useTransition();
  function onClick() {
    if (!confirm(`Restaurar v${versionInt} como versión activa?`)) return;
    startTransition(async () => {
      const result = await rollbackUniverseVersionAction(versionId);
      if (result?.error) toast.error(result.error);
      else toast.success(`v${result.version} ahora es activa`);
    });
  }
  return (
    <Button onClick={onClick} disabled={pending} size="sm" variant="outline">
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      Restaurar
    </Button>
  );
}
