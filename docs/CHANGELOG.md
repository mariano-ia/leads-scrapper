# Changelog

Registro cronológico de lo que se construyó, sesión por sesión. Cada entrada incluye fecha, qué se hizo, decisiones importantes, y qué quedó pendiente. El "porqué" detrás de las decisiones grandes está en `docs/decisions/`.

## 2026-05-13 · Sesión 4: Contactos, scoring real, dashboard expandido

### Contactos (Apollo people search)
- Nuevo server action `fetchContactsAction(orgSlug, companyId, { max })` en `web/app/[org_slug]/companies/[id]/actions.ts` que llama `mixed_people/search` filtrado por `organization_ids: [apollo_id]` + titles + seniorities (CEO/Founder/CTO/Director...).
- Hace upsert en `company_contacts` por (company_id, apollo_person_id). Cuenta solo créditos por contactos con email revealed (Apollo a veces devuelve `email_not_unlocked@domain.com`).
- Budget guardrail integrado: no permite reventar el hard-stop.
- Nuevo botón "Buscar contactos" en el header del detalle de empresa con tooltip explicativo.
- Tab Contacts rediseñada: sortea decision makers primero, muestra badge "verified" en emails Apollo-verified, links a LinkedIn, mailto, copy de teléfono.

### Scoring real (`web/lib/scoring.ts`)
Reemplazo del scoring fijo (0.5/0/0.5) por una fórmula que combina:
- **fit (0..1)**: enriched +0.25, headcount dentro del rango +0.25, founded >= min +0.20, revenue conocido +0.15, sector matchea industries +0.15.
- **intent (0..1)**: growth >10% +0.40 (o >0% +0.20), intent_strength high/medium/low +0.30/+0.15/+0.05, signals recientes +0.10 c/u hasta +0.30.
- **combined = 0.5 × fit + 0.5 × intent**.
- Aplicado en `addToRadarAction`, `createSearchAction` (backfill ahora filtra rows con combined >= 0.3 en vez de inflar el radar con todo).
- Nuevo `rescoreRadarAction(orgSlug)` admin-only: recalcula todo el radar en bulk usando data actual (sector, growth, intent, signals).
- Botón "Rescore" en la página `/radar` para admins.

### Dashboard mejorado (`/dashboard`)
- 2 filas de stat cards: universo, enriquecidas (con %), AI brief, intent activo · radar, contactos (con/sin email), signals, searches activas.
- **Top empresas de tu radar (por score)**: card nuevo, muestra los 10 mejor puntuados con badge combined-score · breakdown fit/intent en tooltip.
- **Top empresas del universo (por growth)**: ranking del universo entero (no solo radar).
- **Distribución de score · radar**: panel hot/warm/cold/dead con bars y % (en vez del panel "searches activas" duplicado).
- "Último Apollo sync" ahora incluye el comando para correr delta (refresh).

### Jobs operativos documentados en `/admin/usage`
Card "Jobs operativos" con los 6 comandos para correr:
- `apollo_sync --mode initial` (poblar universe)
- `apollo_sync --mode delta` (refresh semanal de intent + growth)
- `enrich_pending --limit N` (enriquecer batch)
- `generate_briefs --limit N` (Claude briefs)
- `scrape_bo --days N` (signals propios)
- `send_alerts` (digest diario)

### Threshold del badge de score arreglado
Antes el radar mostraba score × 100 (porque hardcodeaban growth × 100 como intent) y el badge usaba thresholds 20 / 5 absolutos. Ahora score está en 0..1 y se muestra como entero ×100. Thresholds: ≥60 success, ≥40 info, ≥20 secondary, <20 destructive.

## 2026-05-13 · Sesión 3: UX fixes (paginador, revenue, indicadores, radar manual, copy)

