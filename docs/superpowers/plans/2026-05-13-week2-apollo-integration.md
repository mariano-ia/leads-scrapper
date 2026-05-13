# Week 2 — Apollo Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans para ejecutar task-by-task. Steps usan checkbox `- [ ]` para tracking.

**Goal:** Cuando el usuario provea `APOLLO_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, ejecutar `python -m leads_scrapper.jobs.apollo_sync --mode initial` debe: (1) hacer check de budget, (2) pull el universo de Apollo paginado, (3) upsert en `companies`, (4) loguear el run con créditos consumidos. Plus: super-admin user creado y universe_master v1 activo.

**Architecture:** ApolloClient con httpx async + tenacity retry + budget guardrail antes de cada request. Budget guardrail consulta `apollo_budget_config` + `apollo_credit_usage_monthly` para decidir abort/proceed. Universe master config en DB versionado.

**Tech Stack:** httpx, tenacity, respx (mocks), supabase-py.

---

## File Structure

Files a crear/modificar:

```
scrapers/src/leads_scrapper/
├── clients/
│   ├── apollo.py                    # REWRITE: implementación real
│   └── http.py                      # NUEVO: wrapper httpx con retry
├── services/
│   ├── __init__.py                  # NUEVO
│   └── budget_guardrail.py          # NUEVO: lógica de budget check
├── jobs/
│   └── apollo_sync.py               # REWRITE: orquestación real
└── repositories/
    ├── __init__.py                  # NUEVO
    └── companies_repo.py            # NUEVO: upsert helpers para companies

scrapers/tests/
├── clients/
│   ├── test_apollo.py               # NUEVO: respx-mocked tests
│   └── test_http.py                 # NUEVO
├── services/
│   ├── __init__.py
│   └── test_budget_guardrail.py     # NUEVO
└── jobs/
    ├── __init__.py
    └── test_apollo_sync.py          # NUEVO: integration con mocks
```

Scripts one-off (no tests, ejecutables):
```
scrapers/scripts/
├── seed_super_admin.py              # Setea Mariano como super_admin
└── seed_universe_master.py          # Crea universe_master_versions v1
```

---

## Tasks

### Task 1 — HTTP wrapper con retry

**Files:** `scrapers/src/leads_scrapper/clients/http.py`, `scrapers/tests/clients/test_http.py`

Implementa una función `async retry_request(client, method, url, **kwargs)` que usa `tenacity` para reintentar en 429, 500, 502, 503, 504 con backoff exponencial.

- [ ] Write failing test que verifica retry 3 veces ante 503, luego éxito 200.
- [ ] Implementar con `tenacity.AsyncRetrying`.
- [ ] Verificar test pasa.
- [ ] Commit `feat(scrapers): add httpx retry wrapper`.

### Task 2 — Budget guardrail

**Files:** `scrapers/src/leads_scrapper/services/budget_guardrail.py`, `scrapers/tests/services/test_budget_guardrail.py`

Función `async def check_apollo_budget(estimated_credits: int) -> BudgetDecision` que:
1. Carga `apollo_budget_config` (single row)
2. Carga `apollo_credit_usage_monthly` para año-mes actual (crea si no existe)
3. Calcula `projected_pct = (current_used + estimated) / monthly_budget × 100`
4. Si `projected_pct >= hard_stop_pct` → retorna `BudgetDecision.ABORT` + razón
5. Si cruza threshold no alertado → registra alerta en `apollo_budget_alerts` + retorna `BudgetDecision.PROCEED_WITH_ALERT`
6. Caso contrario → retorna `BudgetDecision.PROCEED`

`BudgetDecision` es un Enum o dataclass con campos `action`, `reason`, `current_used`, `projected_used`, `monthly_budget`.

- [ ] Tests para cada path: proceed limpio, proceed con alerta (threshold cruzado), abort por hard stop.
- [ ] Implementación.
- [ ] Verificar tests pasan.
- [ ] Commit `feat(scrapers): add apollo budget guardrail`.

### Task 3 — ApolloClient: search_accounts

**Files:** `scrapers/src/leads_scrapper/clients/apollo.py` (rewrite), `scrapers/tests/clients/test_apollo.py`

Implementar `async def search_accounts(filters: AccountSearchFilters) -> AsyncIterator[ApolloAccount]`:
- Llama a `POST https://api.apollo.io/api/v1/mixed_companies/search`
- Auth via header `X-Api-Key`
- Pagination automática (page_size=100) hasta agotar resultados
- Yield de cada account como modelo Pydantic `ApolloAccount`
- Antes de cada request: `check_apollo_budget(estimated_credits=1)` (search no consume créditos normalmente pero por las dudas)

`AccountSearchFilters` (Pydantic):
```python
class AccountSearchFilters(BaseModel):
    organization_locations: list[str] = ["Argentina"]
    organization_num_employees_ranges: list[str] = []  # e.g., ["10-50", "51-200"]
    q_organization_industry_tag_ids: list[str] = []
    q_organization_keyword_tags: list[str] = []
    founded_year_min: int | None = None
    founded_year_max: int | None = None
    per_page: int = 100
```

- [ ] Test: respx mock devolviendo 2 páginas (page 1 con 100 accounts, page 2 con 50), verificar yield 150.
- [ ] Test: 429 → retry → 200.
- [ ] Test: budget abort → no se hace request.
- [ ] Implementación.
- [ ] Verificar.
- [ ] Commit `feat(scrapers): implement ApolloClient.search_accounts with pagination`.

