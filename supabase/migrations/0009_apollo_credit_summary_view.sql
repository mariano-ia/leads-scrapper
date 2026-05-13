-- Migration 0009: vista apollo_credit_summary
-- Resume créditos consumidos vs disponibles del mes actual. Para UI + CLI.

CREATE OR REPLACE VIEW apollo_credit_summary AS
SELECT
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM') AS year_month,
  c.monthly_budget_credits,
  c.alert_thresholds_pct,
  c.hard_stop_pct,
  c.apollo_plan_name,
  c.apollo_plan_monthly_usd,
  COALESCE(u.credits_used, 0) AS credits_used,
  GREATEST(c.monthly_budget_credits - COALESCE(u.credits_used, 0), 0) AS credits_remaining,
  CASE
    WHEN c.monthly_budget_credits = 0 THEN 0.0
    ELSE ROUND((COALESCE(u.credits_used, 0)::numeric / c.monthly_budget_credits) * 100, 2)
  END AS pct_used,
  u.last_sync_at
FROM apollo_budget_config c
LEFT JOIN apollo_credit_usage_monthly u
  ON u.year_month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
LIMIT 1;

GRANT SELECT ON apollo_credit_summary TO authenticated;
