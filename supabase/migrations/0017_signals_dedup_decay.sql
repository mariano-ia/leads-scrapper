-- D5 + signal decay: dedup por (company_id, title_hash) + función de decay.
-- Aplicado vía Supabase MCP el 2026-05-14.

ALTER TABLE signals ADD COLUMN IF NOT EXISTS title_hash text;

CREATE OR REPLACE FUNCTION compute_signal_title_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.data IS NOT NULL AND NEW.data ? 'title' THEN
    NEW.title_hash := encode(sha256(convert_to(lower(trim(NEW.data->>'title')), 'UTF8')), 'hex');
  ELSE
    NEW.title_hash := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS signals_title_hash ON signals;
CREATE TRIGGER signals_title_hash
  BEFORE INSERT OR UPDATE ON signals
  FOR EACH ROW
  EXECUTE FUNCTION compute_signal_title_hash();

UPDATE signals
SET title_hash = encode(sha256(convert_to(lower(trim(data->>'title')), 'UTF8')), 'hex')
WHERE data ? 'title' AND title_hash IS NULL;

WITH dupes AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY company_id, title_hash
    ORDER BY occurred_at DESC, id
  ) AS rn
  FROM signals
  WHERE title_hash IS NOT NULL
)
DELETE FROM signals WHERE id IN (SELECT id FROM dupes WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_signals_company_title_hash
  ON signals(company_id, title_hash)
  WHERE title_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION apply_signal_decay()
RETURNS TABLE(signals_decayed int, signals_purged int)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_decayed int := 0;
  v_purged int := 0;
BEGIN
  UPDATE signals
  SET data = jsonb_set(data, '{_original_weight}', to_jsonb(intent_weight))
  WHERE data IS NOT NULL
    AND NOT (data ? '_original_weight');

  WITH decayed AS (
    UPDATE signals s
    SET intent_weight = ROUND(
      ((s.data->>'_original_weight')::numeric *
       POWER(0.5, EXTRACT(EPOCH FROM (now() - s.occurred_at)) / 86400.0 / GREATEST(s.decay_half_life_days, 1)))::numeric,
      2
    )
    WHERE s.data ? '_original_weight'
      AND s.occurred_at < now() - interval '7 days'
      AND s.intent_weight > 0.5
    RETURNING s.id
  )
  SELECT count(*) INTO v_decayed FROM decayed;

  WITH purged AS (
    DELETE FROM signals
    WHERE intent_weight < 1.0
      AND occurred_at < now() - interval '365 days'
    RETURNING id
  )
  SELECT count(*) INTO v_purged FROM purged;

  RETURN QUERY SELECT v_decayed, v_purged;
END;
$$;

REVOKE EXECUTE ON FUNCTION apply_signal_decay() FROM anon, authenticated;
COMMENT ON FUNCTION apply_signal_decay() IS 'Aplica decay exponencial a signals viejos + purga los muertos. Correr 1x/mes via cron.';
