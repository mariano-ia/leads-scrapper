-- Amplía signal_type_valid CHECK para incluir tipos de Google News scraper.
-- Aplicado vía Supabase MCP el 2026-05-13.
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_type_valid;
ALTER TABLE signals ADD CONSTRAINT signals_type_valid CHECK (
  type IN (
    'job_posting',
    'bo_act',
    'web_change',
    'apollo_hiring',
    'press_mention',
    'funding_round',
    'c_level_hire',
    'expansion_or_launch',
    'partnership'
  )
);
