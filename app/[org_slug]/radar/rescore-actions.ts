"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { scoreCompany } from "@/lib/scoring";

/**
 * Recalcula fit/intent/combined scores para TODAS las empresas en el radar de la org.
 * Útil después de:
 *  - Apollo sync (refresh de intent_strength + growth)
 *  - Enrich masivo
 *  - Llegada de nuevos signals
 *  - Cambio de filtros de search
 */
export async function rescoreRadarAction(orgSlug: string) {
  const user = await requireAuth();
  const { org, role } = await requireOrgMembership(orgSlug, user.id);
  if (role !== "admin") return { error: "Solo admins pueden re-puntuar el radar" };

  const svc = createSupabaseServiceClient();

  // Fetch radar rows con la search asociada
  const { data: rows } = await svc
    .from("org_companies")
    .select("id, company_id, last_search_id")
    .eq("org_id", org.id);

  if (!rows || rows.length === 0) return { success: true, updated: 0 };

  // Map search_id → filters
  const searchIds = Array.from(new Set(rows.map((r: any) => r.last_search_id).filter(Boolean)));
  const filtersById = new Map<string, any>();
  if (searchIds.length > 0) {
    const { data: searches } = await svc.from("searches").select("id, filters").in("id", searchIds);
    for (const s of searches || []) filtersById.set(s.id as string, s.filters);
  }

  // Fetch companies en bulk
  const companyIds = rows.map((r: any) => r.company_id);
  const { data: companies } = await svc
    .from("companies")
    .select(
      "id, sector, subsector, headcount_range, founded_year, organization_revenue, organization_headcount_twelve_month_growth, intent_strength"
    )
    .in("id", companyIds);
  const companyById = new Map((companies || []).map((c: any) => [c.id, c]));

  // Fetch signal counts en bulk
  const { data: signalRows } = await svc.from("signals").select("company_id").in("company_id", companyIds);
  const signalCounts = new Map<string, number>();
  for (const s of signalRows || []) {
    signalCounts.set(s.company_id as string, (signalCounts.get(s.company_id as string) || 0) + 1);
  }

  let updated = 0;
  for (const row of rows) {
    const c: any = companyById.get(row.company_id as string);
    if (!c) continue;
    const filters = filtersById.get(row.last_search_id as string) || null;
    const sigCount = signalCounts.get(row.company_id as string) || 0;
    const scores = scoreCompany(c, filters, sigCount);

    await svc
      .from("org_companies")
      .update({
        last_fit_score: scores.fit,
        last_intent_score: scores.intent,
        last_combined_score: scores.combined,
      })
      .eq("id", row.id);
    updated++;
  }

  revalidatePath(`/${orgSlug}/radar`);
  revalidatePath(`/${orgSlug}/dashboard`);
  return { success: true, updated };
}