### Bugs corregidos
- **Paginador "undefined"**: `new URLSearchParams({ q: undefined })` escribía la string `"undefined"` y rompía la URL. Nuevo helper `buildSearchParams()` en `web/lib/utils.ts` que filtra null/undefined/empty.
- **Revenue no se mostraba**: solo 5% (1.135 / 23.707) tenían `organization_revenue_printed`. Nuevo helper `formatRevenue()` con fallback al numérico (`$XM`/`$XB`/`$XK`). Usado en `/companies` y `/companies/:id`.

### UX mejorada
- **Indicador "enriched"**: `<Database>` icon violeta junto al nombre cuando `sector` está poblado (≠ del `<Sparkles>` azul de AI brief). En lista y detalle.
- **Botón "+ Radar"** desde lista y detalle (`AddToRadarButton`). Verifica si la empresa ya está en `org_companies` y muestra "En radar" check verde. Server actions en `radar-actions.ts` (add + remove).
- **Texto explicativo** en `/companies`, `/searches`, `/alerts` — card con `Info` icon explicando enriched / radar / cómo funcionan searches y alerts.
- **Botón "Enrich Apollo (1 cred)"** con tooltip detallando exactamente qué trae (sector, sub-sector, headcount, ciudad/provincia/país, tech stack, intent topics, descripción).
- **Notes empty state** del detalle ahora dice "tocá + Radar arriba para trackearla" en vez de "primero tiene que matchear una search activa".

### Doc nueva
- `docs/INFO_POR_EMPRESA.md`: tabla completa de las 6 capas de info por empresa (Base / Enriched / AI brief / Signals / Contacts / Pipeline) con estado actual de cobertura, costos por crédito, y qué falta para llegar a "empresa completa".

### Aclaración del modelo de ownership
La asignación de owner (`org_companies.owner_user_id`) marca **responsabilidad**, no **visibilidad**. Todos los miembros de la org ven todas las empresas del radar. El owner es quien tiene la tarjeta en pipeline.

## 2026-05-13 · Sesión 2 (cont. 2): Apollo activado + seeds aplicados + ajuste search/enrich

### Setup keys reales (por el usuario)
- `SUPABASE_SERVICE_ROLE_KEY` ✓ pegado
- `ANTHROPIC_API_KEY` ✓ pegado
- `RESEND_API_KEY` ✓ pegado + dominio `yacare.io` verificado en Resend
- `APOLLO_API_KEY` ✓ pegado (key creada como master key)
- Mariano user creado en Supabase Auth (ID `a44e4b1a-6200-460e-9c30-fd37ff578767`)

### Seeds aplicados vía Supabase MCP
- `super_admins`: Mariano marcado @ 16:19:43 UTC
- `universe_master_versions` v1: activa @ 16:19:50 UTC, ID `8497a600-9c0d-40b6-b06b-2938e03e58c6`
- `apollo_budget_config` ajustado: 2500 créditos/mes ($49 plan Basic annual = 30K/año ÷ 12)

### Verificación Apollo en vivo
- `GET /auth/health` → `{healthy: true, is_logged_in: true}` ✅
- `POST /mixed_companies/search` con filtros del maestro → **35.348 empresas argentinas** en target (loc AR + headcount 11-500 + founded 2005+)
- Master key permissions confirmados (search devuelve 200 OK)

### Finding crítico — pivot de estrategia (ver ADR 0005)
Apollo search NO devuelve industry / headcount / location / technologies / keywords / description. Solo: id, name, domain, founded_year, growth metrics, intent, financial.

**Strategy adjustment aceptado**: search-first (0 créditos para todo el universo) + enrichment on-demand (1 crédito por empresa que entra al radar de una org). Estimación gasto: ~200-500 créditos/mes vs 2500 disponibles.

### Cambios de código (Week 2.5)
- `models/apollo.py`: `ApolloAccount` reescrito con campos reales del search response (growth, intent, financial, social, sic_codes). Nuevo modelo `ApolloEnrichedOrganization` con industry/headcount/location/tech.
- `clients/apollo.py`: nuevo método `enrich_organization(domain | organization_id)` que llama `/organizations/enrich` consumiendo 1 crédito. Método `healthcheck()` para probes 0-créditos.
- `repositories/companies_repo.py`: separadas `upsert_company_from_search` (0 créditos, fields básicos) y `update_company_with_enrichment` (post-enrich).
- `jobs/apollo_sync.py`: modo `initial` ahora hace SOLO search. Nuevo flag `--max-pages N` para smoke tests acotados.
- `services/budget_guardrail.py`: sin cambios funcionales.

