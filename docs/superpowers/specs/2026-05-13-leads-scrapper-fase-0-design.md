# Leads Scrapper — Fase 0 Design Spec

**Fecha**: 2026-05-13
**Estado**: Aprobado (post-brainstorming)
**Owner**: Mariano Noceti (Yacaré)
**Fase**: 0 de 5 — ver Roadmap

---

## 1. Resumen ejecutivo

Construir una plataforma multi-tenant de **señales de intent sobre un universo cualificado de PYMEs argentinas**, orientada a generar leads para servicios de transformación digital/IA de Yacaré (y eventualmente clientes externos sin billing). El núcleo del sistema NO es un scraper del Boletín Oficial, sino un sistema de tres bloques: (1) **universo de empresas** cualificadas obtenidas de Apollo.io más complementos propios, (2) **señales de intent** detectadas vía scraping (postings de empleo, actos societarios, cambios web) que se asocian a empresas del universo con scoring temporal con decay, y (3) **UI + análisis IA** que prioriza empresas por `fit_score × intent_score`, con briefs generados por Claude.

Fase 0 entrega ese motor end-to-end: universo Apollo + 4 fuentes de señales + scoring + LLM filter + AI briefs + UI Robusta con dashboard, alertas, miembros, roles y ownership. **No incluye** pipeline CRM, scoring por interacciones, ni outreach automatizado — esos son F1, F2, F3.

## 2. Contexto y objetivos

**Yacaré** (yacare.io) es un estudio argentino de diseño y desarrollo de productos digitales. La oportunidad de mercado: PYMEs argentinas en proceso de adopción de IA y automatización. Estas empresas tienen tres características útiles para target:
- Tamaño 20-200 empleados (mediana suficiente para presupuesto, chica suficiente para decidir rápido)
- 3-15 años de operación (descartamos recién constituidas que aún están armando lo básico)
- Señales recientes de actividad tech o crecimiento

**Objetivo de F0**: validar que con $100/mes de presupuesto operativo es posible generar leads cualificados de forma sostenida y que el equipo de Yacaré puede operar sobre esos leads con flujo multi-usuario. Métricas de éxito en sección 18.

**Objetivo posterior (post-F0)**: convertir la herramienta interna en SaaS para clientes externos sin tocar la arquitectura base (multi-tenant ya está desde día 1).

## 3. Roadmap

| Fase | Subsistemas | Entrega | Tiempo |
|---|---|---|---|
| **Fase 0 (esta)** | Universo Apollo + señales + scoring + LLM brief + multi-tenant + UI Robusta | Motor + UI operativa para Yacaré | 8 sem |
| Fase 1 | Pipeline CRM-light (estados, transiciones, notas operativas) | El equipo trabaja el lead end-to-end | 1-2 sem |
| Fase 2 | Scoring IA con feedback de interacciones | Priorización dinámica basada en historia | 2 sem |
| Fase 3 | Outreach multicanal automatizado (email, LinkedIn, WhatsApp) | Loop completo descubrimiento→contacto | 3+ sem |
| Fase 4 | Slack notifs, integraciones HubSpot/Pipedrive, billing para SaaS externo | Producto comercializable | 3+ sem |

Cada fase posterior tendrá su propio ciclo de brainstorming → spec → plan.

## 4. Arquitectura conceptual

```
┌──────────────────────────────────────────────────────────────┐
│                     BLOQUE 1 · UNIVERSO                       │
│  Empresas argentinas cualificadas (fit score base)            │
│  Fuente principal: Apollo.io con criterios maestros           │
│  Capa por-org: filtro sobre maestro (sin costo extra Apollo)  │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                     BLOQUE 2 · SEÑALES                       │
│  Eventos asociados a empresas del universo                    │
│   • job_posting     (Bumeran/Computrabajo/ZonaJobs)          │
│   • bo_act          (BO Nacional + BO CABA)                   │
│   • web_change      (scraping semanal de webs propias)        │
│   • apollo_hiring   (flag de Apollo)                          │
│  Cada señal con decay temporal contribuye a intent_score      │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    BLOQUE 3 · UI + IA                         │
│  Empresas ordenadas por fit_score × intent_score              │
│   • LLM filter semántico opcional por search                  │
│   • AI brief auto-generado por Claude por empresa             │
│   • Dashboard + alertas + miembros + roles + ownership        │
│   • Timeline de evolución por empresa                          │
└──────────────────────────────────────────────────────────────┘
```

Tres componentes desplegables:
- **Web app** (Next.js 14 + Vercel)
- **DB + Auth + Storage** (Supabase, sa-east-1, proyecto nuevo)
- **Scrapers + jobs** (Python en GitHub Actions cron)

## 5. Stack técnico

### Frontend / Web
- **Next.js 14** (App Router, Server Actions)
- **TypeScript** estricto
- **Tailwind CSS** + **shadcn/ui** (Radix-based)
- **Lucide icons**
- **TanStack Query** para data fetching cliente
- **Zod** para validación de schemas
- **react-hook-form** para forms (filtros + search builder)
- **Supabase JS client** (con RLS)
- Hosting: **Vercel**

