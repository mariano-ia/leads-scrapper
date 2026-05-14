"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";

export type OrgCompanyStatus = "new" | "reviewed" | "qualified" | "disqualified" | "in_pipeline";

export async function changeStatusAction(
  orgSlug: string,
  orgCompanyId: string,
  toStatus: OrgCompanyStatus,
  reason?: string
) {
  const user = await requireAuth();
  await requireOrgMembership(orgSlug, user.id);

  const svc = createSupabaseServiceClient();

  // Get current status
  const { data: row } = await svc
    .from("org_companies")
    .select("status, org_id")
    .eq("id", orgCompanyId)
    .single();

  if (!row) return { error: "org_company no encontrada" };
  const fromStatus = row.status;
  if (fromStatus === toStatus) return { success: true };

  // Update + audit
  const { error: updateErr } = await svc
    .from("org_companies")
    .update({ status: toStatus, status_updated_at: new Date().toISOString() })
    .eq("id", orgCompanyId);
  if (updateErr) return { error: updateErr.message };

  await svc.from("org_company_status_history").insert({
    org_company_id: orgCompanyId,
    from_status: fromStatus,
    to_status: toStatus,
    reason: reason || null,
    changed_by: user.id,
  });

  revalidatePath(`/${orgSlug}/radar`);
  revalidatePath(`/${orgSlug}/companies`);
  return { success: true };
}

export async function addNoteAction(
  orgSlug: string,
  companyId: string,
  content: string
) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(orgSlug, user.id);
  const svc = createSupabaseServiceClient();

  if (!content || content.trim().length < 1) {
    return { error: "Nota vacía" };
  }

  // Resolve org_company_id
  const { data: oc } = await svc
    .from("org_companies")
    .select("id")
    .eq("org_id", org.id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!oc) {
    return { error: "Empresa no está en tu radar todavía. Tiene que matchear una search primero." };
  }

  const { error } = await svc.from("org_company_notes").insert({
    org_company_id: oc.id,
    author_user_id: user.id,
    content: content.trim(),
  });
  if (error) return { error: error.message };

  revalidatePath(`/${orgSlug}/companies/${companyId}`);
  return { success: true };
}