### Credit counter (nuevo)
- Migration 0009: vista SQL `apollo_credit_summary` que consolida budget + uso + threshold + healthcheck.
- CLI `scrapers/scripts/credit_status.py`: imprime barra de progreso ASCII con el estado actual.
- Ejemplo de output:
  ```
  ┌─ Apollo · basic ($49.00/mes)
  │  2026-05
  │
  │  Créditos: 0/2500  ·  Restantes: 2500
  │  [░░░░░░░░░░░░░░░░░░░░] 0.0%
  │
  │  Thresholds: [70, 85, 95]  ·  Hard stop: 100%
  │  Último sync: nunca
  │
  │  Apollo health: True  ·  logged_in: True
  └─
  ```

### Documentación nueva
- ADR 0005 `apollo-search-vs-enrichment-strategy.md`: registra el pivot search-first

### TODOs identificados
- **Industry filter mapping**: el config maestro tiene nombres de industria ("information technology and services"), Apollo espera tag IDs numéricos. Hay que agregar un paso de mapeo. Sin esto, search no filtra por sector y devuelve 35K empresas. Con el filtro estimamos 5-15K. Fix en Week 3.
- **Apollo intent ralo en LATAM**: los primeros resultados muestran que Apollo tiene poca data de intent para empresas argentinas. Validación: nuestras signals propias (BO, postings, web changes) van a ser la fuente principal de intent para LATAM.

### Pendiente cuando el usuario corra setup local
1. `cd scrapers && python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"`
2. `pytest` ← validar 14+ tests
3. `python scripts/credit_status.py` ← validar contador
4. `python -m leads_scrapper.jobs.apollo_sync --mode initial --dry-run --max-pages 1` ← smoke
5. Si OK: `python -m leads_scrapper.jobs.apollo_sync --mode initial --max-pages 5` ← primer sync chico (500 empresas)
6. Si bien: corrida full sin `--max-pages`

## 2026-05-13 · Sesión 2 (cont.): Plan Week 2 + implementación Apollo + disciplina docs

### Documentación
- `docs/CHANGELOG.md`, `docs/QA.md`, `docs/SETUP.md` creados
- 4 ADRs en `docs/decisions/`: 0001 companies-signals, 0002 two-layer-universe, 0003 apollo-only, 0004 multi-tenant-rls
- `CLAUDE.md` actualizado con reglas de documentación + QA obligatoria antes de avanzar
- Corrección de pricing Apollo: Basic $49/mes annual (no $99) — total budget baja a ~$70/mes
- Aclaración importante: Apollo cobra por seat, no por usuario nuestro. 1 seat alcanza para todo F0.

### Plan Week 2
- `docs/superpowers/plans/2026-05-13-week2-apollo-integration.md` (9 tasks)

### Implementación Week 2 (Wave 1-4)
- **HTTP wrapper** (`clients/http.py`): retry exponencial con tenacity para 429/5xx + transport errors. 4 tests con respx mocks.
- **Budget guardrail** (`services/budget_guardrail.py`): `check_apollo_budget()` con BudgetDecision (PROCEED / PROCEED_WITH_ALERT / ABORT). Threshold checks contra `apollo_budget_config` + `apollo_credit_usage_monthly`. Registra alertas únicas por mes-threshold. 5 tests con Supabase mockeado.
- **Apollo models** (`models/apollo.py`): `AccountSearchFilters`, `PeopleSearchFilters`, `ApolloAccount`, `ApolloPerson` con `from_apollo_response()` + helpers (`headcount_range()`, `is_decision_maker()`).
- **ApolloClient real** (`clients/apollo.py`): rewrite del stub. `search_accounts()` paginado + budget check pre-request. `search_people()` con credit tracking automático. `get_credit_balance()`. 5 tests con respx + Supabase mocks.
- **Companies repo** (`repositories/companies_repo.py`): `upsert_company()` + `bulk_upsert_companies()` mapeando `ApolloAccount → companies`.
- **apollo_sync job rewrite** (`jobs/apollo_sync.py`): orquesta load universe_master → search_accounts → upsert → log run con stats. Soporta `--mode initial|delta|targeted_contacts` y `--dry-run`. Maneja `ApolloBudgetExceeded` y fallos genéricos con apollo_sync_runs.status correcto.
- **Seed scripts** (`scripts/`):
  - `seed_super_admin.py`: marca user como super_admin (requiere user existente en auth.users)
  - `seed_universe_master.py`: crea `universe_master_versions` v1 con criterios Yacaré default + flag `--replace` para swap

