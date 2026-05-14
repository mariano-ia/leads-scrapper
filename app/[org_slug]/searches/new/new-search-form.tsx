"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSearchAction } from "../actions";

export function NewSearchForm({ orgSlug }: { orgSlug: string }) {
  const [pending, startTransition] = useTransition();

  async function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createSearchAction(orgSlug, formData);
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
            <Input id="name" name="name" placeholder="ej. PYMEs IT en CABA con growth alto" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="llm_filter_text">ICP description (para LLM filter)</Label>
            <Textarea
              id="llm_filter_text"
              name="llm_filter_text"
              rows={3}
              placeholder="Describí el perfil ideal en lenguaje natural. Ej: 'PYMEs de servicios profesionales en CABA con presencia digital limitada y equipo de 30-80 personas en proceso de profesionalización.'"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fit · criterios de empresa</CardTitle>
          <CardDescription>Filtros sobre el universo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Headcount min</Label>
            <Input name="headcount_min" type="number" placeholder="10" defaultValue="10" />
          </div>
          <div className="space-y-1.5">
            <Label>Headcount max</Label>
            <Input name="headcount_max" type="number" placeholder="500" defaultValue="500" />
          </div>
          <div className="space-y-1.5">
            <Label>Founded year min</Label>
            <Input name="founded_year_min" type="number" placeholder="2010" defaultValue="2010" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertas por email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="alert_enabled" defaultChecked /> Notificarme cuando aparezcan matches nuevos
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="alert_email">Email para alertas</Label>
            <Input id="alert_email" name="alert_email" type="email" placeholder="vos@yacare.io" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Crear search
        </Button>
      </div>
    </form>
  );
}
