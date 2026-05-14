"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Radar as RadarIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToRadarAction } from "@/app/[org_slug]/companies/radar-actions";

export function AddToRadarButton({
  orgSlug,
  companyId,
  inRadar = false,
}: {
  orgSlug: string;
  companyId: string;
  inRadar?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (inRadar) return;
    startTransition(async () => {
      const result = await addToRadarAction(orgSlug, companyId);
      if (result?.error) toast.error(result.error);
      else toast.success("Agregada al radar");
    });
  }

  if (inRadar) {
    return (
      <Button size="sm" variant="ghost" disabled className="text-green-600 cursor-default">
        <Check className="h-3 w-3" />
        En radar
      </Button>
    );
  }

  return (
    <Button size="sm" variant="ghost" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RadarIcon className="h-3 w-3" />}
      + Radar
    </Button>
  );
}