### Pendiente cuando el usuario vuelva con keys
1. Completar `SUPABASE_SERVICE_ROLE_KEY` en `web/.env.local` y `scrapers/.env`
2. Suscribirse a Apollo Basic ($49 annual) → completar `APOLLO_API_KEY`
3. Cuenta Anthropic → `ANTHROPIC_API_KEY`
4. Crear user de Mariano en Supabase Auth (dashboard → Authentication → Add user)
5. Ejecutar en orden:
   - `cd scrapers && python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"`
   - `pytest` ← validar que todo pasa
   - `python scripts/seed_super_admin.py`
   - `python scripts/seed_universe_master.py`
   - Update `apollo_budget_config.monthly_budget_credits` con valor real Apollo
   - `python -m leads_scrapper.jobs.apollo_sync --mode initial --dry-run` ← smoke
   - `python -m leads_scrapper.jobs.apollo_sync --mode initial` ← primer sync real

### Commits sesión 2
```
47c1f5b docs: changelog, QA routine, setup checklist, ADRs, and Apollo pricing correction
e24282e feat(supabase): provision project + apply all migrations
ce8953f ci: github actions workflows for tests and scheduled scrapers
fdb6560 feat(supabase): add migrations 0001-0007 (schema + RLS + seeds)
e871488 feat(scrapers): scaffold python package with pydantic models, client stubs, and json logging
c3e6ab4 feat(web): scaffold next.js 14 app with tailwind, vitest, and supabase stubs
7baa717 chore: gitignore, env template, and README
b49d797 docs: initial design spec and week 1 implementation plan
```
(+ los nuevos commits de Apollo implementation)

### QA pass parcial — 2026-05-13
- Tests escritos: 18 (4 http + 5 budget + 5 apollo + 4 smoke previos + 2 ya existentes en stubs/canonical/logging que siguen válidos)
- ⚠️ Tests NO ejecutados localmente (deps Python no instaladas en sesión actual). Cuando el usuario corra `pytest`, debería pasar todo.
- Lint/typecheck: pendiente ejecución local.
- Secrets: ✅ no committeados, .env y .env.local en .gitignore.
- Supabase advisors: ya revisado en commit `e24282e`, 5 warnings low-risk.
- Smoke run apollo_sync: pendiente keys reales.
- Docs: actualizado ✅.

## 2026-05-13 · Sesión 2: Spec + Plan + Scaffolding + Supabase provisioning

### Brainstorming (parte 1 de la sesión)
- Definimos el modelo conceptual: **plataforma de señales sobre universo Apollo** (NO scraper del BO como inicialmente planteado).
- Decidimos roadmap de 5 fases. Fase 0 = motor + UI Robusta + multi-tenant. ~8 semanas.
- Fuentes Fase 0: Apollo (universo + contactos), Bumeran/Computrabajo/ZonaJobs (postings), BO Nacional/CABA (actos societarios — fuente complementaria, no de discovery), scraping de webs propias.
- Stack: Supabase + Next.js 14 + Python scrapers + GitHub Actions cron.
- Two-layer universe target: maestro global (super-admin) + per-org (filtro local).
- Apollo budget guardrails: alertas a 70/85/95% + hard stop 100%.
- Sin Snov.io, sin SerpAPI — Apollo cubre.

