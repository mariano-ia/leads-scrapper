# Changelog

Registro cronológico de lo que se construyó, sesión por sesión. Cada entrada incluye fecha, qué se hizo, decisiones importantes, y qué quedó pendiente. El "porqué" detrás de las decisiones grandes está en `docs/decisions/`.

## 2026-05-13 · Sesión 8: Auto-rescore SQL + filtros companies + Resend webhook + 2da query news

### Auto-rescore tras cada cambio (trigger SQL, migration 0014)
Antes: tras un signal nuevo o un enrich, había que tocar el botón "Rescore" manualmente.
Ahora: 3 triggers PostgreSQL recomputan automáticamente fit/intent/combined:
- **AFTER INSERT ON signals** → rescore de las org_companies de esa company.
- **AFTER DELETE ON signals** → rescore (los scores bajan cuando se borra una señal).
- **AFTER UPDATE ON companies** → rescore si cambió sector/headcount/founded/revenue/growth/intent_strength.

Smoke test: insert de un signal weight=40 en Oleana Jewelry → intent 0.40 → 0.70, combined 0.55 → 0.70 al instante. Delete → vuelve a 0.40 / 0.55.

Función plpgsql `rescore_org_companies_for_company(p_company_id)` reutilizable, idempotente, mismo cálculo que el bulk SQL del rescore manual.

### Filtros completos en /companies
Nuevos query params: `sector · city · headcount · radar (yes/no) · enriched (yes/no) · has_brief · intent · growth_min · revenue_min`. Todos combinables.

UI: 2 filas de controles bajo el search bar:
- Fila 1: search libre · sector · ciudad · dropdown headcount.
- Fila 2: dropdowns radar/enriched + checkboxes (con AI brief / con intent) + Growth ≥ % / Revenue ≥ USD + Aplicar / Limpiar.

Ejemplos de uso:
- `?radar=no&enriched=yes&growth_min=20` → empresas enriched que crecen más de 20% pero todavía no están en radar.
- `?sector=software&city=Buenos+Aires&has_brief=yes` → software de CABA con AI brief listo.

### Resend webhook → tracking real de outreach
Endpoint nuevo `/api/resend/webhook` que recibe eventos de Resend (delivered/bounced/complained/failed/opened/clicked) y actualiza `outreach_messages.status` + cuenta opens/clicks en `context_data`. Autenticación via header `X-Resend-Webhook-Secret` (env `RESEND_WEBHOOK_SECRET`).

Para activarlo: configurar webhook en https://resend.com/webhooks apuntando a `https://<vercel-domain>/api/resend/webhook` con el secret.

### Hiring query secundaria en Google News
Skipeo de Bumeran/Indeed/LinkedIn jobs (403 + bot-detection). Alternativa: segunda query Google News por empresa con keywords de hiring (contrata / busca / incorpora / designa / nombra / head of digital / nuevo CTO / data scientist / AI engineer / ML).

`fetch_news_for_company` ahora hace 2 fetches paralelos:
1. Estricta: `intitle:"<RS>"` (anti-ruido).
2. Laxa con hiring keywords: `"<RS>" (contrata OR busca OR ...)` — exige RS en title o summary.

Combina + dedup por URL. Smoke test con Globant: 8 items (vs 5 antes) incluyendo algunas categorizadas como `c_level_hire`. MiradorTEC: 8 items, 2 funding_round detectados.

## 2026-05-13 · Sesión 7: Outreach AI + signals auto + scoring visible + sort radar

### Outreach con AI completo
Nueva tabla `outreach_messages` (migration 0013). 3 server actions:
- `generateOutreachDraftAction(orgSlug, companyId, contactId)` → Claude Sonnet genera subject+body personalizado usando empresa + contacto + AI brief + signals recientes. Devuelve draft persistido (status='draft').
- `sendOutreachDraftAction(orgSlug, draftId)` → manda vía Resend desde `leads@yacare.io` con reply-to del usuario actual.
- `updateOutreachDraftAction(orgSlug, draftId, patch)` → edita subject/body antes de enviar.

UI: nuevo `OutreachButton` en cada contacto con email → expande inline a un editor con asunto + textarea + 3 acciones: **Enviar via Resend** (confirm) · **Abrir en mi cliente de mail** (mailto:) · **Descartar**. Drafts quedan persistidos para auditoría.

System prompt enseña a Mariano: castellano rioplatense, asunto específico (no "Propuesta"), apertura con observación concreta de la empresa, hipótesis de cómo Yacaré le sirve, CTA con propuesta de call 15 min.

### Signals automáticas (gratis, sin tocar nada)
**Antes**: el usuario tenía que tocar "Buscar signals" empresa por empresa.
**Ahora**:
- **Al entrar al radar** (`addToRadarAction`) → fetch Google News inline al final.
- **Al "Calificar empresa"** (`qualifyCompanyAction`) → step 2 después del enrich, antes de contactos.
- **Backfill manual ejecutado**: scrape_news --radar-only → 79 signals nuevas (total 295 sobre 88 empresas).
- **Cron diario** (GitHub Actions) sigue corriendo top-100 growth.

