"use client";

import { useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveOrgUniverseTargetAction } from "./actions";

interface Config {
  industries_any?: string[];
  industries_none?: string[];
  headcount_min?: number | null;
  headcount_max?: number | null;
  founded_year_min?: number | null;
  founded_year_max?: number | null;
  provincias_any?: string[];
  technologies_any?: string[];
  technologies_none?: string[];
}

export function UniverseEditor({
  orgSlug,
  initial,
  canEdit,
}: {
  orgSlug: string;
  initial: Config;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  async function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveOrgUniverseTargetAction(orgSlug, formData);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`Nueva versión guardada (v${result.version})`);
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return canEdit ? (
      <Button onClick={() => setEditing(true)} variant="outline" size="sm">
        Editar target
      </Button>
    ) : null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Editar target de la org</CardTitle>
        <CardDescription>Cada cambio crea una nueva versión. La anterior queda como histórico.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="headcount_min">Headcount mínimo</Label>
              <Input id="headcount_min" name="headcount_min" type="number" defaultValue={initial.headcount_min || ""} placeholder="10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="headcount_max">Headcount máximo</Label>
              <Input id="headcount_max" name="headcount_max" type="number" defaultValue={initial.headcount_max || ""} placeholder="500" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="founded_year_min">Fundada desde</Label>
              <Input id="founded_year_min" name="founded_year_min" type="number" defaultValue={initial.founded_year_min || ""} placeholder="2005" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="founded_year_max">Fundada hasta</Label>
              <Input id="founded_year_max" name="founded_year_max" type="number" defaultValue={initial.founded_year_max || ""} placeholder="(sin límite)" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provincias">Provincias (separadas por coma)</Label>
            <Input id="provincias" name="provincias" defaultValue={(initial.provincias_any || []).join(", ")} placeholder="CABA, PBA, Córdoba" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="industries_any">Industrias incluidas (separadas por coma, snake_case)</Label>
            <Textarea
              id="industries_any"
              name="industries_any"
              rows={2}
              defaultValue={(initial.industries_any || []).join(", ")}
              placeholder="information_technology_and_services, marketing_and_advertising, retail"
            />
            <p className="text-xs text-muted-foreground">
              Si está vacío, se aplica el filtro del universo maestro (~15 sectores Yacaré).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="industries_none">Industrias excluidas (separadas por coma)</Label>
            <Input id="industries_none" name="industries_none" defaultValue={(initial.industries_none || []).join(", ")} placeholder="" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="technologies_any">Tecnologías que tiene que tener (any)</Label>
            <Input id="technologies_any" name="technologies_any" defaultValue={(initial.technologies_any || []).join(", ")} placeholder="WordPress, Shopify" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="technologies_none">Tecnologías que NO debe tener</Label>
            <Input id="technologies_none" name="technologies_none" defaultValue={(initial.technologies_none || []).join(", ")} placeholder="Salesforce" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Guardar nueva versión
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
