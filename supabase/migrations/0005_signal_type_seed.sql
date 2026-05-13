-- Migration 0005: seed de signal_type_config
-- Pesos default por tipo, ver spec §6.1 (sección signals)

INSERT INTO signal_type_config (type, variant, intent_weight, decay_half_life_days, match_rules) VALUES
  ('job_posting', 'tech', 30.0, 30,
   '{"title_keywords_any": ["data", "ml", "ai", "automation", "head of digital", "cto", "transformación digital"]}'::jsonb),
  ('job_posting', 'general', 10.0, 30, NULL),
  ('bo_act', 'ampliacion_capital', 20.0, 180, NULL),
  ('bo_act', 'fusion', 25.0, 180, NULL),
  ('bo_act', 'cambio_objeto', 15.0, 180, NULL),
  ('web_change', 'productos', 18.0, 60, NULL),
  ('web_change', 'equipo', 15.0, 60, NULL),
  ('web_change', 'blog_tech', 12.0, 60, NULL),
  ('apollo_hiring', NULL, 25.0, 45, NULL);
