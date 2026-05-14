"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateSearchAction, deleteSearchAction } from "../actions";

export function EditSearchForm({
  orgSlug,
  searchId,
  initial,
  canDelete,
}: {
  orgSlug: string;
  searchId: string;
  initial: any;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const fit = initial.filters?.fit || {};

  async function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateSearchAction(orgSlug, searchId, formData);
      if (result?.error) toast.error(result.error);
    });
  }

  function onDelete() {
    if (!confirm("¿Borrar esta search definitivamente? Las empresas en el radar quedan pero pierden el link a esta search.")) return;
    startDelete(async () => {
      const result = await deleteSearchAction(orgSlug, searchId);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <form action={onSubmit} className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Nombre y descripción</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" defaultValue={initial.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="llm_filter_text">ICP description (LLM filter)</Label>
            <Textarea id="llm_filter_text" name="llm_filter_text" rows={3} defaultValue={initial.llm_filter_text || ""} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial.active} />
            Search activa (se evalúa contra nuevos signals)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fit · criterios</CardTitle>
          <CardDescription>Filtros sobre el universo</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Headcount min</Label>
            <Input name="headcount_min" type="number" defaultValue={fit.headcount_min || ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Headcount max</Label>
            <Input name="headcount_max" type="number" defaultValue={fit.headcount_max || ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Founded year min</Label>
            <Input name="founded_year_min" type="number" defaultValue={fit.founded_year_min || ""} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="alert_enabled" defaultChecked={initial.alert_enabled} />
            Email cuando aparezcan matches nuevos
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="alert_email">Email destino</Label>
            <Input id="alert_email" name="alert_email" type="email" defaultValue={initial.alert_email || ""} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        {canDelete ? (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Borrar search
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
