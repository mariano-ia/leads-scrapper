# Info por empresa — esperado vs actual

Última actualización: 2026-05-13

## Estado de cobertura actual (universo Yacaré)

| Capa | % cubierto | Fuente | Notas |
|---|---|---|---|
| Datos base | 100% (23.707 empresas) | Apollo `mixed_companies/search` | Razón social, dominio, LinkedIn, founded_year, revenue numérico, headcount growth |
| Revenue printed (`$XM`) | 5% (1.135) | Apollo search | Solo lo trae para empresas con datos públicos; el resto solo numérico → ahora se formatea local |
| Enriched (sector, headcount, ciudad, tech) | 0.6% (154) | Apollo `/organizations/enrich` (1 cred/empresa) | Manual desde `/companies/:id` o batch jobs |
| AI brief | 0.4% (96) | Claude Sonnet 4.6 | Solo se genera si la empresa ya está enriched |
| Intent topics | 0% (todavía) | Apollo (configurados, próximo sync) | Quedan en `intent_strength` + `apollo_data.intent_strength` |
| Signals (BO, jobs, prensa) | 0% | Scrapers propios | Pendiente correr en cron |
| Contacts (decision makers) | 0% | Apollo `mixed_people/search` (1 cred/reveal) | Pendiente integración en flow |

## Listado completo de campos por empresa

### Capa 1 — Base (Apollo search, gratis dentro del plan)

Todos vienen con cada empresa que entra al universo. Se ven en `/companies` y `/companies/:id`.

| Campo | Tipo | Mostrado en | Notas |
|---|---|---|---|
| `razon_social` (name) | string | listado + detalle | display name de la empresa |
| `dominio` (primary_domain) | string | listado + detalle | sin scheme, link a `https://...` |
| `linkedin_url` | string | listado (ícono) + detalle | |
| `founded_year` | number | listado + detalle | |
| `organization_revenue` | number | detalle (Card Financial) | revenue numérico USD/año, fallback al formateo local |
| `organization_revenue_printed` | string | detalle | `$XM`/`$XB` cuando Apollo lo tiene |
| `organization_headcount_six_month_growth` | number (0..1) | detalle (Stat) | growth últimos 6m |
| `organization_headcount_twelve_month_growth` | number | listado (badge) + detalle | growth 12m — el sort default |
| `organization_headcount_twenty_four_month_growth` | number | listado + detalle | growth 24m |
| `phone` | string | detalle | |
| `apollo_id` | string | detalle footer | id origen |
| `last_apollo_sync_at` | timestamp | detalle footer | última vez que sincronizamos |

### Capa 2 — Enriched (Apollo enrich, 1 crédito/empresa)

Aparece al tocar **"Enrich Apollo (1 cred)"** en detalle. Indicador: <kbd>Database</kbd> icon violeta junto al nombre en `/companies`.

| Campo | Tipo | Notas |
|---|---|---|
| `sector` | string | "Internet", "Software", "Construction", ... |
| `subsector` | string | sub-categoría más fina |
| `headcount_range` | string | "11-50", "51-200", "201-500", ... |
| `location_ciudad` | string | normalmente CABA / interior |
| `location_provincia` | string | |
| `location_pais` | string | siempre "Argentina" en nuestro universo |
| `tech_stack` | string[] | tecnologías detectadas (CMS, lenguajes, SaaS) |
| `description` | text | descripción de la empresa según Apollo |
| `intent_strength` | enum | "low" / "medium" / "high" — fuerza del intent agregado |
| `intent_topics` | string[] | temas con intent activo ("AI", "automation", etc.) |
| `market_cap` | string | si público |
| `publicly_traded_symbol` | string | si público |

### Capa 3 — AI brief (Claude Sonnet 4.6, ~$0.003/empresa)

Aparece al tocar **"Generar brief"** (requiere capa 2 enriched primero). Indicador: <kbd>Sparkles</kbd> icon azul junto al nombre.

| Campo | Tipo | Notas |
|---|---|---|
| `ai_brief` | text (~3-4 frases) | resumen interno: qué hace la empresa, momento, hipótesis de oferta |
| `ai_brief_generated_at` | timestamp | última generación |
| `ai_brief_model` | string | "claude-sonnet-4-6" |

### Capa 4 — Signals (scrapers propios, futuro)

Pendientes de habilitar en cron. Cada signal va a la tab "Signals" del detalle.

| Tipo | Fuente | Pesa intent | Estado |
|---|---|---|---|
| `tender_published` | BO Nacional (PDFs) | +0.4 | scraper existe, sin cron |
| `job_posted_ai_role` | Bumeran/LinkedIn | +0.3 | TODO |
| `press_mention` | Google News RSS | +0.2 | TODO |
| `tech_adoption` | Apollo enrich diff | +0.3 | TODO |
| `funding_round` | LinkedIn / press | +0.5 | TODO |

### Capa 5 — Contacts (Apollo people search, 1 cred/reveal)

Tab "Contacts" del detalle. Pendiente botón "Get contacts". Por ahora se llena solo en empresas en radar con búsqueda manual de decision makers.

| Campo | Tipo |
|---|---|
| `full_name`, `title`, `email`, `phone`, `linkedin_url` | string |
| `is_decision_maker` | bool (rol CEO/CTO/Director) |
| `seniority` | enum |

### Capa 6 — Pipeline (per-org, en `org_companies`)

Aparece cuando la empresa entra al radar (vía `+ Radar` manual o vía match de search).

| Campo | Notas |
|---|---|
| `status` | new → researching → contacted → meeting → won/lost |
| `owner_user_id` | usuario responsable dentro de la org (marca de responsabilidad, no de visibilidad — todos ven todo) |
| `last_fit_score` | 0..1, qué tan bien matchea el ICP de la org |
| `last_intent_score` | 0..1, fuerza del intent agregado (growth + signals + apollo intent) |
| `last_combined_score` | weighted fit × intent |
| `first_matched_at` | cuándo entró al radar |
| `last_search_id` | qué search la trajo (o `null` si manual) |
| `notes` (relación) | thread de notas por equipo |

## Qué falta para "info completa por empresa"

1. **Correr Apollo enrich en batch** — 23k empresas × 1 cred = 23k créditos. Hoy gastamos ~150. Posible esquema: enrich solo lo que matchea alguna search o lo que entra al radar.
2. **Cron de signals** — habilitar BO scraper en GitHub Actions, agregar Bumeran/Google News.
3. **Apollo intent topics activos** — ya configurados en Apollo UI, próximo sync los va a levantar a `intent_strength` y `intent_topics`.
4. **Contact reveal flow** — botón "Get contacts" en detalle, integrar `mixed_people/search` con filtro de seniority.
5. **AI brief en bulk** — Anthropic billing: agregar saldo prepago para correr `generate_briefs.py` sobre todos los enriched.

## Costo por empresa "completa"

- Base + Search → $0 (incluido en plan Apollo Basic)
- Enrich → 1 crédito Apollo
- 1-3 contactos revelados → 1-3 créditos Apollo
- AI brief → ~$0.003 (Claude Sonnet)
- Signals → $0 (scrapers propios)

**Total empresa "ready to outreach": ~4 créditos Apollo + ~$0.003 Anthropic.**

Plan Apollo Basic incluye créditos mensuales — el budget guardrail se monitorea en `/admin/usage` y bloquea al 100%.
