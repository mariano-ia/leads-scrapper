-- Migration 0007: seed inicial de apollo_budget_config
-- Default basado en Apollo Basic ~$99/mes. Ajustar a creditos reales en Week 2.

INSERT INTO apollo_budget_config (
  monthly_budget_credits,
  alert_thresholds_pct,
  hard_stop_pct,
  alert_emails,
  apollo_plan_name,
  apollo_plan_monthly_usd
) VALUES (
  1500,                                 -- placeholder: actualizar con val real Apollo Basic en Week 2
  ARRAY[70, 85, 95],
  100,
  ARRAY['marianonoceti@gmail.com'],
  'basic',
  99.00
);
