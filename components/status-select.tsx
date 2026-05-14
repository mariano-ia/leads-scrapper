"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { changeStatusAction, type OrgCompanyStatus } from "@/app/[org_slug]/radar/actions";

const STATUS_OPTIONS: OrgCompanyStatus[] = ["new", "reviewed", "qualified", "disqualified", "in_pipeline"];

const STATUS_LABEL: Record<OrgCompanyStatus, string> = {
  new: "Nuevo",
  reviewed: "Revisado",
  qualified: "Calificado",
  disqualified: "Descartado",
  in_pipeline: "En pipeline",
};

const STATUS_COLOR: Record<OrgCompanyStatus, string> = {
  new: "bg-amber-100 text-amber-800 border-amber-200",
  reviewed: "bg-gray-100 text-gray-700 border-gray-200",
  qualified: "bg-green-100 text-green-800 border-green-200",
  disqualified: "bg-gray-100 text-gray-500 border-gray-200",
  in_pipeline: "bg-blue-100 text-blue-800 border-blue-200",
};

export function StatusSelect({
  orgSlug,
  orgCompanyId,
  current,
}: {
  orgSlug: string;
  orgCompanyId: string;
  current: OrgCompanyStatus;
}) {
  const [value, setValue] = useState<OrgCompanyStatus>(current);
  const [pending, startTransition] = useTransition();

  function onChange(next: OrgCompanyStatus) {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const result = await changeStatusAction(orgSlug, orgCompanyId, next);
      if (result?.error) {
        setValue(prev);
        toast.error(result.error);
      } else {
        toast.success(`Status: ${STATUS_LABEL[next]}`);
      }
    });
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as OrgCompanyStatus)}
      disabled={pending}
      className={`text-xs rounded-full px-2 py-1 border cursor-pointer disabled:opacity-50 ${STATUS_COLOR[value]}`}
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
