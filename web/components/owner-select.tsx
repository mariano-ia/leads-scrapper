"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { assignOwnerAction } from "@/app/[org_slug]/radar/owner-actions";
import { initials } from "@/lib/utils";

export interface Member {
  user_id: string;
  email: string;
  name?: string | null;
}

function displayLabel(m: Member): string {
  return m.name?.trim() || m.email || `usuario ${m.user_id.slice(0, 8)}`;
}

export function OwnerSelect({
  orgSlug,
  orgCompanyId,
  currentOwnerId,
  members,
}: {
  orgSlug: string;
  orgCompanyId: string;
  currentOwnerId: string | null;
  members: Member[];
}) {
  const [value, setValue] = useState<string>(currentOwnerId || "");
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const result = await assignOwnerAction(orgSlug, orgCompanyId, next || null);
      if (result?.error) {
        setValue(prev);
        toast.error(result.error);
      } else {
        toast.success(next ? "Owner asignado" : "Owner removido");
      }
    });
  }

  const currentMember = members.find((m) => m.user_id === value);

  return (
    <div className="flex items-center gap-2">
      {currentMember && (
        <Avatar className="h-6 w-6">
          <AvatarFallback className="text-[10px]">{initials(displayLabel(currentMember))}</AvatarFallback>
        </Avatar>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="text-xs rounded-md border px-2 py-1 bg-background cursor-pointer disabled:opacity-50 max-w-[180px]"
        title={currentMember ? `${displayLabel(currentMember)}${currentMember.email && currentMember.name ? ` · ${currentMember.email}` : ""}` : "Sin owner asignado"}
      >
        <option value="">Sin owner</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {displayLabel(m)}
          </option>
        ))}
      </select>
    </div>
  );
}