### Backend services
- **Supabase**: Postgres 15+, Auth (email+password+magic link), Storage, Realtime
- **Resend** para envío de emails (usuario ya tiene cuenta)
- **Anthropic Claude** API para LLM filter + AI briefs (modelo: `claude-sonnet-4-6` por costo, configurable)

### Scrapers / jobs
- **Python 3.11+**
- **httpx** para HTTP
- **pdfplumber** para PDFs del BO
- **BeautifulSoup4** + **lxml** para HTML
- **Pydantic 2** para schemas
- **supabase-py** para escritura a Postgres
- **APScheduler** NO (usamos GitHub Actions cron, no scheduler interno)

### CI / hosting jobs
- **GitHub Actions** con cron schedules (cron diario 9am UTC = 6am AR; cron semanal lunes 7am UTC)

### Testing
- Web: **Vitest** + **Playwright** para integration tests
- Python: **pytest** + **pytest-asyncio** + **respx** para mocking httpx
- DB: tests integrales con Supabase local CLI

## 6. Modelo de datos

### Convenciones
- Todas las tablas tienen `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- Todas tienen `created_at timestamptz DEFAULT now()`
- Tablas mutables tienen `updated_at timestamptz` con trigger
- Soft delete no se usa en F0 — borrar = `DELETE`
- Todos los timestamps son timestamptz (UTC)
- Todas las columnas son snake_case

### 6.1 Tablas globales (sin `org_id`)

Estas tablas son hechos objetivos compartidos por todas las orgs.

#### `companies`
```sql
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apollo_id text UNIQUE,
  cuit text UNIQUE,
  razon_social text NOT NULL,
  nombre_comercial text,
  dominio text,
  sector text,                          -- Apollo industry
  subsector text,
  headcount_range text,                 -- "20-50", "51-100", etc.
  founded_year int,
  location_pais text DEFAULT 'AR',
  location_provincia text,
  location_ciudad text,
  tech_stack jsonb DEFAULT '[]'::jsonb,
  apollo_data jsonb,                    -- payload completo de Apollo
  status text NOT NULL DEFAULT 'active', -- active | inactive | merged_into
  merged_into_id uuid REFERENCES companies(id),
  last_apollo_sync_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_must_have_id CHECK (
    apollo_id IS NOT NULL OR cuit IS NOT NULL
  )
);

CREATE INDEX idx_companies_sector ON companies(sector) WHERE status = 'active';
CREATE INDEX idx_companies_provincia ON companies(location_provincia) WHERE status = 'active';
CREATE INDEX idx_companies_headcount ON companies(headcount_range) WHERE status = 'active';
CREATE INDEX idx_companies_tech ON companies USING gin (tech_stack);
CREATE INDEX idx_companies_dominio ON companies(dominio) WHERE dominio IS NOT NULL;
```

**Identidad**: una empresa se identifica idealmente por `apollo_id`; subsidiariamente por `cuit` (BO sin counterpart Apollo); finalmente por `dominio`. Cuando se cruzan dos identidades, se hace merge vía función `merge_companies(target_id uuid, source_id uuid)` que consolida señales, contactos, y marca source como `status='merged_into'` con `merged_into_id = target_id`.

#### `company_contacts`
```sql
CREATE TABLE company_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  apollo_person_id text,
  full_name text NOT NULL,
  title text,
  email text,
  email_status text,                    -- verified | unverified | bounced | unknown
  linkedin_url text,
  phone text,
  is_decision_maker bool DEFAULT false,
  source text NOT NULL,                 -- apollo | web_scrape | manual
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

CREATE INDEX idx_company_contacts_company ON company_contacts(company_id);
CREATE INDEX idx_company_contacts_apollo_id ON company_contacts(apollo_person_id) WHERE apollo_person_id IS NOT NULL;
```

#### `signals`
```sql
CREATE TABLE signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL,                   -- job_posting | bo_act | web_change | apollo_hiring
  source text NOT NULL,                 -- bumeran | computrabajo | zonajobs | bo_nacional | bo_caba | apollo | web_scrape
  occurred_at timestamptz NOT NULL,     -- cuándo pasó el evento (fecha del posting, del acto BO, etc.)
  detected_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  intent_weight numeric(5,2) NOT NULL,  -- peso base configurable por tipo
  decay_half_life_days int NOT NULL,    -- default por tipo
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signals_company_occurred ON signals(company_id, occurred_at DESC);
CREATE INDEX idx_signals_type_occurred ON signals(type, occurred_at DESC);
CREATE INDEX idx_signals_recent ON signals(occurred_at DESC) WHERE occurred_at > now() - interval '180 days';
```

**Pesos default por tipo** (configurables en `signal_type_config`):
- `job_posting` con keywords tech (data, AI, automation, head of digital, CTO): weight 30, half_life 30 días
- `job_posting` regular: weight 10, half_life 30 días
- `bo_act` (ampliacion_capital, fusion, cambio_objeto): weight 20, half_life 180 días
- `web_change` (productos, equipo, blog_tech): weight 15, half_life 60 días
- `apollo_hiring`: weight 25, half_life 45 días

#### `signal_type_config`
```sql
CREATE TABLE signal_type_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  variant text,                         -- ej. "tech_keywords" para job_posting
  intent_weight numeric(5,2) NOT NULL,
  decay_half_life_days int NOT NULL,
  match_rules jsonb,                    -- ej. {"title_keywords_any": ["cto", "head of digital"]}
  active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type, variant)
);
```

#### `apollo_sync_runs`
```sql
CREATE TABLE apollo_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,                   -- initial | delta | targeted_contacts
  master_version_id uuid REFERENCES universe_master_versions(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running', -- running | completed | failed | aborted
  companies_added int DEFAULT 0,
  companies_updated int DEFAULT 0,
  contacts_added int DEFAULT 0,
  contacts_updated int DEFAULT 0,
  credits_used int DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  aborted_reason text                   -- ej. "budget_exceeded"
);

