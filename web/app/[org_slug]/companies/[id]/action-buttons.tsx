"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, Database } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enrichCompanyAction, generateBriefAction } from "./actions";

export function CompanyActions({
  orgSlug,
  companyId,
  needsEnrich,
  needsBrief,
}: {
  orgSlug: string;
  companyId: string;
  needsEnrich: boolean;
  needsBrief: boolean;
}) {
  const [enriching, startEnrich] = useTransition();
  const [briefing, startBrief] = useTransition();

  function handleEnrich() {
    startEnrich(async () => {
      const result = await enrichCompanyAction(orgSlug, companyId);
      if (result?.error) toast.error(result.error);
      else toast.success("Enrich aplicado · 1 crédito Apollo consumido");
    });
  }

  function handleBrief() {
    startBrief(async () => {
      const result = await generateBriefAction(orgSlug, companyId);
      if (result?.error) toast.error(result.error);
      else toast.success("AI brief generado");
    });
  }

  return (
    <div className="flex gap-2">
      {needsEnrich && (
        <Button onClick={handleEnrich} disabled={enriching} variant="outline" size="sm">
          {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
          {enriching ? "Enriqueciendo..." : "Enrich Apollo (1 cred)"}
        </Button>
      )}
      <Button onClick={handleBrief} disabled={briefing || needsEnrich} variant="outline" size="sm">
        {briefing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {briefing ? "Generando..." : needsBrief ? "Generar brief" : "Regenerar brief"}
      </Button>
    </div>
  );
}
