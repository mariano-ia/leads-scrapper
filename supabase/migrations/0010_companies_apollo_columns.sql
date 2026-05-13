-- Agregar columnas flat para campos importantes de Apollo (antes solo en apollo_data jsonb).
-- Esto permite queries y indexes nativos en UI sin parsear JSON.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS linkedin_uid text,
  ADD COLUMN IF NOT EXISTS twitter_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS sanitized_phone text,
  ADD COLUMN IF NOT EXISTS market_cap text,
  ADD COLUMN IF NOT EXISTS organization_revenue numeric,
  ADD COLUMN IF NOT EXISTS organization_revenue_printed text,
  ADD COLUMN IF NOT EXISTS publicly_traded_symbol text,
  ADD COLUMN IF NOT EXISTS publicly_traded_exchange text,
  ADD COLUMN IF NOT EXISTS organization_headcount_six_month_growth numeric,
  ADD COLUMN IF NOT EXISTS organization_headcount_twelve_month_growth numeric,
  ADD COLUMN IF NOT EXISTS organization_headcount_twenty_four_month_growth numeric,
  ADD COLUMN IF NOT EXISTS intent_strength text,
  ADD COLUMN IF NOT EXISTS show_intent boolean,
  ADD COLUMN IF NOT EXISTS has_intent_signal_account boolean,
  ADD COLUMN IF NOT EXISTS owned_by_organization_id text,
  ADD COLUMN IF NOT EXISTS alexa_ranking int,
  ADD COLUMN IF NOT EXISTS sic_codes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS languages jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_companies_growth_12m
  ON companies(organization_headcount_twelve_month_growth DESC NULLS LAST);

-- Backfill desde apollo_data jsonb existente (idempotente)
UPDATE companies
SET
  website_url = apollo_data->>'website_url',
  linkedin_url = apollo_data->>'linkedin_url',
  linkedin_uid = apollo_data->>'linkedin_uid',
  twitter_url = apollo_data->>'twitter_url',
  facebook_url = apollo_data->>'facebook_url',
  logo_url = apollo_data->>'logo_url',
  phone = apollo_data->>'phone',
  sanitized_phone = apollo_data->>'sanitized_phone',
  market_cap = apollo_data->>'market_cap',
  organization_revenue = (apollo_data->>'organization_revenue')::numeric,
  organization_revenue_printed = apollo_data->>'organization_revenue_printed',
  publicly_traded_symbol = apollo_data->>'publicly_traded_symbol',
  publicly_traded_exchange = apollo_data->>'publicly_traded_exchange',
  organization_headcount_six_month_growth = (apollo_data->>'organization_headcount_six_month_growth')::numeric,
  organization_headcount_twelve_month_growth = (apollo_data->>'organization_headcount_twelve_month_growth')::numeric,
  organization_headcount_twenty_four_month_growth = (apollo_data->>'organization_headcount_twenty_four_month_growth')::numeric,
  intent_strength = apollo_data->>'intent_strength',
  show_intent = (apollo_data->>'show_intent')::boolean,
  has_intent_signal_account = (apollo_data->>'has_intent_signal_account')::boolean,
  owned_by_organization_id = apollo_data->>'owned_by_organization_id',
  alexa_ranking = NULLIF(apollo_data->>'alexa_ranking', '')::int,
  sic_codes = COALESCE(apollo_data->'sic_codes', '[]'::jsonb),
  languages = COALESCE(apollo_data->'languages', '[]'::jsonb)
WHERE apollo_data IS NOT NULL;
