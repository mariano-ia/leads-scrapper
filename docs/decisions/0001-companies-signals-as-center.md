# ADR 0001 · Companies + signals como centro del modelo (no leads)

- **Fecha**: 2026-05-13
- **Estado**: Aceptado
- **Tomado por**: Usuario después de iniciar brainstorming con framing original "scraper del BO"

## Contexto

El framing original del proyecto fue "scraper del Boletín Oficial". El primer diseño asumió que cada acto societario del BO era un "lead" — un objeto principal de la base, propiedad de una org.

Después de iterar sobre el target real, se identificaron dos problemas con ese framing:

1. **Empresas recién constituidas son malos clientes para servicios de IA**. El BO captura empresas con 15-60 días de antigüedad, que están armando estructura básica todavía. Las que valen para Yacaré son PYMEs establecidas (3-15 años) con operación real y señales recientes de movimiento tech.

2. **El BO no es la fuente principal de "qué empresa es interesante", es una fuente de eventos**. El BO genera señales (ampliación de capital, fusión, cambio de objeto) sobre empresas que pueden estar en o fuera del universo target.

Esto sugiere un modelo distinto: el **universo cualificado de empresas** existe independientemente del BO, y el BO (más otras fuentes) emiten **señales temporales** que se asocian a empresas del universo y modulan su prioridad.

## Decisión

El modelo de datos tiene como centro **`companies` + `signals`**, no `leads`. Implicancias:

- `companies` es global (compartida entre orgs), poblada principalmente por Apollo + complementos del BO/web.
- `signals` es global, asociada por `company_id`, con tipo, fecha de ocurrencia, payload y peso para scoring temporal.
- Lo que antes era "lead" pasa a ser `org_companies` = "empresas que matchearon una search activa de una org en un momento dado".
- El scoring es derivado: `combined_score = fit_score(company, search) × intent_score(company)` con decay temporal exponencial sobre signals.

## Consecuencias

**Positivas**:
- Una sola empresa puede aparecer en múltiples orgs con scoring independiente.
- Signals acumulan history natural — no se sobrescriben.
- Apollo se vuelve la fuente primaria del universo, no un "enrichment provider" secundario.
- El BO baja de fuente principal a fuente de signals complementaria.
- Habilita "candidate companies" — empresas detectadas por scraping que no están en Apollo pero podrían promoverse al universo.

**Negativas / trade-offs**:
- Más tablas globales que por-org (rompe simetría de RLS simple).
- Scoring on-read es más caro que score pre-computado por lead. Mitigación: cachear `last_*_score` en `org_companies` y recalcular en background.
- Pivote durante brainstorming costó tiempo (~30 min de re-trabajo del modelo de datos).

## Alternativas consideradas

1. **Original: lead-centric**. Cada acto del BO = un lead. Descartado porque captura mal el caso de uso real (empresas establecidas con señales recientes).
2. **Híbrido: leads + signals separados**. Mantener tabla `leads` con datos snapshoteados y `signals` agregadas. Descartado porque genera redundancia y dificulta merge de empresas detectadas por múltiples fuentes.

## Referencias
- Spec §6.1 (tablas globales)
- Spec §8 (scoring)
- [[ADR 0003 — Apollo only en F0]]
