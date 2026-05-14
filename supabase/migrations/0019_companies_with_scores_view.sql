-- Helper RPC para joinear scores per-org desde companies queries.
-- Aplicado vía Supabase MCP el 2026-05-14.

CREATE OR REPLACE FUNCTION companies_with_org_scores(p_org_id uuid)
RETURNS TABLE(
  company_id uuid,
  last_combined_score numeric,
  last_fit_score numeric,
  last_intent_score numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT company_id, last_combined_score, last_fit_score, last_intent_score
  FROM org_companies
  WHERE org_id = p_org_id;
$$;

REVOKE EXECUTE ON FUNCTION companies_with_org_scores(uuid) FROM anon;
