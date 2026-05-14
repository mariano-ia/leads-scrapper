"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { invalidateUserEmailsCache } from "@/lib/user-emails";

/**
 * Actualiza el display name del usuario actual.
 * Lo guardamos en auth.users.user_metadata.full_name.
 */
export async function updateProfileNameAction(orgSlug: string, formData: FormData) {
  const user = await requireAuth();
  await requireOrgMembership(orgSlug, user.id);

  const rawName = (formData.get("name") as string)?.trim() || "";
  const name = rawName.slice(0, 80); // cap razonable

  const svc = createSupabaseServiceClient();
  const { error } = await svc.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata || {}),
      full_name: name || undefined,
    },
  });

  if (error) return { error: error.message };

  // Invalidar cache para que el cambio se vea inmediato en owner selects.
  invalidateUserEmailsCache();

  revalidatePath(`/${orgSlug}/settings`);
  revalidatePath(`/${orgSlug}/radar`);
  revalidatePath(`/${orgSlug}/members`);
  return { success: true };
}
