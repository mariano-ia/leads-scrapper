-- Migration 0008: security hardening basado en advisors
-- 1. set_updated_at: definir search_path explícito (evita CVE search_path hijacking)
-- 2. Revocar EXECUTE de helper functions desde anon (no autenticados no las necesitan)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_is_member_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_is_admin_of(uuid) FROM anon;
