/**
 * Scoring real para org_companies.
 *
 * combined = 0.5 * fit + 0.5 * intent (todos en [0..1])
 *
 * fit (0..1): qué tan bien matchea el ICP de la search
 *   - +0.25 si está enriquecida (sector poblado) — datos de calidad
 *   - +0.25 si headcount_range cae dentro del rango fit.headcount_min/max
 *   - +0.20 si founded_year >= fit.founded_year_min
 *   - +0.15 si la empresa tiene revenue conocido (señal de empresa real)
 *   - +0.15 si el sector matchea fit.apollo_industries (cuando hay lista)
 *
 * intent (0..1): qué tan caliente está la empresa
 *   - +0.40 si organization_headcount_twelve_month_growth > 10%
 *   - +0.20 si growth > 0% (cualquier crecimiento)
 *   - +0.30 si intent_strength == "high"
 *   - +0.15 si intent_strength == "medium"
 *   - +0.05 si intent_strength == "low"
 *   - +0.10 por cada signal reciente (max +0.30)
 */

type SearchFilters = {
  fit?: {
    headcount_min?: number | null;
    headcount_max?: number | null;
    founded_year_min?: number | null;
    apollo_industries?: string[];
  };
  intent?: Record<string, any>;
};

type CompanyForScoring = {
  sector?: string | null;
  subsector?: string | null;
  headcount_range?: string | null;
  founded_year?: number | null;
  organization_revenue?: number | null;
  organization_headcount_twelve_month_growth?: number | null;
  intent_strength?: string | null;
};

export function parseHeadcountRange(range: string | null | undefined): { min: number; max: number } | null {
  if (!range) return null;
  // Formato Apollo "11-50", "201-500", "1000+"
  const plusMatch = range.match(/^(\d+)\+$/);
  if (plusMatch) return { min: Number(plusMatch[1]), max: Number.POSITIVE_INFINITY };
  const rangeMatch = range.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  return null;
}

export function computeFitScore(company: CompanyForScoring, filters: SearchFilters | null | undefined): number {
  let score = 0;
  const fit = filters?.fit;

  if (company.sector) score += 0.25;

  // Headcount fit
  if (fit?.headcount_min != null || fit?.headcount_max != null) {
    const hc = parseHeadcountRange(company.headcount_range);
    if (hc) {
      const min = fit?.headcount_min ?? 0;
      const max = fit?.headcount_max ?? Number.POSITIVE_INFINITY;
      if (hc.max >= min && hc.min <= max) score += 0.25;
    }
  } else if (company.headcount_range) {
    // No filter pero al menos sabemos su tamaño
    score += 0.10;
  }

  // Founded year
  if (company.founded_year != null) {
    if (fit?.founded_year_min == null || company.founded_year >= fit.founded_year_min) {
      score += 0.20;
    }
  }

  if (company.organization_revenue && company.organization_revenue > 0) score += 0.15;

  if (fit?.apollo_industries && fit.apollo_industries.length > 0 && company.sector) {
    const target = fit.apollo_industries.map((s) => s.toLowerCase());
    if (target.some((t) => company.sector!.toLowerCase().includes(t))) {
      score += 0.15;
    }
  }

  return Math.min(1, Number(score.toFixed(3)));
}

export function computeIntentScore(
  company: CompanyForScoring,
  signalsCount: number = 0
): number {
  let score = 0;

  const growth = Number(company.organization_headcount_twelve_month_growth || 0);
  if (growth > 0.10) score += 0.40;
  else if (growth > 0) score += 0.20;

  const strength = (company.intent_strength || "").toLowerCase();
  if (strength === "high" || strength === "very_high") score += 0.30;
  else if (strength === "medium") score += 0.15;
  else if (strength === "low") score += 0.05;

  if (signalsCount > 0) {
    score += Math.min(0.30, signalsCount * 0.10);
  }

  return Math.min(1, Number(score.toFixed(3)));
}

export function computeCombinedScore(fit: number, intent: number): number {
  return Number((0.5 * fit + 0.5 * intent).toFixed(3));
}

export function scoreCompany(
  company: CompanyForScoring,
  filters: SearchFilters | null | undefined,
  signalsCount: number = 0
): { fit: number; intent: number; combined: number } {
  const fit = computeFitScore(company, filters);
  const intent = computeIntentScore(company, signalsCount);
  return { fit, intent, combined: computeCombinedScore(fit, intent) };
}
