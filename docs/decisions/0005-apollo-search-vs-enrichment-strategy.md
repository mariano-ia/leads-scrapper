# ADR 0005 · Apollo search-first, enrichment on-demand

- **Fecha**: 2026-05-13
- **Estado**: Aceptado
- **Tomado por**: Decisión técnica tras testing real de Apollo API el 2026-05-13

## Contexto

Tras conectar la API key de Apollo y probar `POST /mixed_companies/search` con un request real, descubrimos que la respuesta NO incluye varios campos críticos que el spec original asumía:

**Apollo search SÍ devuelve** (verificado):
- Identidad: `id`, `name`, `primary_domain`, `website_url`, `linkedin_url/uid`, social URLs
- `founded_year`, `sic_codes`
- Financial: `market_cap`, `organization_revenue`
- Growth signals: `organization_headcount_six/twelve/twenty_four_month_growth`
- Apollo intent: `intent_strength`, `show_intent`, `has_intent_signal_account`
- Phone, languages

**Apollo search NO devuelve**:
- ❌ `industry` / `sub_industry`
- ❌ `estimated_num_employees` / headcount range
- ❌ `country` / `state` / `city`
- ❌ `technologies` / `keywords`
- ❌ `short_description`

Para obtener esos campos hay que llamar a `POST /organizations/enrich`, que cuesta **1 crédito por empresa**.

## Restricción de presupuesto

Plan Apollo Basic: $49/mes annual, 30.000 créditos/año = ~2.500 créditos/mes efectivos.

Si enriqueciéramos las 5K-15K empresas del universo Argentina target → 5K-15K créditos solo para la carga inicial. Eso excedería 2-6x el budget anual disponible. Insostenible.

## Decisión

Estrategia **search-first, enrichment on-demand**:

1. **Initial universe sync** y **delta semanal**: solo `mixed_companies/search`. 0 créditos. Almacena en `companies` los fields que vienen en search (id, dominio, founded_year, growth, intent, financial).

2. **Enrichment automático on-demand**: cuando una empresa entra a `org_companies` (matchea una search activa de una org), un job background la enriquece para completar industry/headcount/location/technologies. Costo: 1 crédito por empresa que se vuelve "interesante".

3. **Refresh periódico de enrichment**: cada 90 días para empresas activas en `org_companies` (industry rara vez cambia, tech_stack a veces).

4. **Volumen estimado de enrichment**:
   - F0 Yacaré uso interno: ~200-500 empresas que entran al radar por mes → 200-500 créditos/mes
   - Bien debajo del cap 2500/mes
   - Margen para refresh + decision maker reveals (search_people)

## Consecuencias

**Positivas**:
- Initial sync gratis. Podemos bajar 10K empresas argentinas sin tocar el budget.
- Créditos se gastan solo donde aporta valor (empresas que el equipo va a contactar).
- Apollo intent signals (`intent_strength`, growth metrics) vienen gratis en search — son una señal rica para nuestro `intent_score` sin gastar créditos.
- Escalable: agregar 100 nuevas orgs a la plataforma no multiplica el costo (cada org enriquece solo lo que mira).

**Negativas / trade-offs**:
- Las empresas en `companies` (universe) pero NO en ningún `org_companies` tienen industry/headcount/etc en NULL. Si querés filtrar por industry sobre TODO el universo, no podés hasta enriquecer.
- Mitigación: los filtros estructurados que se aplican durante search Apollo (ya con `q_organization_industry_tag_ids`, `organization_num_employees_ranges`) hacen el filtrado at-source. Cuando un user crea una search, las empresas que matchean ya están pre-filtradas por Apollo, aunque no sepamos el valor exacto del field en DB.
- UI implication: en `/[org]/companies` listado mostramos los fields que tenemos (name, domain, growth, intent, founded). El detalle (industry, headcount, location, tech) aparece solo en empresas enriquecidas. Marcamos visualmente "no enrichment yet" en las que faltan datos, con botón "Enrich now" que dispara la llamada manual.

## Cambios en el código

- `models/apollo.py`: separamos `ApolloAccount` (search response) de `ApolloEnrichedOrganization` (enrich response).
- `clients/apollo.py`: nuevo método `enrich_organization(domain | organization_id)`.
- `repositories/companies_repo.py`: `upsert_company_from_search` y `update_company_with_enrichment` separados.
- `jobs/apollo_sync.py`: ya no enriquece en `--mode initial`. Sólo search.
- Nuevo job (Week 3): `enrich_pending_companies.py` que itera `org_companies` con `companies.sector IS NULL` y enriquece.

## Credit counter para la UI

Como complemento a esta decisión y para que el usuario tenga visibilidad de cuánto gastamos:
- Vista SQL `apollo_credit_summary` (migration 0009) consolidando budget + uso del mes.
- CLI `scripts/credit_status.py` muestra el estado por terminal con barra de progreso ASCII.
- En el spec UI (sección 11), el panel `/admin/universe` mostrará este resumen con barra de progreso y alertas visuales en thresholds.

## Referencias
- Spec §6 (modelo de datos)
- Spec §9.1 (flujo sync)
- [[ADR 0003 — Apollo only en F0]]
- Verificación empírica: `curl POST /mixed_companies/search ... 2026-05-13`