CREATE INDEX idx_apollo_runs_started ON apollo_sync_runs(started_at DESC);
```

#### `scrape_runs`
```sql
CREATE TABLE scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,                 -- bumeran | computrabajo | zonajobs | bo_nacional | bo_caba | web_scrape
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  items_scraped int DEFAULT 0,
  signals_inserted int DEFAULT 0,
  companies_matched int DEFAULT 0,
  items_unmatched int DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb
);

CREATE INDEX idx_scrape_runs_source_started ON scrape_runs(source, started_at DESC);
```

#### `candidate_companies`
Empresas detectadas por scrapers (típicamente BO) que NO matchean ninguna `companies` existente. Reservorio para futura promoción al universo.
```sql
CREATE TABLE candidate_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuit text UNIQUE,
  razon_social text NOT NULL,
  source text NOT NULL,                 -- bo_nacional | bo_caba | etc.
  source_data jsonb,
  detection_count int DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  promoted_to_company_id uuid REFERENCES companies(id)
);
```

#### `universe_master_versions`
```sql
CREATE TABLE universe_master_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_int int NOT NULL UNIQUE,
  config jsonb NOT NULL,                -- ver §7.1
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deactivated_at timestamptz,
  is_active bool NOT NULL DEFAULT false,
  companies_count_snapshot int,         -- después de aplicar
  credits_used_to_build int,
  CONSTRAINT one_active_master UNIQUE (is_active) DEFERRABLE INITIALLY DEFERRED
);
```
Nota: el UNIQUE en `is_active` solo permite una fila con `true` activa, lo otras tienen `false`. Trigger valida.

#### `apollo_budget_config`
```sql
CREATE TABLE apollo_budget_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_budget_credits int NOT NULL,
  alert_thresholds_pct int[] NOT NULL DEFAULT ARRAY[70, 85, 95],
  hard_stop_pct int NOT NULL DEFAULT 100,
  alert_emails text[] NOT NULL DEFAULT '{}',
  apollo_plan_name text,                -- "basic" | "professional" | etc.
  apollo_plan_monthly_usd numeric(8,2),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Solo una fila esperada en F0
```

#### `apollo_credit_usage_monthly`
```sql
CREATE TABLE apollo_credit_usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL UNIQUE,      -- "2026-05"
  credits_used int NOT NULL DEFAULT 0,
  last_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### `apollo_budget_alerts`
```sql
CREATE TABLE apollo_budget_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL,
  threshold_pct int NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  credits_used_at_alert int NOT NULL,
  UNIQUE (year_month, threshold_pct)    -- evita spam: 1 alerta por threshold por mes
);
```

#### `universe_metrics_snapshots`
```sql
CREATE TABLE universe_metrics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at timestamptz NOT NULL DEFAULT now(),
  master_version_id uuid REFERENCES universe_master_versions(id),
  companies_count int NOT NULL,
  contacts_count int NOT NULL,
  companies_with_email_count int NOT NULL,
  companies_with_dm_count int NOT NULL,  -- decision makers
  by_sector jsonb,                       -- {"IT services": 1234, ...}
  by_provincia jsonb,
  by_headcount_range jsonb,
  signals_last_7d int,
  signals_last_30d int
);
```

### 6.2 Tablas por-org (con `org_id` + RLS)

#### `orgs`
```sql
CREATE TABLE orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### `org_members`
```sql
CREATE TABLE org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,                   -- admin | member
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_user ON org_members(user_id);
```

#### `invitations`
```sql
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL,
  token text UNIQUE NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### `org_universe_targets`
```sql
CREATE TABLE org_universe_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  version_int int NOT NULL,
  config jsonb NOT NULL,                -- ver §7.2
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deactivated_at timestamptz,
  is_active bool NOT NULL DEFAULT false,
  companies_count_snapshot int,
  UNIQUE (org_id, version_int)
);
```

#### `searches`
```sql
CREATE TABLE searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL,               -- ver §7.3
  llm_filter_text text,
  min_combined_score numeric(5,3) NOT NULL DEFAULT 0.300,
  alert_enabled bool NOT NULL DEFAULT false,
  alert_email text,
  digest_mode text NOT NULL DEFAULT 'immediate', -- immediate | daily
  created_by uuid NOT NULL REFERENCES auth.users(id),
  active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### `org_companies`
```sql
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
  status text NOT NULL DEFAULT 'new',   -- new | reviewed | qualified | disqualified | in_pipeline
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, company_id)
);

