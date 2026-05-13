"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";

export async function updateSearchAction(orgSlug: string, searchId: string, formData: FormData) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(orgSlug, user.id);

  const name = (formData.get("name") as string)?.trim();
  const llmFilter = (formData.get("llm_filter_text") as string)?.trim() || null;
  const alertEnabled = formData.get("alert_enabled") === "on";
  const alertEmail = (formData.get("alert_email") as string)?.trim() || user.email || null;
  const headcountMin = Number(formData.get("headcount_min")) || null;
  const headcountMax = Number(formData.get("headcount_max")) || null;
  const foundedMin = Number(formData.get("founded_year_min")) || null;
  const active = formData.get("active") === "on";

  if (!name) return { error: "Falta el nombre" };

  const svc = createSupabaseServiceClient();
  const { data: current } = await svc
    .from("searches")
    .select("filters")
    .eq("id", searchId)
    .eq("org_id", org.id)
    .single();
  if (!current) return { error: "Search no encontrada" };

  const filters: any = { ...(current.filters || {}) };
  filters.fit = { ...(filters.fit || {}), headcount_min: headcountMin, headcount_max: headcountMax, founded_year_min: foundedMin };

  const { error } = await svc.from("searches").update({
    name,
    filters,
    llm_filter_text: llmFilter,
    alert_enabled: alertEnabled,
    alert_email: alertEmail,
    active,
  }).eq("id", searchId).eq("org_id", org.id);

  if (error) return { error: error.message };

  revalidatePath(`/${orgSlug}/searches`);
  redirect(`/${orgSlug}/searches`);
}

export async function deleteSearchAction(orgSlug: string, searchId: string) {
  const user = await requireAuth();
  const { org, role } = await requireOrgMembership(orgSlug, user.id);
  if (role !== "admin") return { error: "Solo admins pueden borrar searches" };

  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("searches").delete().eq("id", searchId).eq("org_id", org.id);
  if (error) return { error: error.message };

  revalidatePath(`/${orgSlug}/searches`);
  redirect(`/${orgSlug}/searches`);
}

export async function createSearchAction(orgSlug: string, formData: FormData) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(orgSlug, user.id);

  const name = (formData.get("name") as string)?.trim();
  const llmFilter = (formData.get("llm_filter_text") as string)?.trim() || null;
  const alertEnabled = formData.get("alert_enabled") === "on";
  const alertEmail = (formData.get("alert_email") as string)?.trim() || user.email || null;

  // Parse fit filters
  const headcountMin = Number(formData.get("headcount_min")) || null;
  const headcountMax = Number(formData.get("headcount_max")) || null;
  const foundedMin = Number(formData.get("founded_year_min")) || null;

  if (!name) {
    return { error: "Falta el nombre de la search" };
  }

  const filters = {
    fit: {
      apollo_industries: [],
      apollo_keywords: [],
      headcount_min: headcountMin,
      headcount_max: headcountMax,
      founded_year_min: foundedMin,
      founded_year_max: null,
      location_country: "AR",
      location_provincias: [],
      technologies_any: [],
      technologies_none: [],
      has_apollo_data: true,
    },
    intent: {
      job_posting: { in_last_days: 30, title_keywords_any: ["data", "ai", "automation", "cto", "head of digital"], min_postings_in_window: 1 },
      bo_act: { in_last_days: 180, types: ["ampliacion_capital", "fusion", "cambio_objeto"] },
      web_change: { in_last_days: 60, categories_any: ["productos", "equipo", "blog_tech"] },
      min_intent_score: 0,
      require_at_least_one_signal: false,
    },
  };

  const svc = createSupabaseServiceClient();
  const { data: searchRow, error } = await svc.from("searches").insert({
    org_id: org.id,
    name,
    filters,
    llm_filter_text: llmFilter,
    alert_enabled: alertEnabled,
    alert_email: alertEmail,
    digest_mode: "immediate",
    min_combined_score: 0.3,
    active: true,
    created_by: user.id,
  }).select("id").single();

  if (error) return { error: error.message };

  // Backfill org_companies con empresas que matcheen los fit filters básicos
  if (searchRow) {
    let q = svc
      .from("companies")
      .select("id, organization_headcount_twelve_month_growth")
      .eq("status", "active")
      .limit(500);
    if (headcountMin != null) {
      // Approximation: usar founded_year como proxy de tamaño no se puede; skipping
      // direct headcount filter porque companies.headcount_range es string ("20-49").
      // Para F0 nos basamos en growth + intent en post-filter.
    }
    if (foundedMin != null) {
      q = q.gte("founded_year", foundedMin);
    }
    const { data: candidates } = await q;
    if (candidates && candidates.length > 0) {
      const rows = candidates.map((c: any) => ({
        org_id: org.id,
        company_id: c.id,
        last_search_id: searchRow.id,
        first_matched_at: new Date().toISOString(),
        last_fit_score: 0.5,
        last_intent_score: 0,
        last_combined_score: 0.5,
        status: "new",
      }));
      await svc.from("org_companies").upsert(rows, { onConflict: "org_id,company_id", ignoreDuplicates: false });
    }
  }

  revalidatePath(`/${orgSlug}/searches`);
  redirect(`/${orgSlug}/searches`);
}
