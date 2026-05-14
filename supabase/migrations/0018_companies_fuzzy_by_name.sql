-- D1: RPC para fuzzy match BO scraper.
-- Aplicado vía Supabase MCP el 2026-05-14.

CREATE OR REPLACE FUNCTION companies_fuzzy_by_name(q text, threshold real DEFAULT 0.6)
RETURNS TABLE(id uuid, razon_social text, similarity real)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.razon_social,
    similarity(c.razon_social, q) AS sim
  FROM companies c
  WHERE c.status = 'active'
    AND c.razon_social % q
    AND similarity(c.razon_social, q) >= threshold
  ORDER BY sim DESC
  LIMIT 5;
END;
$$;

REVOKE EXECUTE ON FUNCTION companies_fuzzy_by_name(text, real) FROM anon;

CREATE INDEX IF NOT EXISTS idx_companies_razon_social_trgm
  ON companies USING gin (razon_social gin_trgm_ops);
