-- Migration 0002: tablas por-org (con org_id)
-- Ver docs/superpowers/specs/2026-05-13-leads-scrapper-fase-0-design.md §6.2

-- =============================================================================
-- orgs
-- =============================================================================
CREATE TABLE orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER orgs_updated_at BEFORE UPDATE ON orgs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- org_members
-- =============================================================================
CREATE TABLE org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id),
  CONSTRAINT org_members_role_valid CHECK (role IN ('admin', 'member'))
);

CREATE INDEX idx_org_members_user ON org_members(user_id);

-- =============================================================================
-- invitations
-- =============================================================================
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL,
  token text UNIQUE NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_role_valid CHECK (role IN ('admin', 'member'))
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- =============================================================================
-- org_universe_targets
-- =============================================================================
CREATE TABLE org_universe_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  version_int int NOT NULL,
  config jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deactivated_at timestamptz,
  is_active bool NOT NULL DEFAULT false,
  companies_count_snapshot int,
  UNIQUE (org_id, version_int)
);

CREATE UNIQUE INDEX idx_org_universe_one_active_per_org
  ON org_universe_targets (org_id)
  WHERE is_active = true;

-- =============================================================================
-- searches
-- =============================================================================
CREATE TABLE searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL,
  llm_filter_text text,
  min_combined_score numeric(5,3) NOT NULL DEFAULT 0.300,
  alert_enabled bool NOT NULL DEFAULT false,
  alert_email text,
  digest_mode text NOT NULL DEFAULT 'immediate',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT searches_digest_mode_valid CHECK (digest_mode IN ('immediate', 'daily'))
);

CREATE TRIGGER searches_updated_at BEFORE UPDATE ON searches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_searches_org_active ON searches(org_id) WHERE active = true;

-- =============================================================================
-- org_companies
-- =============================================================================
CREATE TABLE org_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_matched_at timestamptz NOT NULL DEFAULT now(),
  last_search_id uuid REFERENCES searches(id),
  last_fit_score numeric(5,3),
  last_intent_score numeric(8,3),
  last_combined_score numeric(8,3),
  last_llm_score numeric(5,2),
  last_llm_reasoning text,
  last_scored_at timestamptz,
  ai_brief text,
  ai_brief_generated_at timestamptz,
  status text NOT NULL DEFAULT 'new',
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, company_id),
  CONSTRAINT org_companies_status_valid CHECK (
    status IN ('new', 'reviewed', 'qualified', 'disqualified', 'in_pipeline')
  )
);

CREATE INDEX idx_org_companies_org ON org_companies(org_id);
CREATE INDEX idx_org_companies_score ON org_companies(org_id, last_combined_score DESC);
CREATE INDEX idx_org_companies_status ON org_companies(org_id, status);

-- =============================================================================
-- org_company_owners
-- =============================================================================
CREATE TABLE org_company_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE (org_company_id, user_id)
);

CREATE INDEX idx_org_company_owners_oc ON org_company_owners(org_company_id);

-- =============================================================================
-- org_company_notes
-- =============================================================================
CREATE TABLE org_company_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER org_company_notes_updated_at BEFORE UPDATE ON org_company_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_org_company_notes_oc ON org_company_notes(org_company_id, created_at DESC);

-- =============================================================================
-- org_company_status_history
-- =============================================================================
CREATE TABLE org_company_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_history_oc ON org_company_status_history(org_company_id, changed_at DESC);

-- =============================================================================
-- org_company_owner_history
-- =============================================================================
CREATE TABLE org_company_owner_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES auth.users(id),
  to_user_id uuid REFERENCES auth.users(id),
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_owner_history_oc ON org_company_owner_history(org_company_id, changed_at DESC);

-- =============================================================================
-- alert_dispatches
-- =============================================================================
CREATE TABLE alert_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  search_id uuid NOT NULL REFERENCES searches(id),
  org_company_id uuid NOT NULL REFERENCES org_companies(id),
  channel text NOT NULL,
  recipient text NOT NULL,
  digest_mode text NOT NULL,
  resend_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent',
  CONSTRAINT alert_dispatches_status_valid CHECK (status IN ('sent', 'bounced', 'failed'))
);

CREATE INDEX idx_alert_dispatches_org ON alert_dispatches(org_id, sent_at DESC);
