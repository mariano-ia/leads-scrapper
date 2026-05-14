-- T2 + RLS performance: índices FK + compound + fix auth.uid() per-row eval.
-- Aplicado vía Supabase MCP el 2026-05-14.

-- Índices covering para 22 FKs flagged por Supabase advisor
CREATE INDEX IF NOT EXISTS idx_alert_dispatches_org_company ON alert_dispatches(org_company_id);
CREATE INDEX IF NOT EXISTS idx_alert_dispatches_search ON alert_dispatches(search_id);
CREATE INDEX IF NOT EXISTS idx_apollo_sync_runs_master_version ON apollo_sync_runs(master_version_id);
CREATE INDEX IF NOT EXISTS idx_candidate_companies_promoted ON candidate_companies(promoted_to_company_id);
CREATE INDEX IF NOT EXISTS idx_companies_merged_into ON companies(merged_into_id);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_companies_company ON org_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_org_companies_last_search ON org_companies(last_search_id);
CREATE INDEX IF NOT EXISTS idx_org_company_notes_author ON org_company_notes(author_user_id);
CREATE INDEX IF NOT EXISTS idx_owner_history_changed_by ON org_company_owner_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_owner_history_from_user ON org_company_owner_history(from_user_id);
CREATE INDEX IF NOT EXISTS idx_owner_history_to_user ON org_company_owner_history(to_user_id);
CREATE INDEX IF NOT EXISTS idx_org_company_owners_assigned_by ON org_company_owners(assigned_by);
CREATE INDEX IF NOT EXISTS idx_org_company_owners_user ON org_company_owners(user_id);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_by ON org_company_status_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_org_universe_targets_created_by ON org_universe_targets(created_by);
CREATE INDEX IF NOT EXISTS idx_orgs_created_by ON orgs(created_by);
CREATE INDEX IF NOT EXISTS idx_outreach_generated_by ON outreach_messages(generated_by_user_id);
CREATE INDEX IF NOT EXISTS idx_searches_created_by ON searches(created_by);
CREATE INDEX IF NOT EXISTS idx_universe_master_created_by ON universe_master_versions(created_by);
CREATE INDEX IF NOT EXISTS idx_universe_metrics_master_version ON universe_metrics_snapshots(master_version_id);

-- Compound para filtros frecuentes
CREATE INDEX IF NOT EXISTS idx_companies_active_sector ON companies(status, sector) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_companies_active_growth ON companies(status, organization_headcount_twelve_month_growth DESC NULLS LAST) WHERE status = 'active';

-- T1: vista para reemplazar auth.admin.listUsers() en SSR
CREATE OR REPLACE VIEW public.user_emails
WITH (security_invoker = true) AS
SELECT id AS user_id, email
FROM auth.users;

-- RLS perf: reemplazar auth.<function>() por (SELECT auth.<function>()) en las 7 policies flagged
DROP POLICY IF EXISTS companies_read ON companies;
CREATE POLICY companies_read ON companies FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS company_contacts_read ON company_contacts;
CREATE POLICY company_contacts_read ON company_contacts FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS signals_read ON signals;
CREATE POLICY signals_read ON signals FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS signal_type_config_read ON signal_type_config;
CREATE POLICY signal_type_config_read ON signal_type_config FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS scrape_runs_read ON scrape_runs;
CREATE POLICY scrape_runs_read ON scrape_runs FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS super_admins_self ON super_admins;
CREATE POLICY super_admins_self ON super_admins FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS org_company_notes_update ON org_company_notes;
CREATE POLICY org_company_notes_update ON org_company_notes FOR UPDATE
  USING (author_user_id = (SELECT auth.uid()))
  WITH CHECK (author_user_id = (SELECT auth.uid()));
