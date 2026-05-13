-- Mensajes de outreach generados / enviados desde el producto.
-- Cada row es un draft generado por IA y opcionalmente enviado vía Resend.
-- Aplicado vía Supabase MCP el 2026-05-13.
CREATE TABLE outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES company_contacts(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','failed','bounced','replied')),
  generated_by_user_id uuid REFERENCES auth.users(id),
  sent_via text,
  sent_at timestamptz,
  resend_message_id text,
  ai_model text,
  context_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_outreach_by_org ON outreach_messages(org_id, created_at DESC);
CREATE INDEX idx_outreach_by_company ON outreach_messages(company_id, created_at DESC);
CREATE INDEX idx_outreach_by_contact ON outreach_messages(contact_id) WHERE contact_id IS NOT NULL;

ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_read ON outreach_messages FOR SELECT USING (user_is_member_of(org_id));
CREATE POLICY outreach_insert ON outreach_messages FOR INSERT WITH CHECK (user_is_member_of(org_id));
CREATE POLICY outreach_update ON outreach_messages FOR UPDATE USING (user_is_member_of(org_id));

CREATE TRIGGER outreach_updated_at BEFORE UPDATE ON outreach_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
