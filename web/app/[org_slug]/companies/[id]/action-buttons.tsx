"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, Database, Users, Zap, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  enrichCompanyAction,
  generateBriefAction,
  fetchContactsAction,
  qualifyCompanyAction,
} from "./actions";

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
  const [qualifying, startQualify] = useTransition();
  const [enriching, startEnrich] = useTransition();
  const [briefing, startBrief] = useTransition();
  const [fetchingContacts, startFetch] = useTransition();
  const [showMore, setShowMore] = useState(false);

  function handleQualify() {
    startQualify(async () => {
      const result = await qualifyCompanyAction(orgSlug, companyId, { maxContacts: 5 });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      const lines = (result.steps || []).map((s) => `${s.ok ? "✓" : "✗"} ${s.name}: ${s.detail}`);
      const allOk = (result.steps || []).every((s) => s.ok);
      const fn = allOk ? toast.success : toast;
      fn(lines.join(" · "), { duration: 8000 });
    });
  }

  function handleEnrich() {
    startEnrich(async () => {
      const result = await enrichCompanyAction(orgSlug, companyId);
      if (result?.error) toast.error(result.error);
      else toast.success("Enrich aplicado · 1 cred Apollo");
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
      if (result.generic_contacts) parts.push(`${result.generic_contacts} genérico${result.generic_contacts !== 1 ? "s" : ""}`);
      if (result.credits) parts.push(`${result.credits} créd`);
      toast.success(parts.join(" · ") || `${result.total_in_apollo ?? 0} en Apollo pero ninguna decisional`);
    });
  }

  return (
    <div className="flex gap-2 items-center">
      <Button
        onClick={handleQualify}
        disabled={qualifying}
        size="sm"
        title="Hace todo: Enrich (1 cred) + Buscar contactos (1-5 cred) + Generar brief Claude (~$0.003). Total típico: 2-6 créditos Apollo."
      >
        {qualifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
        {qualifying ? "Calificando…" : "Calificar empresa"}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowMore(!showMore)}
        title="Mostrar acciones individuales"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${showMore ? "rotate-180" : ""}`} />
      </Button>

      {showMore && (
        <>
          {needsEnrich && (
            <Button
              onClick={handleEnrich}
              disabled={enriching}
              variant="ghost"
              size="sm"
              title="Solo Apollo /organizations/enrich. 1 crédito."
            >
              {enriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
              Enrich (1)
            </Button>
          )}
          <Button
            onClick={handleFetchContacts}
            disabled={fetchingContacts}
            variant="ghost"
            size="sm"
            title="Solo Apollo people. 1 cred por reveal."
          >
            {fetchingContacts ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
            Contactos
          </Button>
          <Button
            onClick={handleBrief}
            disabled={briefing || needsEnrich}
            variant="ghost"
            size="sm"
            title={needsEnrich ? "Enriquecé primero" : "Solo Claude brief"}
          >
            {briefing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {needsBrief ? "Brief" : "Re-brief"}
          </Button>
        </>
      )}
    </div>
  );
}
