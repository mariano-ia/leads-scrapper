# Changelog

Registro cronológico de lo que se construyó, sesión por sesión. Cada entrada incluye fecha, qué se hizo, decisiones importantes, y qué quedó pendiente. El "porqué" detrás de las decisiones grandes está en `docs/decisions/`.

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