CREATE INDEX idx_org_companies_org ON org_companies(org_id);
CREATE INDEX idx_org_companies_score ON org_companies(org_id, last_combined_score DESC);
CREATE INDEX idx_org_companies_status ON org_companies(org_id, status);
```

#### `org_company_owners`
```sql
CREATE TABLE org_company_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE (org_company_id, user_id)
);
```

#### `org_company_notes`
```sql
CREATE TABLE org_company_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_company_notes_oc ON org_company_notes(org_company_id, created_at DESC);
```

#### `org_company_status_history`
```sql
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
```

#### `org_company_owner_history`
```sql
CREATE TABLE org_company_owner_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES auth.users(id),
  to_user_id uuid REFERENCES auth.users(id),
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
```

#### `alert_dispatches`
```sql
CREATE TABLE alert_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  search_id uuid NOT NULL REFERENCES searches(id),
  org_company_id uuid NOT NULL REFERENCES org_companies(id),
  channel text NOT NULL,                -- email
  recipient text NOT NULL,
  digest_mode text NOT NULL,            -- immediate | daily
  resend_id text,                       -- ID de Resend para tracking
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent'   -- sent | bounced | failed
);

CREATE INDEX idx_alert_dispatches_org ON alert_dispatches(org_id, sent_at DESC);
```

### 6.3 RLS policies

Habilitar RLS en todas las tablas por-org:
```sql
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
```

Helper function:
```sql
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
```

Policy genérica (ejemplo para `org_companies`):
```sql
CREATE POLICY org_companies_select ON org_companies
  FOR SELECT
  USING (user_is_member_of(org_id));

CREATE POLICY org_companies_insert ON org_companies
  FOR INSERT
  WITH CHECK (user_is_member_of(org_id));

CREATE POLICY org_companies_update ON org_companies
  FOR UPDATE
  USING (user_is_member_of(org_id));

CREATE POLICY org_companies_delete ON org_companies
  FOR DELETE
  USING (user_is_admin_of(org_id));
```

Misma estructura para `searches`, `org_company_owners`, `org_company_notes`, `org_company_status_history`, `org_company_owner_history`, `alert_dispatches`, `org_universe_targets`.

`orgs` y `org_members` tienen políticas especiales — el detalle completo está en las migraciones (referenciadas en el plan).

Tablas globales (`companies`, `signals`, `company_contacts`, `apollo_*`, `scrape_runs`, `candidate_companies`, `universe_master_versions`, `universe_metrics_snapshots`, `signal_type_config`): RLS enabled con policy `USING (auth.role() = 'authenticated')` para SELECT, y `service_role` only para INSERT/UPDATE/DELETE.

### 6.4 Super-admin

Super-admin se identifica por una tabla aparte:
```sql
CREATE TABLE super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid());
$$;
```

`universe_master_versions`, `apollo_budget_config`, `signal_type_config` solo escribibles por super-admin desde la app. Seed inicial vía SQL.

## 7. Schemas JSONB

### 7.1 `universe_master_versions.config`
```json
{
  "location_country": "AR",
  "headcount_min": 10,
  "headcount_max": 500,
  "founded_year_min": 2005,
  "founded_year_max": null,
  "industries": ["Information Technology and Services", "Marketing and Advertising", "Retail", "Construction", "Logistics and Supply Chain", "..."],
  "exclude_industries": ["Defense", "Tobacco"],
  "keywords_any": [],
  "max_companies_target": 15000
}
```

### 7.2 `org_universe_targets.config`
Filtro sobre el universo maestro:
```json
{
  "industries_any": ["Information Technology and Services"],
  "industries_none": [],
  "headcount_min": 20,
  "headcount_max": 200,
  "founded_year_min": 2010,
  "founded_year_max": 2022,
  "provincias_any": ["CABA", "PBA"],
  "technologies_any": [],
  "technologies_none": []
}
```

### 7.3 `searches.filters`
```json
{
  "fit": {
    "apollo_industries": ["Information Technology and Services"],
    "apollo_keywords": ["software", "consultoría"],
    "headcount_min": 20,
    "headcount_max": 200,
    "founded_year_min": 2010,
    "founded_year_max": 2022,
    "location_country": "AR",
    "location_provincias": ["CABA", "PBA"],
    "technologies_any": ["Wordpress", "Shopify"],
    "technologies_none": ["Salesforce"],
    "has_apollo_data": true
  },
  "intent": {
    "job_posting": {
      "in_last_days": 30,
      "title_keywords_any": ["data", "automation", "head of digital", "cto"],
      "min_postings_in_window": 1
    },
    "bo_act": {
      "in_last_days": 180,
      "types": ["ampliacion_capital", "fusion", "cambio_objeto"]
    },
    "web_change": {
      "in_last_days": 60,
      "categories_any": ["equipo", "productos", "blog_tech"]
    },
    "min_intent_score": 30,
    "require_at_least_one_signal": true
  }
}
```

Todos los campos opcionales — null/missing significa "no filtra".

## 8. Scoring

### 8.1 `fit_score(company, search)` → [0, 1]
Determinístico, calculado en SQL via función. Cada criterio cumplido suma puntos ponderados:
- Industry match: 0.30 (binario)
- Headcount in range: 0.20 (binario)
- Founded year in range: 0.10 (binario)
- Provincia match: 0.15 (binario)
- Technology match (any): 0.15 (binario)
- Keywords match: 0.10 (parcial: count matches / total)

Si `search.filters.fit` excluye explícitamente vía `technologies_none` o `industries_none`, `fit_score = 0`.

### 8.2 `intent_score(company)` → [0, ∞)
Por empresa, agregando todas las signals con decay:
```
intent_score = Σ over signals: signal.intent_weight × exp(-Δdays × ln(2) / decay_half_life_days)
```
Donde `Δdays = now() - signal.occurred_at` en días.

Implementado como función SQL inmutable que se invoca al consultar (no cacheado en F0).

### 8.3 `combined_score(company, search)` → [0, ∞)
```
combined = fit_score(company, search) × intent_score(company)
```
Producto: ambos tienen que ser altos. Una empresa "perfect fit" sin señales recientes da combined bajo. Una empresa con señales fuertes pero fuera del fit (e.g., sector excluido) da combined cero.

### 8.4 `llm_score(company, search)` → [0, 100]
Solo si `search.llm_filter_text` no es null. Anthropic Claude recibe:
- Company info (nombre, sector, headcount, fundación, tech stack, top contactos)
- Recent signals (últimos 90 días)
- AI brief si existe
- `llm_filter_text` como ICP

Prompt template estructurado, output JSON `{score: int, reasoning: string}`. Cacheado en `org_companies.last_llm_score` con TTL implícito basado en `last_scored_at`.

### 8.5 Ranking final
```sql
ORDER BY combined_score DESC, llm_score DESC NULLS LAST
```

## 9. Flujos clave

### 9.1 Sync semanal Apollo (lunes 7am UTC = 4am AR)

```
github_actions: .github/workflows/apollo_sync.yml (cron: '0 7 * * 1')
  ↓
