-- Migration 0003: super_admins + helper functions
-- Ver spec §6.4

CREATE TABLE super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

-- Helper functions

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.user_is_member_of(target_org_id uuid)
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = target_org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_admin_of(target_org_id uuid)
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = target_org_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;