Nueva action `fetchSignalsForCompanyAction(orgSlug, companyId)` reescrita en TS con parser RSS regex (sin dependencia de BS4). Mismo skip de ambiguous names + spam sources + filtro temporal.

### Botón "Buscar signals" en tab Signals
Reemplaza el copy "Sin signals todavía. Los scrapers no están corriendo" por:
- Card descriptivo + botón **"Buscar signals"** (gratis) arriba de la lista.
- Cada signal ahora se renderiza con badge de categoría color-coded + título clickable al artículo + summary + weight badge.

### Score / Fit / Intent visibles en TODOS lados

**Radar (`/radar`)**:
- Sortable headers: score, fit, intent, status, matched.
- Columnas dedicadas Fit / Intent (0-100) además del Score combinado.
- Indicador "🔔 N" cuando hay N signals recientes.
- Info card al top explicando la fórmula completa.
- Rescore button (admin) recalcula todo el radar usando data actual.

**Companies (`/companies`)**:
- Nuevas columnas Score / Fit / Intent que joinean con `org_companies` del org actual.
- Badge "no radar" para empresas no agregadas.
- Sigue ordenable por growth_12m/24m, revenue, founded, name, domain.

### Bulk rescore SQL (recompute desde scratch)
Actualizado para usar fórmula completa en SQL puro (no solo signal_boost):
- fit = enriched +0.25 · headcount +0.10 · founded +0.20 · revenue +0.15
- intent = growth tiers (0.40/0.20/0) + intent_strength tiers (0.30/0.15/0.05) + signal_boost (LEAST(0.30, SUM/100))
- combined = 0.5 × fit + 0.5 × intent
- **99 rows actualizadas en el radar de Yacaré.**

### Distribución final del radar Yacaré
```
🔥 Hot   (≥60): 60 empresas
🌡 Warm  (40-59): 39 empresas
❄  Cold  (20-39):  1 empresa
💀 Dead  (<20):    0 empresas
```

### Fallback de contactos
`fetchContactsAction` ahora: si después del filter de title score >= 0.5 no quedan candidatos decisionales, hacemos fallback al top N por has_email (sin filtro). Marca `fallback_used: true` en response. Toast UI muestra warning: "⚠️ sin decisores claros, fallback al staff disponible".

### Categorizador mejorado
Nuevo regex para detectar tech-hiring (data scientist, AI engineer, automation, head of digital) además de C-level hires.

## 2026-05-13 · Sesión 6: Botón master "Calificar" + scrapers propios poblando signals

### Pregunta del usuario
> ¿No podemos traer los contactos con el enrich?? ¿Estamos corriendo nuestro scrapping?

Respuesta: **antes NO, ahora SÍ a ambas.**

### Botón master "Calificar empresa" (1 click → todo)
Nuevo `qualifyCompanyAction(orgSlug, companyId)` que combina en serie:
1. `enrichCompanyAction` (1 cred · solo si falta sector)
2. `fetchContactsAction` (1-5 cred · max 5 decision makers con email reveal)
3. `generateBriefAction` (~$0.003 Claude · si hay sector y falta brief)

Devuelve un step-by-step report `{ name, ok, detail }[]` mostrado como toast multi-línea.

UI: el detalle ahora tiene 1 botón principal **"Calificar empresa"** + dropdown para acciones individuales (Enrich solo / Contactos solo / Brief solo) como fallback.

Costo total típico: **2-6 créditos Apollo + ~$0.003 Claude por empresa.**

### Scrapers propios CORRIENDO
Antes: `signals` table tenía 0 rows. Workflow estaba como stub.

Ahora: **216 signals reales poblados** por el nuevo scraper Google News RSS sobre top 50 empresas por growth_12m.

Nuevo `scrapers/src/leads_scrapper/scrapers/google_news.py`:
- Query Google News RSS con `intitle:"<razon_social>" -site:dominio -site:linkedin.com/company -site:glassdoor.com -site:indeed.com -site:computrabajo.com`.
- Skip empresas con nombre ambiguo de 1 palabra común (Humana, Norte, Plus, etc.) — producen solo ruido.
- Skip sources spam conocidos (e.g. "American Association of Teachers of Japanese" que aparece con guías SEO falsas).
- Filtro temporal: solo noticias últimos 90 días.
- Categorizador con weights por tipo de evento:
  - `funding_round`: 40 (ronda/financing/recauda/serie A-C)
  - `c_level_hire`: 30 (designa CTO/CEO, head of)
  - `expansion_or_launch`: 25 (lanza/abre/adquiere)
  - `partnership`: 20 (alianza/joint venture)
  - `press_mention`: 10 (mention genérica)