scrapers/jobs/apollo_sync.py [--mode=delta]
  1. Check budget: SELECT * FROM apollo_credit_usage_monthly WHERE year_month = current
     Si proyectado > hard_stop_pct → ABORT, INSERT en apollo_budget_alerts, email super-admin
  2. Load universe_master_versions WHERE is_active = true
  3. Apollo Search API con criterios del maestro + filtro last_updated_at > now() - 7d
  4. Paginar resultados
  5. UPSERT companies por apollo_id (last_seen_at = now())
  6. Para empresas en org_companies de cualquier org → refresh top contacts (max 5/empresa)
  7. UPSERT company_contacts con apollo_person_id
  8. Update apollo_credit_usage_monthly + chequear thresholds
  9. INSERT apollo_sync_runs con stats
  10. INSERT universe_metrics_snapshots
```

### 9.2 Scraping diario (6am AR = 9am UTC, lunes a sábado)

```
github_actions: .github/workflows/daily_scrape.yml (cron: '0 9 * * 1-6')
  ↓
[parallel jobs]
  scrapers/jobs/scrape_bumeran.py
  scrapers/jobs/scrape_computrabajo.py
  scrapers/jobs/scrape_zonajobs.py

  Para cada uno:
    1. Load active companies con razon_social
    2. Para cada empresa (paginado en chunks de 100):
       a. Query al portal por nombre exacto
       b. Filter postings con date > now() - 7d
       c. Para cada posting: INSERT signal (type=job_posting, occurred_at=posting_date, data={titulo, descripcion_summary, url, portal})
    3. Log scrape_runs

  scrapers/jobs/scrape_bo_nacional.py + scrape_bo_caba.py
    1. Download Sección Segunda del día anterior (PDF + HTML)
    2. Upload PDF original a Supabase Storage bucket raw-pdfs/{date}/{source}.pdf
    3. Parsear actos societarios
    4. Para cada acto:
       a. MATCH contra companies WHERE cuit = acto.cuit
       b. Si NO match → MATCH contra razon_social fuzzy (similarity > 0.85)
       c. Si match → INSERT signal (type=bo_act, occurred_at=acto.fecha, data={tipo_acto, capital, etc.})
       d. Si NO match → INSERT/UPSERT candidate_companies
    5. Log scrape_runs
  ↓
scrapers/jobs/re_evaluate_searches.py
  1. SELECT searches WHERE active = true
  2. Para cada search, evaluar contra companies con signals nuevas en últimos 7 días:
     a. Computar fit_score(company, search.filters.fit)
     b. Computar intent_score(company) (con decay desde now)
     c. Computar combined_score = fit × intent
     d. Si combined > search.min_combined_score:
        - UPSERT org_companies con scores actualizados
        - Si no existía: first_matched_at = now()
        - Si search.alert_enabled: enqueue alerta
  ↓