### Documentación creada
- `docs/superpowers/specs/2026-05-13-leads-scrapper-fase-0-design.md` (1129 líneas, 19 secciones)
- `docs/superpowers/plans/2026-05-13-week1-foundation.md` (2692 líneas, 13 tasks TDD bite-sized)

### Scaffolding
- Repo bootstrap (`.gitignore`, `.env.example`, `README.md`)
- Next.js 14 web app en `web/` (App Router, Tailwind, shadcn-ready, Vitest, Zod env, Supabase SSR clients stubs)
- Python package en `scrapers/` (pydantic 2, httpx, pdfplumber, supabase-py; con models canónicos `CanonicalCompany`/`CanonicalContact`/`CanonicalSignal`; client stubs para Apollo/Anthropic/Resend/Supabase; JSON structured logging; pytest + ruff + mypy)
- Supabase migrations 0001-0007 en `supabase/migrations/`
- GitHub Actions workflows: `ci.yml`, `apollo_sync.yml`, `daily_scrape.yml`, `web_changes.yml`

### Supabase provisioning
- Proyecto `leads-scrapper` creado en `sa-east-1` (ID `cdklaxvxngmldpdiihgo`)
- Costo confirmado: $10/mes (cuarto proyecto en org Yacaré, free tier cubre 2)
- Postgres 17.6.1
- 8 migrations aplicadas (incluye fix sobre 0001 por `now()` en index predicate, y `0008_security_hardening` agregada post-advisor)
- 24 tablas con RLS habilitado. Seeds: 9 rows en `signal_type_config`, 1 en `apollo_budget_config`.
- Security advisor: 5 warnings restantes (low-risk: `pg_trgm` en public schema, helpers RPC-exposed pero retornan solo info del caller).

### Commits (8)
```
e24282e feat(supabase): provision project + apply all migrations
ce8953f ci: github actions workflows for tests and scheduled scrapers
fdb6560 feat(supabase): add migrations 0001-0007 (schema + RLS + seeds)
e871488 feat(scrapers): scaffold python package with pydantic models, client stubs, and json logging
c3e6ab4 feat(web): scaffold next.js 14 app with tailwind, vitest, and supabase stubs
7baa717 chore: gitignore, env template, and README
b49d797 docs: initial design spec and week 1 implementation plan
```

Remote agregado a `https://github.com/mariano-ia/leads-scrapper.git`. **NO pusheado** (espera a primera versión funcional).

### Env files
- `web/.env.local` y `scrapers/.env` creados con URL y publishable key reales, resto en blanco para que el usuario complete (`SUPABASE_SERVICE_ROLE_KEY`, `APOLLO_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`).
- Ambos en `.gitignore`.

### Pendiente cuando el usuario vuelva
- Completar `SUPABASE_SERVICE_ROLE_KEY` (manual via dashboard).
- Crear cuenta Apollo Basic + completar `APOLLO_API_KEY`.
- Cuenta Anthropic + `ANTHROPIC_API_KEY`.
- Verificar dominio Resend + `RESEND_API_KEY`.
- Para próxima sesión: implementar `ApolloClient` real con respx mocks + budget guardrail + universe_master seed (necesita super-admin user en Supabase Auth primero).

## 2026-05-12 · Sesión 1: Bootstrap del entorno Claude Code

- Instalamos `superpowers` (obra/superpowers, 14 skills) y `awesome-claude-skills` (ComposioHQ, 28 skills) en `~/.claude/skills/` vía clone + symlink (el comando `/plugin` no está disponible en la extensión VSCode).
- CLAUDE.md del proyecto: regla de invocar `using-superpowers` al inicio de toda sesión + idioma español + sesgo a la acción.
- Memoria persistente inicializada en `~/.claude/projects/.../memory/`.
- No se escribió código del proyecto en esta sesión — fue solo setup del entorno.
