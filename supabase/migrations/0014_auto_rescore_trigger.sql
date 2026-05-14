-- Auto-rescore: cuando entra una signal nueva o se enrich una empresa,
-- recomputar fit/intent/combined para todas las org_companies de esa empresa.
-- Idempotente: la fórmula es la misma del bulk rescore manual.
-- Aplicado vía Supabase MCP el 2026-05-13.

CREATE OR REPLACE FUNCTION rescore_org_companies_for_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH sigs AS (
    SELECT
      company_id,
      LEAST(0.30, SUM(intent_weight) / 100.0) AS signal_boost
    FROM signals
    WHERE company_id = p_company_id
      AND occurred_at >= now() - interval '180 days'
    GROUP BY company_id
  ),
  scored AS (
    SELECT
      oc.id,
      LEAST(1.0,
        CASE WHEN c.sector IS NOT NULL THEN 0.25 ELSE 0 END +
        CASE WHEN c.headcount_range IS NOT NULL THEN 0.10 ELSE 0 END +
        CASE WHEN c.founded_year IS NOT NULL THEN 0.20 ELSE 0 END +
        CASE WHEN c.organization_revenue IS NOT NULL AND c.organization_revenue > 0 THEN 0.15 ELSE 0 END
      ) AS new_fit,
      LEAST(1.0,
        CASE
          WHEN c.organization_headcount_twelve_month_growth > 0.10 THEN 0.40
          WHEN c.organization_headcount_twelve_month_growth > 0 THEN 0.20
          ELSE 0
        END +
        CASE LOWER(COALESCE(c.intent_strength,''))
          WHEN 'high' THEN 0.30
          WHEN 'very_high' THEN 0.30
          WHEN 'medium' THEN 0.15
          WHEN 'low' THEN 0.05
          ELSE 0
        END +
        COALESCE(s.signal_boost, 0)
      ) AS new_intent
    FROM org_companies oc
    JOIN companies c ON c.id = oc.company_id
    LEFT JOIN sigs s ON s.company_id = oc.company_id
    WHERE oc.company_id = p_company_id
  )
  UPDATE org_companies oc
  SET
    last_fit_score = sc.new_fit,
    last_intent_score = sc.new_intent,
    last_combined_score = LEAST(1.0, 0.5 * sc.new_fit + 0.5 * sc.new_intent)
  FROM scored sc
  WHERE oc.id = sc.id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_signal_inserted_rescore()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM rescore_org_companies_for_company(NEW.company_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS signals_rescore_after_insert ON signals;
CREATE TRIGGER signals_rescore_after_insert
  AFTER INSERT ON signals
  FOR EACH ROW
  EXECUTE FUNCTION trg_signal_inserted_rescore();

CREATE OR REPLACE FUNCTION trg_company_updated_rescore()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sector IS DISTINCT FROM OLD.sector
     OR NEW.headcount_range IS DISTINCT FROM OLD.headcount_range
     OR NEW.founded_year IS DISTINCT FROM OLD.founded_year
     OR NEW.organization_revenue IS DISTINCT FROM OLD.organization_revenue
     OR NEW.organization_headcount_twelve_month_growth IS DISTINCT FROM OLD.organization_headcount_twelve_month_growth
     OR NEW.intent_strength IS DISTINCT FROM OLD.intent_strength
  THEN
    PERFORM rescore_org_companies_for_company(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_rescore_after_update ON companies;
CREATE TRIGGER companies_rescore_after_update
  AFTER UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION trg_company_updated_rescore();

-- AFTER DELETE de signals → rescore para que el score baje cuando se borran señales viejas
CREATE OR REPLACE FUNCTION trg_signal_deleted_rescore()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM rescore_org_companies_for_company(OLD.company_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS signals_rescore_after_delete ON signals;
CREATE TRIGGER signals_rescore_after_delete
  AFTER DELETE ON signals
  FOR EACH ROW
  EXECUTE FUNCTION trg_signal_deleted_rescore();