scrapers/jobs/llm_score_pending.py
  1. SELECT org_companies WHERE last_llm_score IS NULL OR last_scored_at < now() - 7d
     JOIN searches WHERE llm_filter_text IS NOT NULL
  2. Para cada (org_company, search): Anthropic API call con prompt template
  3. UPDATE org_companies con last_llm_score, last_llm_reasoning, last_scored_at
  ↓
scrapers/jobs/generate_ai_briefs.py
  1. SELECT org_companies WHERE ai_brief IS NULL OR ai_brief_generated_at < now() - 14d
  2. Anthropic API call con company + signals + contacts + recent_notes_summary
  3. UPDATE org_companies con ai_brief, ai_brief_generated_at
  ↓
scrapers/jobs/send_alerts.py
  1. SELECT org_companies marked for alert (immediate mode) o accumulated for digest (daily mode)
  2. Para cada: render email template, Resend API
  3. INSERT alert_dispatches
```

### 9.3 Web changes (semanal, lunes 5am AR)

```
scrapers/jobs/scrape_web_changes.py
  1. SELECT companies WHERE dominio IS NOT NULL AND status = 'active'
  2. Para cada: GET https://{dominio}, GET /equipo, /productos, /blog (best-effort)
  3. Comparar con snapshot anterior (almacenado en Supabase Storage)
  4. Si cambio significativo: INSERT signal (type=web_change, data={categoria, summary_diff})
  5. Update snapshot
```

### 9.4 Crear / editar search desde UI

```
POST /api/searches (Server Action)
  1. Validate filters JSONB schema (Zod)
  2. Insert searches
  3. Trigger backfill (async, no bloquea response):
     - Evaluate filters contra companies (limit 5000 candidates fit_score > 0.3)
     - UPSERT org_companies con scores
     - Si llm_filter_text: enqueue LLM scoring
  4. Return search id + estimación de matches iniciales
```

### 9.5 Alerta de match nuevo (immediate mode)

```
INSERT org_companies (con last_combined_score ≥ min)
  → Postgres trigger después de INSERT (mismo tx)
  → INSERT job en queue table 'alert_queue' (id, org_company_id, search_id)
  → next.js polling cada 60s OR Supabase Realtime channel
  → Server Action: render template, Resend send, INSERT alert_dispatches
```

Para `digest_mode = daily`: el job `send_alerts.py` recolecta todas las alertas pendientes del día y manda un único email.

### 9.6 Onboarding nuevo tenant

```
1. Super-admin va a /admin/orgs/new
2. Form: org name + slug + admin email
3. Server Action:
   a. INSERT orgs
   b. Create invitation (token random 32 chars, expires_at = now() + 7d)
   c. Resend send: "Te invitaron a la org X de Yacaré Leads, hacé click aquí"
4. Admin recibe email → /accept-invite/[token]
5. Si no tiene cuenta: signup flow (email + password vía Supabase Auth)
6. Si tiene cuenta: login flow
7. POST /api/accept-invite:
   a. Validate token (existe, no expirado, no usado)
   b. INSERT org_members con role='admin'
   c. UPDATE invitations SET accepted_at = now()
   d. Redirect a /[org_slug]/dashboard
8. Admin invita otros miembros desde /[org_slug]/members
```

### 9.7 Apollo budget guardrail check

```
function check_apollo_budget(estimated_credits int) returns enum:
  load apollo_budget_config (single row)
  load apollo_credit_usage_monthly WHERE year_month = current
  
  projected_credits = current_credits_used + estimated_credits
  projected_pct = projected_credits / monthly_budget_credits * 100
  
  if projected_pct >= hard_stop_pct:
    return 'abort'
  for threshold in alert_thresholds_pct (desc):
    if projected_pct >= threshold and not already_alerted_this_month(threshold):
      send_alert(threshold, current_credits_used, projected_credits)
      INSERT apollo_budget_alerts
  
  return 'proceed'
```

## 10. Integraciones externas

### 10.1 Apollo.io API
- Plan **Basic** ($99/mes — verificar pricing al integrar)
- Auth: API key en `APOLLO_API_KEY` env var
- Endpoints clave:
  - `POST /mixed_people/search` para listar people (contactos) por org
  - `POST /accounts/search` para listar empresas
  - `POST /people/match` para enriquecer persona específica
- Rate limit: ~50 req/sec en Basic (verificar)
- Pagination: page_size hasta 100
- Credits: 1 export = 1 credit por persona revealed
- **Decision**: usar `/accounts/search` para sync de universo, `/mixed_people/search` para contactos clave (no exportar todos, solo top 3-5 por empresa)
- Wrapper Python: `scrapers/clients/apollo_client.py` con retry exponencial + budget check antes de cada call

### 10.2 Anthropic Claude API
- Model: `claude-sonnet-4-6` (default), configurable via env `ANTHROPIC_MODEL`
- Use cases:
  - LLM filter: prompt estructurado, output JSON `{score: int, reasoning: string}`
  - AI brief: prompt narrativo, output texto 80-150 palabras
- Prompt caching: para system prompt + company context que se reusa, cache_control breakpoint
- Estimación volumen: ~1000 empresas × 2 LLM ops × 800 tokens promedio = 1.6M tokens/sem ≈ $5/sem con caching

### 10.3 Resend API
- Auth: `RESEND_API_KEY` env var (usuario ya tiene cuenta)
- Dominio verificado: usar subdominio `leads.yacare.io` o similar (a setear en dashboard de Resend)
- Templates HTML usando React Email o templates simples
- Webhooks para tracking de delivery/bounces (opcional F0.5)

### 10.4 Supabase
- Proyecto nuevo en `sa-east-1` (Buenos Aires) — confirmación de usuario antes de crear
- Auth con email+password y magic link
- Storage buckets:
  - `raw-pdfs` (privado, scrapers escriben con service_role)
  - `web-snapshots` (privado, web change tracking)
- Realtime habilitado en `alert_queue`

### 10.5 GitHub Actions
- Repo en GitHub (a crear)
- Workflows:
  - `.github/workflows/ci.yml` — tests, linting, type-check on push/PR
  - `.github/workflows/apollo_sync.yml` — cron lunes 7am UTC
  - `.github/workflows/daily_scrape.yml` — cron Mon-Sat 9am UTC
  - `.github/workflows/web_changes.yml` — cron lunes 8am UTC
- Secrets en GitHub repo settings: `SUPABASE_SERVICE_ROLE_KEY`, `APOLLO_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, etc.

