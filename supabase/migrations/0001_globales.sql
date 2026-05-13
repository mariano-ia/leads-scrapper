-- Migration 0001: tablas globales (sin org_id)
-- Ver docs/superpowers/specs/2026-05-13-leads-scrapper-fase-0-design.md §6.1

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- para fuzzy matching de razón social

-- =============================================================================
-- universe_master_versions
-- =============================================================================
CREATE TABLE universe_master_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_int int NOT NULL UNIQUE,
  config jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deactivated_at timestamptz,
  is_active bool NOT NULL DEFAULT false,
  companies_count_snapshot int,
  credits_used_to_build int
);

CREATE UNIQUE INDEX universe_master_one_active
  ON universe_master_versions (is_active)
  WHERE is_active = true;

-- =============================================================================
-- companies
-- =============================================================================
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apollo_id text UNIQUE,
  cuit text UNIQUE,
  razon_social text NOT NULL,
  nombre_comercial text,
  dominio text,
  sector text,
  subsector text,
  headcount_range text,
  founded_year int,
  location_pais text NOT NULL DEFAULT 'AR',
  location_provincia text,
  location_ciudad text,
  tech_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  apollo_data jsonb,
  status text NOT NULL DEFAULT 'active',
  merged_into_id uuid REFERENCES companies(id),
  last_apollo_sync_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_must_have_id CHECK (
    apollo_id IS NOT NULL OR cuit IS NOT NULL
  ),
  CONSTRAINT companies_status_valid CHECK (
    status IN ('active', 'inactive', 'merged_into')
  )
);

CREATE INDEX idx_companies_sector ON companies(sector) WHERE status = 'active';
CREATE INDEX idx_companies_provincia ON companies(location_provincia) WHERE status = 'active';
CREATE INDEX idx_companies_headcount ON companies(headcount_range) WHERE status = 'active';
CREATE INDEX idx_companies_tech ON companies USING gin (tech_stack);
CREATE INDEX idx_companies_dominio ON companies(dominio) WHERE dominio IS NOT NULL;
CREATE INDEX idx_companies_razon_social_trgm ON companies USING gin (razon_social gin_trgm_ops);

-- =============================================================================
-- company_contacts
-- =============================================================================
CREATE TABLE company_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  apollo_person_id text,
  full_name text NOT NULL,
  title text,
  email text,
  email_status text,
  linkedin_url text,
  phone text,
  is_decision_maker bool NOT NULL DEFAULT false,
  source text NOT NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

CREATE INDEX idx_company_contacts_company ON company_contacts(company_id);
CREATE INDEX idx_company_contacts_apollo_id
  ON company_contacts(apollo_person_id) WHERE apollo_person_id IS NOT NULL;

-- =============================================================================
-- signals
-- =============================================================================
CREATE TABLE signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL,
  source text NOT NULL,
  occurred_at timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  intent_weight numeric(5,2) NOT NULL,
  decay_half_life_days int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signals_type_valid CHECK (
    type IN ('job_posting', 'bo_act', 'web_change', 'apollo_hiring')
  )
);

CREATE INDEX idx_signals_company_occurred ON signals(company_id, occurred_at DESC);
CREATE INDEX idx_signals_type_occurred ON signals(type, occurred_at DESC);
-- Full index on occurred_at (partial con now() no es permitido en Postgres
-- porque now() no es IMMUTABLE). Cubre queries de "señales recientes".
CREATE INDEX idx_signals_occurred ON signals(occurred_at DESC);

-- =============================================================================
-- signal_type_config
-- =============================================================================
CREATE TABLE signal_type_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  variant text,
  intent_weight numeric(5,2) NOT NULL,
  decay_half_life_days int NOT NULL,
  match_rules jsonb,
  active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type, variant)
);

-- =============================================================================
-- apollo_sync_runs
-- =============================================================================
CREATE TABLE apollo_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  master_version_id uuid REFERENCES universe_master_versions(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  companies_added int NOT NULL DEFAULT 0,
  companies_updated int NOT NULL DEFAULT 0,
  contacts_added int NOT NULL DEFAULT 0,
  contacts_updated int NOT NULL DEFAULT 0,
  credits_used int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  aborted_reason text,
  CONSTRAINT apollo_runs_mode_valid CHECK (
    mode IN ('initial', 'delta', 'targeted_contacts')
  ),
  CONSTRAINT apollo_runs_status_valid CHECK (
    status IN ('running', 'completed', 'failed', 'aborted')
  )
);

CREATE INDEX idx_apollo_runs_started ON apollo_sync_runs(started_at DESC);

-- =============================================================================
-- scrape_runs
-- =============================================================================
CREATE TABLE scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  items_scraped int NOT NULL DEFAULT 0,
  signals_inserted int NOT NULL DEFAULT 0,
  companies_matched int NOT NULL DEFAULT 0,
  items_unmatched int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT scrape_runs_status_valid CHECK (
    status IN ('running', 'completed', 'failed', 'aborted')
  )
);

CREATE INDEX idx_scrape_runs_source_started ON scrape_runs(source, started_at DESC);

-- =============================================================================
-- candidate_companies
-- =============================================================================
CREATE TABLE candidate_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuit text UNIQUE,
  razon_social text NOT NULL,
  source text NOT NULL,
  source_data jsonb,
  detection_count int NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  promoted_to_company_id uuid REFERENCES companies(id)
);

CREATE INDEX idx_candidate_razon_social_trgm
  ON candidate_companies USING gin (razon_social gin_trgm_ops);

-- =============================================================================
-- apollo_budget_config / usage / alerts
-- =============================================================================
CREATE TABLE apollo_budget_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_budget_credits int NOT NULL,
  alert_thresholds_pct int[] NOT NULL DEFAULT ARRAY[70, 85, 95],
  hard_stop_pct int NOT NULL DEFAULT 100,
  alert_emails text[] NOT NULL DEFAULT '{}',
  apollo_plan_name text,
  apollo_plan_monthly_usd numeric(8,2),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE apollo_credit_usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL UNIQUE,
  credits_used int NOT NULL DEFAULT 0,
  last_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE apollo_budget_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL,
  threshold_pct int NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  credits_used_at_alert int NOT NULL,
  UNIQUE (year_month, threshold_pct)
);

-- =============================================================================
-- universe_metrics_snapshots
-- =============================================================================
CREATE TABLE universe_metrics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at timestamptz NOT NULL DEFAULT now(),
  master_version_id uuid REFERENCES universe_master_versions(id),
  companies_count int NOT NULL,
  contacts_count int NOT NULL,
  companies_with_email_count int NOT NULL,
  companies_with_dm_count int NOT NULL,
  by_sector jsonb,
  by_provincia jsonb,
  by_headcount_range jsonb,
  signals_last_7d int,
  signals_last_30d int
);

-- =============================================================================
-- updated_at trigger helper
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER company_contacts_updated_at BEFORE UPDATE ON company_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
