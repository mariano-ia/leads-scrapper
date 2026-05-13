# ADR 0002 · Universe target de dos capas (maestro + per-org)

- **Fecha**: 2026-05-13
- **Estado**: Aceptado
- **Tomado por**: Usuario después de pedido explícito "definir target por UI con seguimiento"

## Contexto

El usuario pidió que la "definición de target" sea editable desde UI con tracking de cambios. En un sistema multi-tenant, hay dos interpretaciones posibles:

1. **Cada org define su propio target Apollo** → cada org tiene su sync independiente, costos Apollo se multiplican por cantidad de orgs.
2. **Un único target global** → todas las orgs ven exactamente las mismas empresas, no hay diferenciación entre Yacaré y eventuales clientes externos.

La 1 era inviable económicamente (Apollo Basic $99/mes por org). La 2 era inflexible para multi-tenant real.

## Decisión

Implementar **dos capas + tercera**:

- **Capa 1 · Universe maestro** (global, super-admin only): define qué empresas existen en absoluto en el sistema. Criterios amplios (país AR, headcount range max, sectores priorizados, founded_year). Esto es lo que Apollo sincroniza. Versionado en `universe_master_versions` con `is_active = true` único.

- **Capa 2 · Universe target per-org** (per-org, admin de la org): filtro **sobre** el universo maestro. Cada org dice "del universo de 12K empresas, me interesan estas 3K". Es filtro local sobre data ya pulled — NO consume créditos Apollo extras. Versionado en `org_universe_targets` con `is_active` único por `org_id`.

- **Capa 3 · Searches** (per-org, cualquier member): filtros más finos sobre el target de la org para crear listas específicas con scoring (fit + intent + LLM).

Ambas capas 1 y 2 son **versionadas** — cada cambio crea una nueva versión, la anterior queda como `deactivated_at`. Tracking de evolución preservado.

## Consecuencias

**Positivas**:
- Costos Apollo controlados: un solo sync alimenta a todas las orgs.
- Multi-tenant real sin explosión de costos.
- Habilita "descubrimiento serendipitoso": una org puede ver una empresa que no estaba en sus searches pero que matchea por nueva señal.
- Versionado da audit trail completo para "seguimiento".
- UI puede mostrar preview "esto matchearía X empresas" sin gastar créditos.

**Negativas**:
- Más tablas (`universe_master_versions` + `org_universe_targets`).
- Lógica de "join target_filter con universe table" en cada query — manejado vía vistas Postgres.
- Pequeña pérdida de aislamiento de tenant: todas las orgs ven el mismo conjunto de empresas (aunque filtradas por su target). Aceptable en F0; revisar si llega un cliente con requerimientos de privacidad fuerte.

## Alternativas consideradas

1. **Solo capa global**. Descartado porque no permite diferenciar entre orgs.
2. **Solo capa per-org con sync independiente**. Descartado por costo Apollo ×N orgs.
3. **Universe maestro fijo en config file**. Descartado: el usuario pidió "parametrizable por UI" con tracking.

## Referencias
- Spec §6.1 (tabla `universe_master_versions`)
- Spec §6.2 (tabla `org_universe_targets`)
- Spec §7.1 y §7.2 (schemas JSONB)