## 11. UI / Pantallas

Total: ~17 pantallas. Listadas con permisos requeridos.

### Auth (públicas / sesión)
- `/login` — email + password / magic link
- `/accept-invite/[token]` — flujo de aceptación con auto-signup si user no existe
- `/reset-password`
- `/select-org` — si user pertenece a >1 org
- `/account` — perfil personal

### Operación (member+ de la org)
- `/[org_slug]/companies` — tabla paginada, filtros laterales, columnas: razón social, sector, headcount, fit, intent, combined, signals_30d, owner, AI brief preview, status
- `/[org_slug]/companies/[id]` — detalle:
  - Header: razón social, sector, scores
  - Tabs: Overview / Timeline / Contacts / Notes
  - Timeline: UNION cronológico de status_history + owner_history + notes + signals + ai_brief_generated + search_matched
  - Sidebar: AI brief, contactos decision makers, actions (asignar owner, cambiar status, agregar nota, abrir LinkedIn de socios pre-armado)
- `/[org_slug]/searches` — listado + crear/editar/desactivar
- `/[org_slug]/searches/new` y `/[org_slug]/searches/[id]/edit` — wizard (Fit/Intent/ICP/Alerts) con preview de matches

### Dashboard + alerts (member+ de la org)
- `/[org_slug]/dashboard` — KPIs: empresas en radar, signals últimos 7/30 días por tipo, top searches por matches, % con AI brief, sankey de status flow
- `/[org_slug]/alerts` — historial de envíos + config de digest vs immediate

### Admin de org (admin role)
- `/[org_slug]/universe` — editar target de la org, ver versions, preview "X empresas en mi target"
- `/[org_slug]/members` — invitar, cambiar rol, remover, pending invites
- `/[org_slug]/settings` — nombre, slug, branding mínimo

### Super-admin
- `/admin/orgs` — listado global, crear nueva org
- `/admin/universe` — editar maestro, versions, dispara sync, consumo créditos histórico
- `/admin/usage` — vista detallada budget Apollo + alertas históricas

## 12. Deployment

- **Web (Next.js)**: Vercel, branch `main` = production, `develop` = staging
- **Scrapers**: GitHub Actions corriendo del repo
- **DB**: Supabase managed
- **Secrets**: Vercel env vars + GitHub Actions secrets
- **Domain**: a definir (sugerido `leads.yacare.io` o subdominio de un dominio que tenga Yacaré)

## 13. Costos recurrentes mensuales

| Servicio | USD/mes | Notas |
|---|---|---|
| Apollo.io Basic | $99 | Fijo. Sin overages — si se agotan créditos, calls fallan hasta próximo ciclo |
| Supabase Free | $0 | 500MB DB, 1GB Storage. Suficiente para F0 |
| Vercel Hobby | $0 | Suficiente para F0 |
| Anthropic Claude API | ~$10 | LLM filter + AI briefs con caching agresivo |
| Resend Free | $0 | 3K emails/mes |
| GitHub Actions | $0 | 2K min/mes (uso estimado <500 min) |
| Sentry Free | $0 | Opcional. 5K events/mes |
| Dominio | ~$1 | Prorrateado |
| **Total** | **~$110** | Margen para Claude API si escala |

## 14. Riesgos y mitigaciones

| Riesgo | Impacto | Prob | Mitigación |
|---|---|---|---|
| Apollo Basic créditos insuficientes | Alto | Media | Budget guardrail con alerts a 70/85/95% + hard stop a 100% + sync delta acotado |
| Selectores scrapers se rompen | Medio | Alta | Tests con HTML fixtures en CI + Sentry alert on errors |
| Cobertura Apollo PYMEs AR baja | Alto | Media | Plan B: candidate_companies del BO promote to universe |
| Data leak via bug RLS | Crítico | Baja | Tests integrales que crean 2 orgs y validan aislamiento + CI gate |
| LLM costs escalan | Medio | Baja | Prompt caching + regen solo on signal nueva o cambio config |
| Apollo rate limits en sync | Medio | Media | Backoff exponencial + sync delta por chunks (provincia/sector) |
| Matching ambiguo postings ↔ empresas | Medio | Alta | Match estricto exact name en F0; fuzzy con score min en F0.5 |
| Yacaré itera ICP frecuente | Bajo | Alta | Feature: versioning de targets + searches permite iteración sin perder histórico |
| BO HTML cambia layout | Medio | Media | PDF parsing como fuente primaria; HTML como secundaria; raw PDFs en Storage para reproceso |