### Task 4 — ApolloClient: search_people

Similar a Task 3 pero para `/api/v1/mixed_people/search`. Filtros relevantes: `organization_ids` (lista de Apollo company IDs), `person_titles` (CEO, CTO, etc).

Esta SÍ consume créditos (1 credit por reveal de persona). Budget check con `estimated_credits=per_page`.

- [ ] Tests análogos.
- [ ] Implementación.
- [ ] Commit `feat(scrapers): implement ApolloClient.search_people with budget check`.

### Task 5 — ApolloClient: get_credit_balance

Llama a `/api/v1/auth/health` o equivalente (verificar en docs Apollo al integrar — pongo placeholder).

- [ ] Test con respx mock.
- [ ] Implementación.
- [ ] Commit `feat(scrapers): implement ApolloClient.get_credit_balance`.

### Task 6 — Companies repository

**Files:** `scrapers/src/leads_scrapper/repositories/companies_repo.py`

Helper async `upsert_company(supabase, apollo_account: ApolloAccount) -> uuid`:
- Mapea `ApolloAccount` → schema canónico `companies` (campo por campo)
- UPSERT on conflict `apollo_id` → update `last_seen_at`, `apollo_data`
- Retorna el `companies.id` (uuid)

- [ ] Tests con cliente Supabase mockeado.
- [ ] Implementación.
- [ ] Commit `feat(scrapers): add companies repository upsert`.

### Task 7 — Super-admin + universe master seed scripts

**Files:** `scrapers/scripts/seed_super_admin.py`, `scrapers/scripts/seed_universe_master.py`

`seed_super_admin.py`:
1. Conecta a Supabase con service_role
2. Busca user por email (`SUPER_ADMIN_EMAIL` env). Si no existe, error (user debe crear cuenta primero en /signup o por dashboard).
3. INSERT INTO super_admins ON CONFLICT DO NOTHING
4. Print confirmación.

`seed_universe_master.py`:
1. Conecta con service_role
2. Busca super-admin user
3. INSERT universe_master_versions con config v1 hardcoded (sectores, headcount, etc.), `is_active=true`
4. Si ya hay una activa, error o flag `--replace`

- [ ] Script seed_super_admin con argparse + dry-run.
- [ ] Script seed_universe_master con argparse.
- [ ] Tests opcionales (estos son one-shot, no productivos).
- [ ] Commit `feat(scrapers): add seed scripts for super admin and universe master`.

### Task 8 — apollo_sync job: integración real

**Files:** `scrapers/src/leads_scrapper/jobs/apollo_sync.py` (rewrite)

Reemplazar el stub. Orquesta:
1. Setup logging + cliente Supabase
2. Cargar `universe_master_versions` activa → extraer config
3. `INSERT apollo_sync_runs (mode='initial'|'delta', status='running')`
4. Para cada batch de accounts (via `ApolloClient.search_accounts(filters_from_config)`):
   a. UPSERT en companies
   b. Update `apollo_credit_usage_monthly`
5. Update `apollo_sync_runs` con stats finales y `status='completed'`
6. Si excepción: status='failed', log error

Modes:
- `initial`: full pull, sin filtro `last_updated_at`
- `delta`: solo `last_updated_at > now() - 7d`
- `targeted_contacts`: para empresas en `org_companies` activas, refresca top contactos

- [ ] Test integración con todos los clientes mockeados (Supabase + Apollo respx).
- [ ] Implementación.
- [ ] Smoke: `python -m leads_scrapper.jobs.apollo_sync --mode initial --dry-run`.
- [ ] Commit `feat(scrapers): implement apollo_sync initial mode`.

### Task 9 — QA + CHANGELOG update

- [ ] Ejecutar `pytest` completo en scrapers.
- [ ] Ejecutar `ruff check + mypy`.
- [ ] Update `docs/CHANGELOG.md` con entrada para Week 2.
- [ ] Verificar QA gates de `docs/QA.md`.
- [ ] Commit `docs: changelog week 2 + qa pass`.

---

## Cuando el usuario provea las keys

1. Completar `web/.env.local` y `scrapers/.env`:
   - `SUPABASE_SERVICE_ROLE_KEY` (manual desde dashboard)
   - `APOLLO_API_KEY` (después de crear cuenta Apollo Basic)
2. Crear cuenta en Supabase Auth para Mariano:
   - Opción A: usuario va a `/login` y se registra (pero `enable_signup=false`)
   - Opción B: super-admin crea via Supabase dashboard → Authentication → Add user
3. Ejecutar `python scrapers/scripts/seed_super_admin.py`
4. Ejecutar `python scrapers/scripts/seed_universe_master.py`
5. Verificar credit balance Apollo: `python -c "from leads_scrapper.clients.apollo import ApolloClient; ..."`
6. Actualizar `apollo_budget_config.monthly_budget_credits` con el número real
7. Smoke run: `python -m leads_scrapper.jobs.apollo_sync --mode initial --dry-run`
8. Si todo OK: corrida real

---

## Notas

- Apollo API endpoints exactos: verificar contra https://docs.apollo.io antes del primer call real. Stubs en el código asumen `/api/v1/mixed_companies/search` y `/api/v1/mixed_people/search` con header `X-Api-Key`. Si cambia, refactor mínimo.
- El test suite usa `respx` para mockear todas las llamadas HTTP — no se gastan créditos en testing.
- Budget guardrail aplica a TODAS las llamadas que consumen créditos (search_people). Search_accounts asumimos 0 credit cost a confirmar.
