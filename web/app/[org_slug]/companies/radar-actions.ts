"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { scoreCompany } from "@/lib/scoring";

/**
 * Agrega una empresa al radar de la org manualmente.
 * Necesita una search activa (linkea contra la más reciente).
 */
export async function addToRadarAction(orgSlug: string, companyId: string) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(orgSlug, user.id);
  const svc = createSupabaseServiceClient();

  // Find most recent active search of the org (manual radar adds are linked here for tracking)
  const { data: search } = await svc
    .from("searches")
    .select("id, filters")
    .eq("org_id", org.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!search) {
    return { error: "Necesitás al menos una search activa para agregar empresas al radar. Creá una en /searches/new." };
  }

  // Check if already in radar
  const { data: existing } = await svc
    .from("org_companies")
    .select("id")
    .eq("org_id", org.id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (existing) {
    return { error: "Esta empresa ya está en el radar" };
  }

  // Fetch company data + signal count for scoring
  const [{ data: company }, { count: signalsCount }] = await Promise.all([
    svc
      .from("companies")
      .select(
        "sector, subsector, headcount_range, founded_year, organization_revenue, organization_headcount_twelve_month_growth, intent_strength"
      )
      .eq("id", companyId)
      .single(),
    svc.from("signals").select("id", { count: "exact", head: true }).eq("company_id", companyId),
  ]);

  const scores = scoreCompany(company || {}, (search as any).filters || null, signalsCount || 0);

  const { error } = await svc.from("org_companies").insert({
    org_id: org.id,
    company_id: companyId,
    last_search_id: search.id,
    first_matched_at: new Date().toISOString(),
    last_fit_score: scores.fit,
    last_intent_score: scores.intent,
    last_combined_score: scores.combined,
    status: "new",
  });

  if (error) return { error: error.message };

  revalidatePath(`/${orgSlug}/companies`);
  revalidatePath(`/${orgSlug}/radar`);
  return { success: true };
}

export async function removeFromRadarAction(orgSlug: string, companyId: string) {
  const user = await requireAuth();
  const { org, role } = await requireOrgMembership(orgSlug, user.id);
  if (role !== "admin") return { error: "Solo admins pueden remover del radar" };
  const svc = createSupabaseServiceClient();

  const { error } = await svc
    .from("org_companies")
    .delete()
    .eq("org_id", org.id)
    .eq("company_id", companyId);
  if (error) return { error: error.message };

  revalidatePath(`/${orgSlug}/radar`);
  revalidatePath(`/${orgSlug}/companies`);
  return { success: true };
}
