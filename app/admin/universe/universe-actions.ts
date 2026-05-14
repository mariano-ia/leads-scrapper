"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, isSuperAdmin } from "@/lib/auth";

/**
 * Crea una versión NUEVA del Master Universe y la activa.
 * Patrón inmutable: cada cambio genera una version_int incremental + deactiva
 * la anterior. Permite rollback fácil.
 */
export async function publishUniverseVersionAction(formData: FormData) {
  const user = await requireAuth();
  const isAdmin = await isSuperAdmin(user.id);
  if (!isAdmin) return { error: "Solo super-admins pueden editar el Master Universe" };

  // Parse form
  const locationCountry = ((formData.get("location_country") as string) || "Argentina").trim();
  const headcountMin = Number(formData.get("headcount_min")) || 1;
  const headcountMax = Number(formData.get("headcount_max")) || 500;
  const foundedMin = Number(formData.get("founded_year_min")) || null;
  const maxCompaniesTarget = Number(formData.get("max_companies_target")) || 50000;
  const industriesRaw = ((formData.get("industries") as string) || "").trim();
  const excludeIndustriesRaw = ((formData.get("exclude_industries") as string) || "").trim();
  const keywordsRaw = ((formData.get("keywords_any") as string) || "").trim();
  const notes = ((formData.get("notes") as string) || "").trim().slice(0, 500) || null;

  const industries = industriesRaw
    ? industriesRaw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const excludeIndustries = excludeIndustriesRaw
    ? excludeIndustriesRaw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const keywordsAny = keywordsRaw
    ? keywordsRaw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    : [];

  if (headcountMin < 0 || headcountMax > 10000 || headcountMin > headcountMax) {
    return { error: "headcount inválido (min < max, max ≤ 10000)" };
  }

  const config = {
    location_country: locationCountry,
    headcount_min: headcountMin,
    headcount_max: headcountMax,
    founded_year_min: foundedMin,
    max_companies_target: maxCompaniesTarget,
    industries,
    exclude_industries: excludeIndustries,
    keywords_any: keywordsAny,
  };

  const svc = createSupabaseServiceClient();

  // Fetch latest version_int
  const { data: latest } = await svc
    .from("universe_master_versions")
    .select("version_int")
    .order("version_int", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version_int || 0) + 1;

  // Deactivate active
  await svc
    .from("universe_master_versions")
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq("is_active", true);

  // Insert new active version
  const { error: insErr } = await svc.from("universe_master_versions").insert({
    version_int: nextVersion,
    config,
    notes,
    is_active: true,
    activated_at: new Date().toISOString(),
    created_by: user.id,
  });
  if (insErr) return { error: insErr.message };

  revalidatePath("/admin/universe");
  return { success: true, version: nextVersion };
}

/**
 * Rollback: marca una versión histórica como activa (y deactiva la actual).
 */
export async function rollbackUniverseVersionAction(versionId: string) {
  const user = await requireAuth();
  const isAdmin = await isSuperAdmin(user.id);
  if (!isAdmin) return { error: "Solo super-admins" };

  const svc = createSupabaseServiceClient();
  const { data: target } = await svc
    .from("universe_master_versions")
    .select("id, version_int, is_active")
    .eq("id", versionId)
    .single();
  if (!target) return { error: "Versión no encontrada" };
  if (target.is_active) return { error: "Esa versión ya está activa" };

  await svc
    .from("universe_master_versions")
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq("is_active", true);

  await svc
    .from("universe_master_versions")
    .update({ is_active: true, activated_at: new Date().toISOString(), deactivated_at: null })
    .eq("id", versionId);

  revalidatePath("/admin/universe");
  return { success: true, version: target.version_int };
}
