-- Migration 0004: Row Level Security policies
-- Ver spec §6.3

-- =============================================================================
-- Tablas globales: lectura para authenticated, escritura solo service_role
-- =============================================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_type_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE apollo_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE universe_master_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE universe_metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE apollo_budget_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE apollo_credit_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE apollo_budget_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- Read access para todos los autenticados
CREATE POLICY companies_read ON companies FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY company_contacts_read ON company_contacts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY signals_read ON signals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY signal_type_config_read ON signal_type_config FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY scrape_runs_read ON scrape_runs FOR SELECT USING (auth.role() = 'authenticated');

-- Super-admin only para budget y universe master
CREATE POLICY apollo_budget_config_admin ON apollo_budget_config FOR ALL USING (is_super_admin());
CREATE POLICY apollo_credit_usage_admin_read ON apollo_credit_usage_monthly FOR SELECT USING (is_super_admin());
CREATE POLICY apollo_sync_runs_admin_read ON apollo_sync_runs FOR SELECT USING (is_super_admin());
CREATE POLICY apollo_budget_alerts_admin_read ON apollo_budget_alerts FOR SELECT USING (is_super_admin());
CREATE POLICY universe_master_versions_admin ON universe_master_versions FOR ALL USING (is_super_admin());
CREATE POLICY universe_metrics_admin_read ON universe_metrics_snapshots FOR SELECT USING (is_super_admin());
CREATE POLICY candidate_companies_admin ON candidate_companies FOR ALL USING (is_super_admin());
CREATE POLICY super_admins_self ON super_admins FOR SELECT USING (user_id = auth.uid() OR is_super_admin());

-- =============================================================================
-- Tablas por-org
-- =============================================================================
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_universe_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_company_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_company_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_company_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_company_owner_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_dispatches ENABLE ROW LEVEL SECURITY;

-- orgs
CREATE POLICY orgs_select ON orgs FOR SELECT
  USING (user_is_member_of(id) OR is_super_admin());
CREATE POLICY orgs_insert ON orgs FOR INSERT
  WITH CHECK (is_super_admin());
CREATE POLICY orgs_update ON orgs FOR UPDATE
  USING (user_is_admin_of(id) OR is_super_admin());
CREATE POLICY orgs_delete ON orgs FOR DELETE
  USING (is_super_admin());

-- org_members
CREATE POLICY org_members_select ON org_members FOR SELECT
  USING (user_is_member_of(org_id) OR is_super_admin());
CREATE POLICY org_members_insert ON org_members FOR INSERT
  WITH CHECK (user_is_admin_of(org_id) OR is_super_admin());
CREATE POLICY org_members_update ON org_members FOR UPDATE
  USING (user_is_admin_of(org_id) OR is_super_admin());
CREATE POLICY org_members_delete ON org_members FOR DELETE
  USING (user_is_admin_of(org_id) OR is_super_admin());

-- invitations
CREATE POLICY invitations_select ON invitations FOR SELECT
  USING (user_is_admin_of(org_id) OR is_super_admin());
CREATE POLICY invitations_insert ON invitations FOR INSERT
  WITH CHECK (user_is_admin_of(org_id) OR is_super_admin());
CREATE POLICY invitations_update ON invitations FOR UPDATE
  USING (user_is_admin_of(org_id) OR is_super_admin());
CREATE POLICY invitations_delete ON invitations FOR DELETE
  USING (user_is_admin_of(org_id) OR is_super_admin());

-- searches
CREATE POLICY searches_select ON searches FOR SELECT USING (user_is_member_of(org_id));
CREATE POLICY searches_insert ON searches FOR INSERT WITH CHECK (user_is_member_of(org_id));
CREATE POLICY searches_update ON searches FOR UPDATE USING (user_is_member_of(org_id));
CREATE POLICY searches_delete ON searches FOR DELETE USING (user_is_admin_of(org_id));

-- org_universe_targets
CREATE POLICY org_universe_select ON org_universe_targets FOR SELECT USING (user_is_member_of(org_id));
CREATE POLICY org_universe_insert ON org_universe_targets FOR INSERT WITH CHECK (user_is_admin_of(org_id));
CREATE POLICY org_universe_update ON org_universe_targets FOR UPDATE USING (user_is_admin_of(org_id));

-- org_companies
CREATE POLICY org_companies_select ON org_companies FOR SELECT USING (user_is_member_of(org_id));
CREATE POLICY org_companies_insert ON org_companies FOR INSERT WITH CHECK (user_is_member_of(org_id));
CREATE POLICY org_companies_update ON org_companies FOR UPDATE USING (user_is_member_of(org_id));
CREATE POLICY org_companies_delete ON org_companies FOR DELETE USING (user_is_admin_of(org_id));

-- org_company_owners
CREATE POLICY org_company_owners_select ON org_company_owners FOR SELECT
  USING (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));
CREATE POLICY org_company_owners_insert ON org_company_owners FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));
CREATE POLICY org_company_owners_delete ON org_company_owners FOR DELETE
  USING (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));

-- org_company_notes
CREATE POLICY org_company_notes_select ON org_company_notes FOR SELECT
  USING (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));
CREATE POLICY org_company_notes_insert ON org_company_notes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));
CREATE POLICY org_company_notes_update ON org_company_notes FOR UPDATE
  USING (author_user_id = auth.uid());

-- status_history y owner_history: read-only para members
CREATE POLICY status_history_select ON org_company_status_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));
CREATE POLICY owner_history_select ON org_company_owner_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));

-- alert_dispatches
CREATE POLICY alert_dispatches_select ON alert_dispatches FOR SELECT USING (user_is_member_of(org_id));