Nuevo job `scrape_news.py`:
- Combina empresas del radar (prioridad) + top growth_12m del universo.
- Dedup por URL post-fetch.
- Paralelo con `Semaphore(5)` para no rate-limitar Google.
- Logging estructurado + scrape_runs row.

Migration **0012_signals_press_mention.sql**: amplía constraint `signals_type_valid` para incluir `press_mention`, `funding_round`, `c_level_hire`, `expansion_or_launch`, `partnership`.

Bulk rescore SQL post-scrape:
```sql
WITH sigs AS (
  SELECT company_id, LEAST(0.30, SUM(intent_weight)/100) AS boost
  FROM signals WHERE occurred_at >= now() - interval '180 days'
  GROUP BY company_id
)
UPDATE org_companies oc SET
  last_intent_score = LEAST(1.0, oc.last_intent_score + s.boost),
  last_combined_score = ...
FROM sigs s WHERE oc.company_id = s.company_id;
```
→ **65 rows del radar re-puntuados con signal weights**.

### Workflow GitHub Actions actualizado
`daily_scrape.yml` ahora:
- Job `scrape_news` (Google News, diario 9 UTC = 6am AR).
- Job `scrape_bo` (Boletín Oficial, continúa even si falla — falta CUITs en companies).
- Soporta `workflow_dispatch` con inputs `top_growth` y `per_company_max`.

### Signals reales encontradas (top intent)
- **MiradorTEC** · funding_round (40) · fondo INNOVA CFI
- **Biobellus** · expansion_or_launch (25) · lanzamiento kits viajes
- **DACAS** · partnership (20) · alianza con Arista Networks
- **Sociedad Central de Arquitectos** · expansion_or_launch (25) · lanzamiento 5° edición

## 2026-05-13 · Sesión 5: BUG fix crítico contactos (endpoint deprecado + reveal flow)

### Root cause
El usuario probó "Enrich" en Humana, vio sector + headcount poblados, pero pidió **contactos calificados** y el botón "Buscar contactos" no traía nada. Investigación:

1. **Endpoint deprecado**: Apollo cambió `/mixed_people/search` → `/mixed_people/api_search`. El endpoint viejo devuelve un error explícito ("This endpoint is deprecated for API callers"). Nuestro `fetchContactsAction` y el Python client usaban el viejo.

2. **Filtros de seniority demasiado estrictos**: en empresas argentinas chicas, Apollo NO popula `seniority`. Filtrar por `["c_suite", "head", ...]` excluía 95% de los candidatos válidos. Hay que detectar decision-maker por título.

3. **api_search devuelve datos ofuscados**: `last_name_obfuscated: "Be***o"`, sin email. Para revelar email verificado hay que llamar `/people/match` con `reveal_personal_emails=true` por persona (1 crédito).

4. **Bug menor en enrich**: `apollo_data` jsonb se llenaba en search pero NO se mergeaba con el payload del enrich endpoint → perdíamos description, technologies completas, intent_topics activos, etc.

### Fix: fetchContactsAction v2
Nuevo flow en 3 pasos:
- **Step 1 — api_search (gratis)**: trae hasta 25 personas ofuscadas con title + has_email.
- **Step 2 — score por título**: prioriza candidatos. CEO/Founder=1.0, CTO/CMO/CFO=0.9, Director/Head/VP=0.8, Manager=0.5. Filtra score >= 0.5 + has_email.
- **Step 3 — people/match en paralelo (1 cred c/u por max)**: revela name + email + linkedin + photo. Filtra emails genéricos (`info@`, `contacto@`, `ventas@`, etc.) post-reveal.

Smoke test contra **Humana** (apollo_id `670e8ccaf5545f02d1e7ebb4`):
```
→ 4 personas indexadas en Apollo
→ Top 2 candidatos: CFO + People Leader
→ Revelados: Agustín Sanchez Bellocchio · agustinsb@humana.ar (verified, DM)
             Rocío Fernandez · rocio.fernandez@humana.ar (verified, no DM)
→ 0 genéricos, 2 créditos consumidos
```

### Toast actualizado
Muestra `{N} contactos válidos · {M} genéricos · {K} créditos` o el motivo claro de "ninguna con título decisional".

### Apollo client Python: mismo fix
- `search_people()` ahora usa `/mixed_people/api_search` (gratis, devuelve ofuscado).
- Nuevo método `match_person(person_id, reveal_personal_emails=True)` para hacer reveal de a una persona (1 crédito por reveal de email).

### Apollo enrich: merge de apollo_data
`enrichCompanyAction` ahora hace merge del payload del enrich endpoint sobre `apollo_data` jsonb (`apollo_data._enrich`, `apollo_data._enriched_at`). Antes lo perdíamos. También normaliza `technologies` que puede venir como string[] o objeto[].

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
