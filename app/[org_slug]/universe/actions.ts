"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";

export async function saveOrgUniverseTargetAction(orgSlug: string, formData: FormData) {
  const user = await requireAuth();
  const { org, role } = await requireOrgMembership(orgSlug, user.id);
  if (role !== "admin") return { error: "Solo admins pueden editar el target de la org" };

  const svc = createSupabaseServiceClient();

  // Read form
  const headcountMin = Number(formData.get("headcount_min")) || null;
  const headcountMax = Number(formData.get("headcount_max")) || null;
  const foundedMin = Number(formData.get("founded_year_min")) || null;
  const foundedMax = Number(formData.get("founded_year_max")) || null;
  const provincias = (formData.get("provincias") as string)?.split(",").map((p) => p.trim()).filter(Boolean) || [];
  const industriesAny = (formData.get("industries_any") as string)?.split(",").map((p) => p.trim()).filter(Boolean) || [];
  const industriesNone = (formData.get("industries_none") as string)?.split(",").map((p) => p.trim()).filter(Boolean) || [];
  const technologiesAny = (formData.get("technologies_any") as string)?.split(",").map((p) => p.trim()).filter(Boolean) || [];
  const technologiesNone = (formData.get("technologies_none") as string)?.split(",").map((p) => p.trim()).filter(Boolean) || [];

  // Find current active version
  const { data: current } = await svc
    .from("org_universe_targets")
    .select("version_int")
    .eq("org_id", org.id)
    .eq("is_active", true)
    .maybeSingle();

  const nextVersion = current ? Number(current.version_int) + 1 : 1;

  // Deactivate current
  if (current) {
    await svc
      .from("org_universe_targets")
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq("org_id", org.id)
      .eq("is_active", true);
  }

  // Insert new version
  const { error } = await svc.from("org_universe_targets").insert({
    org_id: org.id,
    version_int: nextVersion,
    config: {
      industries_any: industriesAny,
      industries_none: industriesNone,
      headcount_min: headcountMin,
      headcount_max: headcountMax,
      founded_year_min: foundedMin,
      founded_year_max: foundedMax,
      provincias_any: provincias,
      technologies_any: technologiesAny,
      technologies_none: technologiesNone,
    },
    created_by: user.id,
    is_active: true,
    activated_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };

  revalidatePath(`/${orgSlug}/universe`);
  return { success: true, version: nextVersion };
}
