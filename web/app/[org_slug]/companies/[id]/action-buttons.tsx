"use client";

import { useTransition } from "react";
import { Loader2, Sparkles, Database, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enrichCompanyAction, generateBriefAction, fetchContactsAction } from "./actions";

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
  const [fetchingContacts, startFetch] = useTransition();

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

  function handleFetchContacts() {
    startFetch(async () => {
      const result = await fetchContactsAction(orgSlug, companyId, { max: 5 });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      const parts: string[] = [];
      if (result.valid_contacts) parts.push(`${result.valid_contacts} contacto${result.valid_contacts !== 1 ? "s" : ""} válido${result.valid_contacts !== 1 ? "s" : ""}`);
      if (result.generic_contacts) parts.push(`${result.generic_contacts} genérico${result.generic_contacts !== 1 ? "s" : ""} (info@/contacto@)`);
      if (result.credits) parts.push(`${result.credits} crédito${result.credits !== 1 ? "s" : ""}`);
      const msg = parts.length > 0
        ? parts.join(" · ")
        : `Apollo tiene ${result.total_in_apollo ?? 0} personas pero ninguna con título decisional`;
      toast.success(msg);
    });
  }

  return (
    <div className="flex gap-2">
      {needsEnrich && (
        <Button
          onClick={handleEnrich}
          disabled={enriching}
          variant="outline"
          size="sm"
          title="Trae de Apollo: sector, sub-sector, headcount range, ciudad/provincia/país, tech stack, intent topics, descripción. Consume 1 crédito Apollo."
        >
          {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
          {enriching ? "Enriqueciendo..." : "Enrich Apollo (1 cred)"}
        </Button>
      )}
      <Button
        onClick={handleBrief}
        disabled={briefing || needsEnrich}
        variant="outline"
        size="sm"
        title={needsEnrich ? "Primero enriquecé la empresa para tener contexto" : "Genera un resumen de 3-4 frases con Claude Sonnet sobre la empresa (uso interno, no se ve en el cliente)"}
      >
        {briefing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {briefing ? "Generando..." : needsBrief ? "Generar brief" : "Regenerar brief"}
      </Button>
      <Button
        onClick={handleFetchContacts}
        disabled={fetchingContacts}
        variant="outline"
        size="sm"
        title="Busca top 5 decision makers (CEO, CTO, Founder, Director) en Apollo. Cuesta 1 crédito por contacto con email revealed."
      >
        {fetchingContacts ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
        {fetchingContacts ? "Buscando..." : "Buscar contactos"}
      </Button>
    </div>
  );
}
