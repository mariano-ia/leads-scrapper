"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchSignalsForCompanyAction } from "./signals-actions";

export function FetchSignalsButton({ orgSlug, companyId }: { orgSlug: string; companyId: string }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await fetchSignalsForCompanyAction(orgSlug, companyId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result.inserted === 0 && result.message) {
        toast.message(result.message);
      } else {
        toast.success(`${result.inserted} signal${result.inserted !== 1 ? "s" : ""} nueva${result.inserted !== 1 ? "s" : ""}${result.skipped ? ` · ${result.skipped} dup` : ""}`);
      }
    });
  }

  return (
    <Button onClick={onClick} disabled={pending} size="sm" variant="outline" title="Busca noticias recientes en Google News para esta empresa (gratis, no usa créditos Apollo)">
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
      Buscar signals
    </Button>
  );
}
