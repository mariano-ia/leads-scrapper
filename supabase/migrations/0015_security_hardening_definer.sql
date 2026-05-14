-- S3 + S4: hardening de funciones y vistas SECURITY DEFINER.
-- Aplicado vía Supabase MCP el 2026-05-14.

-- S3: apollo_credit_summary view a SECURITY INVOKER
DROP VIEW IF EXISTS public.apollo_credit_summary CASCADE;

CREATE OR REPLACE VIEW public.apollo_credit_summary
WITH (security_invoker = true) AS
SELECT
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM') AS year_month,
  cfg.monthly_budget_credits,
  COALESCE(u.credits_used, 0) AS credits_used,
  GREATEST(0, cfg.monthly_budget_credits - COALESCE(u.credits_used, 0)) AS credits_remaining,
  ROUND(
    CASE WHEN cfg.monthly_budget_credits > 0
      THEN 100.0 * COALESCE(u.credits_used, 0) / cfg.monthly_budget_credits
      ELSE 0
    END, 2
  ) AS pct_used,
  cfg.alert_thresholds_pct,
  cfg.hard_stop_pct,
  cfg.apollo_plan_name,
  cfg.apollo_plan_monthly_usd,
  u.last_sync_at
FROM apollo_budget_config cfg
LEFT JOIN apollo_credit_usage_monthly u
  ON u.year_month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');

-- S4: REVOKE EXECUTE de funciones DEFINER que no necesitan ser RPC públicas
REVOKE EXECUTE ON FUNCTION public.trg_signal_inserted_rescore() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_signal_deleted_rescore() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_company_updated_rescore() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rescore_org_companies_for_company(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_is_admin_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_is_member_of(uuid) FROM anon;
