"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rescoreRadarAction } from "./rescore-actions";

export function RescoreButton({ orgSlug }: { orgSlug: string }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!confirm("Recalcular scores de TODAS las empresas del radar?")) return;
    startTransition(async () => {
      const result = await rescoreRadarAction(orgSlug);
      if (result?.error) toast.error(result.error);
      else toast.success(`${result.updated ?? 0} empresas re-puntuadas`);
    });
  }

  return (
    <Button onClick={onClick} disabled={pending} size="sm" variant="outline" title="Recalcula fit/intent/combined para todas las empresas del radar usando los datos actuales (sector, headcount, growth, intent_strength, signals).">
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
      Rescore
    </Button>
  );
}