## 15. Decisiones reversibles vs irreversibles

**Fácil cambiar (horas/días):**
- LLM provider (Anthropic ↔ OpenAI ↔ Google) — abstracción `LLMProvider`
- Enrichment provider (sumar Snov.io secundario) — abstracción `EnrichmentProvider`
- Email provider (Resend ↔ Postmark) — abstracción `EmailProvider`
- Selectores específicos de scraping
- Pesos y decay de signals (config, no código)
- Universe target master/per-org config (via UI versionado)

**Caro cambiar (semanas):**
- Companies/signals como centro (vs leads)
- Two-layer universe target
- Multi-tenant via RLS Postgres
- Apollo como source primario
- Schema canónico de signals con decay

**Casi imposible:**
- Stack base (Supabase/Next.js/Python)
- Decisión multi-tenant SaaS-ready

## 16. Métricas de éxito

**Semana 4 (hito):**
- ≥ 5K empresas en universo Apollo
- ≥ 80% con ≥ 1 decision maker identificado + email
- Signals llegando de las 4 fuentes operativas

**Semana 8 (cierre F0):**
- Sistema operativo sin intervención manual diaria
- Yacaré con ≥ 1 search activa + alertas funcionando
- ≥ 50 empresas en `org_companies` de Yacaré con `combined > 0.4`
- ≥ 1 conversación iniciada con un lead surgido del sistema

**Semana 12 (post-F0):**
- ≥ 1 lead convertido a conversación productiva
- Decisión data-driven: F1 sigue, o reordenamos

## 17. Fuera de scope (F1+)

Documentado para evitar scope creep en F0:
- Pipeline CRM con estados de venta (F1)
- Outreach automatizado (F3)
- Scoring con feedback de interacciones (F2)
- Auto-registro de orgs (post-F0)
- Billing (F4)
- Universos privados por-org de Apollo (post-F0)
- Slack notifs (F4 o F0.5 si tiempo sobra)
- LinkedIn Jobs como fuente (presupuesto)
- BuiltWith integration (presupuesto)
- Snov.io como provider primario (Apollo cubre)
- SerpAPI lookup workflow (no necesario con Apollo)
- Mobile app (web responsive es suficiente)
- Export complejo (CSV simple solamente en F0)
- Webhooks salientes a terceros
- API pública para clientes

## 18. Open questions

Resolverse durante implementación con decisiones reversibles, no bloqueantes:
- **Apollo pricing exacto Basic 2026**: verificar al integrar API. Si Basic da <1500 créditos/mes, evaluar Professional. Decisión a semana 2.
- **Exact match fuzzy threshold para postings**: empezar con exact, calibrar en semana 3 con data real.
- **AI brief refresh frequency**: default 14 días, ajustar según costos reales LLM.
- **Universe master refresh frequency**: default semanal, ajustar si costo o data freshness lo requieren.
- **Dominio para Resend**: usar `leads.yacare.io` (Mariano confirma DNS), o `notifications.yacare.io`. Decisión a semana 7.

## 19. Apéndice: Estructura del repo

```
leads-scrapper/
├── CLAUDE.md
├── README.md
├── .gitignore
├── .env.example
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   └── 2026-05-13-leads-scrapper-fase-0-design.md
│       └── plans/
│           ├── 2026-05-13-week1-foundation.md
│           └── (more plans as we progress)
├── web/                         # Next.js app
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.mjs
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── tests/
├── scrapers/                    # Python package
│   ├── pyproject.toml
│   ├── src/leads_scrapper/
│   │   ├── clients/             # Apollo, Anthropic, Resend, Supabase wrappers
│   │   ├── scrapers/            # Source-specific scrapers (BO, Bumeran, etc.)
│   │   ├── jobs/                # Entry points for GH Actions
│   │   ├── models/              # Pydantic schemas
│   │   └── utils/
│   └── tests/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 0001_init_schema_globales.sql
│   │   ├── 0002_init_schema_org.sql
│   │   ├── 0003_rls_policies.sql
│   │   ├── 0004_signal_type_config_seed.sql
│   │   ├── 0005_apollo_budget_seed.sql
│   │   └── (more)
│   └── functions/               # Edge functions Deno (si las usamos en F0)
└── .github/
    └── workflows/
        ├── ci.yml
        ├── apollo_sync.yml
        ├── daily_scrape.yml
        └── web_changes.yml
```

---

**Fin del spec. Próximo paso**: plan de implementación de Week 1 (Foundation) en `docs/superpowers/plans/2026-05-13-week1-foundation.md`.
