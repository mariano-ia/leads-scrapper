-- AI brief global por empresa (80-150 palabras generadas por Claude).
-- Para F0 vive en companies; per-org variants se agregarían en org_companies más adelante.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ai_brief text,
  ADD COLUMN IF NOT EXISTS ai_brief_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_brief_model text;
