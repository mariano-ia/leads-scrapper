# ADR 0003 · Apollo como fuente única en F0 (no Snov.io, no SerpAPI)

- **Fecha**: 2026-05-13
- **Estado**: Aceptado
- **Tomado por**: Usuario tras presupuesto fijo de $100/mes operativo

## Contexto

Tres servicios de enrichment evaluados para conseguir contactos (decision makers + emails) de empresas:

1. **Apollo.io** — base grande con search por empresa + people, emails verificados. Plan Basic $99/mes con créditos export limitados.
2. **Snov.io** — más barato ($39/mes Pro 1K), pero principalmente domain → contacts. Necesita dominio del empresa primero.
3. **SerpAPI** — Google Search API, ~$20/mes. Útil para "razón social → dominio" cuando no se conoce.

Originalmente la propuesta era SerpAPI + scraping propio en Fase 0 con Snov.io en Fase 0.5. Eso asumía que el universo se construye scrapeando "empresas mencionadas en X". Después del pivote a [[0001-companies-signals-as-center]] el universo viene de Apollo, lo que cambia la ecuación.

## Decisión

**Solo Apollo en F0.** Sin Snov.io, sin SerpAPI.

Razones:
- Apollo es la fuente del universo (decision dependiente de [[0001-companies-signals-as-center]]). Si Apollo provee la empresa, también provee sus decision makers + emails — no necesito un segundo provider para enrichment.
- SerpAPI servía para "razón social → dominio" pero Apollo ya da el dominio.
- Snov.io se justificaba como fallback de Apollo para empresas no cubiertas. Esa decisión se posterga a F0.5 cuando tengamos data real del match rate de Apollo para PYMEs argentinas.

## Consecuencias

**Positivas**:
- Presupuesto operativo total revisado: **~$69/mes** ($49 Apollo Basic annual billing + $10 Supabase + ~$10 Claude). Bien por debajo del techo $100. La estimación original asumía Apollo Basic $99/mes mensual; la realidad es $49/mes con billing annual.
- Una sola dependencia externa de discovery — menos puntos de falla.
- Interfaz abstracta `EnrichmentProvider` se mantiene (anticipa swap a Snov.io en F0.5 si Apollo decepciona).

**Sobre pricing per-seat (importante para escalar SaaS)**:
- Apollo cobra por seat (usuario Apollo), no por usuario de nuestra plataforma.
- 1 seat alcanza para todo el F0: la API key se usa desde el backend para todas las orgs/usuarios nuestros.
- Solo necesitaríamos más seats si gente del equipo Yacaré quisiera hacer research manual logueada en Apollo.com directamente.
- Conclusión: agregar 1000 usuarios a nuestra plataforma = $0 extra Apollo. Lo que escala con uso es créditos, controlado por el budget guardrail.

**Buying Intent en Basic**: Basic incluye 6 Intent Topics (Professional tiene 12). Para F0 alcanza con 6 topics relevantes a Yacaré (AI, Marketing Automation, Digital Transformation, Data Analytics, CRM, Cloud). Se incorporan al sistema como signal type `apollo_intent` con su peso y decay. Upgrade a Professional solo si los 6 quedan cortos — decisión revisable barata.

**Negativas / riesgos**:
- Si la cobertura Apollo de PYMEs argentinas resulta baja (estimación 30-50% match rate optimista), nos quedamos cortos sin plan B activo.
- Plan B documentado: promote `candidate_companies` del BO al universo, y/o agregar Snov.io como secundario en F0.5.

## Alternativas consideradas

1. **Snov.io directo sin Apollo**. Descartado: Apollo da el universo, no solo enrichment.
2. **Apollo + Snov.io desde el día 1**. Descartado por costo ($99+$39=$138 vs $99) y porque no sabemos aún si Snov.io aporta sobre Apollo para PYMEs AR.
3. **Apollo + SerpAPI cascade**. Descartado: SerpAPI agrega complejidad sin valor claro cuando Apollo ya da el dominio.

## Referencias
- Spec §13 (costos)
- [[ADR 0001 — Companies+signals as center]]
- Decisión revisable en F0.5 con data real
