# ADR 0004 · Multi-tenant vía Row Level Security de Postgres

- **Fecha**: 2026-05-13
- **Estado**: Aceptado
- **Tomado por**: Decisión técnica derivada del pedido "SaaS embrionario sin billing"

## Contexto

El usuario pidió: "Yacaré + clientes externos eventualmente, multi-tenant sí, billing no". Para implementar multi-tenant hay tres patrones reconocidos:

1. **Database-per-tenant**: cada org tiene su propia DB. Aislamiento fuerte, costos ×N, ops complejas.
2. **Schema-per-tenant**: cada org tiene su propio schema dentro de la misma DB. Aislamiento medio, mejor que DB-per-tenant en costos.
3. **Row Level Security con `org_id`**: una sola DB, una sola tabla por entidad, RLS filtra por `org_id`. Aislamiento lógico, costos bajos, query-time check.

Supabase está construido sobre Postgres con primera-class support para RLS y JWT-based `auth.uid()`. Eso vuelve la opción 3 la default natural en este stack.

## Decisión

**Multi-tenant vía Postgres RLS** con `org_id` en cada tabla por-org. Helper functions `user_is_member_of(org_id)` y `user_is_admin_of(org_id)` evalúan membresía vía `org_members`.

Convenciones:
- Tablas por-org tienen `org_id` not null con FK a `orgs.id`.
- Policy genérica: `USING (user_is_member_of(org_id) OR is_super_admin())`.
- Datos crudos del BO/Apollo/etc son globales (compartidos entre orgs) — `companies`, `signals`, `company_contacts` no tienen `org_id`.
- Datos subjetivos (ownership, notas, status) son por-org.

## Consecuencias

**Positivas**:
- Una sola DB → costos $10/mes Supabase, no por-tenant.
- Joins entre tablas globales y por-org son triviales.
- Onboarding de nueva org = `INSERT INTO orgs + INSERT INTO org_members`. Cero ops.
- Datos del universo (companies + signals + contacts) son compartidos eficientemente.

**Negativas / riesgos**:
- **Riesgo de leak por bug en RLS**: una policy mal escrita expone datos cross-tenant. Mitigación: tests integrales que crean 2 orgs y validan aislamiento. Estos tests están en el plan W2/W3.
- Performance de queries con muchas joins + RLS check: monitorear. Indexes en `org_id` son críticos.
- `is_super_admin()` y helpers son SECURITY DEFINER → necesitan auditoría de exposición vía RPC. Ya documentado y mitigado parcialmente en migration 0008 (REVOKE EXECUTE de anon).

## Alternativas consideradas

1. **Schema-per-tenant**. Descartado por complejidad de migrations cross-schema y dificultad de queries globales.
2. **DB-per-tenant en Supabase**. Descartado por costo ×N (cada Supabase project son $10/mes mínimo si pasás del free tier).
3. **App-level filtering sin RLS**. Descartado por riesgo: cualquier bug en código de aplicación expone datos. RLS hace cumplir aislamiento a nivel DB.

## Referencias
- Spec §6.3 (RLS policies)
- Supabase docs: https://supabase.com/docs/guides/database/postgres/row-level-security
- Migration 0004_rls.sql
- [[ADR 0001 — Companies+signals as center]] (justifica qué tablas son globales vs por-org)
