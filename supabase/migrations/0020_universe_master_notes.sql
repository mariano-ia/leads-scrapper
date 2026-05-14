-- Columna notes para el master universe editor (cambios + razón).
-- Aplicado vía Supabase MCP el 2026-05-14.
ALTER TABLE universe_master_versions ADD COLUMN IF NOT EXISTS notes text;
