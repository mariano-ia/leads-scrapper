"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";

export async function assignOwnerAction(
  orgSlug: string,
  orgCompanyId: string,
  toUserId: string | null
) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(orgSlug, user.id);
  const svc = createSupabaseServiceClient();

  // Get org_company + validate it's of this org
  const { data: oc } = await svc
    .from("org_companies")
    .select("id, org_id")
    .eq("id", orgCompanyId)
    .single();
  if (!oc || oc.org_id !== org.id) return { error: "org_company no encontrada" };

  // Get current owner (we use single-owner model for F0)
  const { data: existing } = await svc
    .from("org_company_owners")
    .select("user_id")
    .eq("org_company_id", orgCompanyId)
    .maybeSingle();

  const fromUserId = existing?.user_id || null;
  if (fromUserId === toUserId) return { success: true };

  // Validate toUserId is a member if not null
  if (toUserId) {
    const { data: member } = await svc
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id)
      .eq("user_id", toUserId)
      .maybeSingle();
    if (!member) return { error: "El usuario no es miembro de la org" };
  }

  // Replace (delete + insert) — F0 single-owner
  if (existing) {
    await svc.from("org_company_owners").delete().eq("org_company_id", orgCompanyId);
  }
  if (toUserId) {
    await svc.from("org_company_owners").insert({
      org_company_id: orgCompanyId,
      user_id: toUserId,
      assigned_by: user.id,
    });
  }

  // Audit
  await svc.from("org_company_owner_history").insert({
    org_company_id: orgCompanyId,
    from_user_id: fromUserId,
    to_user_id: toUserId,
    changed_by: user.id,
  });

  revalidatePath(`/${orgSlug}/radar`);
  return { success: true };
}
