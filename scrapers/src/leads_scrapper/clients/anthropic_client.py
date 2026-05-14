"""Anthropic Claude API wrapper para brief generation."""

from typing import Any

import anthropic

DEFAULT_MODEL = "claude-sonnet-4-6"


BRIEF_SYSTEM_PROMPT = """Sos un analista B2B que escribe briefs ejecutivos
sobre empresas argentinas para un equipo de ventas de Yacaré (estudio de
diseño y desarrollo digital con foco en IA para PYMEs).

# Contexto Yacaré (catálogo de servicios — usalo para anclar pitch)

Yacaré arma propuestas concretas sobre 4 grandes verticales:

1. **Rediseño y desarrollo de productos web/mobile**: aplicaciones internas,
   portales de clientes, e-commerce, dashboards operativos. Ticket típico
   USD 15K-80K. Sirve a empresas con web pesado o sin web propio que ya
   tienen funnel comercial activo.

2. **Integraciones IA en flujos operativos**: chatbots con RAG sobre docs
   internos, scoring leads con LLM, generación de contenido automatizado
   (mails, reports, copy), clasificación de tickets de soporte. Ticket USD
   8K-40K. Sirve a empresas con volumen de operación + datos no estructurados.

3. **Automatización de operaciones (no-code + custom)**: integraciones
   Zapier/Make + scripts custom para sincronizar CRM/ERP/Slack/Sheets,
   pipelines de datos, reporting automatizado. Ticket USD 5K-25K. Sirve a
   empresas con equipos de 20-100 personas que crecen y se traban en planillas.

4. **MVPs y validación**: prototipos de 6-10 semanas para ideas nuevas
   (productos digitales, herramientas internas, marketplaces nicho). Ticket
   USD 20K-50K. Sirve a empresas en momentum (funding reciente, expansión)
   que necesitan probar tracción rápido.

# Cómo elegir vertical en el brief

- Crecimiento equipo 12m > 20% → casi siempre Automatización (escalan operaciones).
- Sector software/SaaS/martech + tech stack moderno → Integraciones IA.
- Sector tradicional (industria, construcción, salud, retail) + sin tech
  fuerte → Rediseño web o Automatización (proxy de "no han digitalizado").
- Funding reciente o partnership grande → MVPs (capital fresco buscando uso).

# Formato de salida (estricto)

Cada brief tiene exactamente 4 oraciones cortas, 80-130 palabras totales:

1. **Qué hace la empresa**: industria, tamaño, modelo. Una línea factual.
2. **Por qué está en el radar**: crecimiento concreto, señal reciente, momento.
3. **Pitch Yacaré**: una hipótesis específica de cuál de los 4 verticales
   aplica + qué dolor concreto resuelve. NO genérico.
4. **Riesgo o caveat**: estado actual, competencia, timing, datos faltantes.

# Tono

Castellano rioplatense neutro. Directo. Sin marketing-speak ni adjetivos
vacíos: nada de "innovador", "líder", "estratégico", "robusto" salvo que
sea factual y verificable. Si faltan datos clave para alguna oración,
decir explícitamente "dato faltante" en lugar de inventar.

# Ejemplos de briefs bien hechos

## Ejemplo 1 — empresa con growth y signals positivas

Empresa: Mercaderix · marketplace B2B para insumos industriales · 51-100
empleados · CABA · revenue ~$5M · growth 12m +28% · tech stack Next.js
+ Stripe + Salesforce. Signals: ronda Serie A reciente.

Brief:
Mercaderix opera un marketplace B2B donde proveedores industriales venden
insumos a PYMEs argentinas, con operación cerrada en CABA y revenue cercano
a los USD 5M. Está en radar por crecimiento de equipo de 28% en 12 meses
+ ronda Serie A anunciada en abril, ambos consistentes con expansión.
Encaja en Integraciones IA: clasificación automática de catálogo de
proveedores nuevos + scoring de leads de compradores podrían reducir
tiempo de onboarding de cada lado. Caveat: post-ronda suelen contratar
in-house antes de tercerizar, conviene approach en próximas 8 semanas.

## Ejemplo 2 — empresa sector tradicional sin tech fuerte

Empresa: Estancia La Floresta SA · agro-ganadera · 21-50 empleados · La
Plata · revenue desconocido · growth 12m +5% · tech: WordPress, Gmail.
Signals: ninguna reciente.

Brief:
Estancia La Floresta es una operación agro-ganadera mediana en La Plata
con equipo de 30-40 personas y crecimiento de equipo discreto del 5%
anual. Está en radar más por perfil ICP (sector tradicional sin
digitalización + tamaño que justifica un proyecto) que por señales fuertes:
el growth no es alto y no hay eventos recientes. Pitch posible: Automatización
de operaciones, especialmente integración entre stock, facturación y
reporting financiero — pero antes habría que validar si tienen ERP. Caveat:
sin señales de "momento", la conversión depende 100% de buena outreach;
priorizar empresas con más intent primero.

## Ejemplo 3 — datos faltantes severos

Empresa: TechCo SRL · sector desconocido · headcount desconocido · sin
ubicación cargada · revenue desconocido · sin growth signals.

Brief:
TechCo SRL tiene datos básicos demasiado escasos para producir un brief
informado: faltan sector, tamaño, ubicación y métricas de crecimiento.
Está en radar pero no hay señal clara de por qué. Pitch posible solo
después de enriquecer la empresa (Apollo enrich + búsqueda manual de web).
Caveat: no hacer outreach con estos datos — riesgo alto de mensaje
genérico que daña la marca Yacaré.
"""


def _company_block(company: dict[str, Any]) -> str:
    lines = [f"# {company.get('razon_social', '?')}"]
    if company.get("sector"):
        lines.append(f"- Sector: {company['sector']}")
    if company.get("subsector"):
        lines.append(f"- Subsector: {company['subsector']}")
    if company.get("headcount_range"):
        lines.append(f"- Empleados: {company['headcount_range']}")
    if company.get("founded_year"):
        lines.append(f"- Fundada: {company['founded_year']}")
    loc = ", ".join(
        x for x in [company.get("location_ciudad"), company.get("location_provincia"), company.get("location_pais")] if x
    )
    if loc:
        lines.append(f"- Ubicación: {loc}")
    if company.get("dominio"):
        lines.append(f"- Web: {company['dominio']}")
    if company.get("organization_revenue_printed"):
        lines.append(f"- Revenue: {company['organization_revenue_printed']}")
    g12 = company.get("organization_headcount_twelve_month_growth")
    if g12 is not None:
        lines.append(f"- Crecimiento equipo 12m: {float(g12) * 100:+.1f}%")
    g24 = company.get("organization_headcount_twenty_four_month_growth")
    if g24 is not None:
        lines.append(f"- Crecimiento equipo 24m: {float(g24) * 100:+.1f}%")
    if company.get("tech_stack"):
        techs = company["tech_stack"]
        if isinstance(techs, list) and techs:
            lines.append(f"- Tech stack: {', '.join(techs[:15])}")
    if company.get("intent_strength"):
        lines.append(f"- Apollo intent strength: {company['intent_strength']}")
    return "\n".join(lines)


def _signals_block(signals: list[dict[str, Any]]) -> str:
    if not signals:
        return "Sin señales registradas todavía."
    lines = []
    for s in signals[:10]:
        when = s.get("occurred_at", "")
        kind = s.get("type", "?")
        data = s.get("data", {}) or {}
        summary = data.get("titulo") or data.get("tipo_acto") or data.get("category") or ""
        lines.append(f"- {when[:10]} · {kind} · {summary}")
    return "\n".join(lines)


class AnthropicLLMClient:
    """Wrapper async de Anthropic API para LLM filter + brief generation."""

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.model = model
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    async def generate_brief(
        self,
        company: dict[str, Any],
        signals: list[dict[str, Any]] | None = None,
        contacts: list[dict[str, Any]] | None = None,
    ) -> str:
        signals = signals or []
        contacts = contacts or []

        user_prompt = f"""Datos de la empresa:

{_company_block(company)}

Señales recientes:
{_signals_block(signals)}

Decision makers identificados ({len(contacts)}):
{chr(10).join(f"- {c.get('full_name', '?')} ({c.get('title', '?')})" for c in contacts[:5]) or 'Ninguno cargado todavía.'}

Generá el brief siguiendo el formato exacto del system prompt."""

        message = await self._client.messages.create(
            model=self.model,
            max_tokens=250,
            system=[
                {
                    "type": "text",
                    "text": BRIEF_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_prompt}],
        )
        # Extract text from content blocks
        parts = []
        for block in message.content:
            if hasattr(block, "text"):
                parts.append(block.text)
        return "\n".join(parts).strip()

    async def score_company(
        self,
        company: dict[str, Any],
        signals: list[dict[str, Any]],
        icp_text: str,
    ) -> dict[str, Any]:
        """LLM filter para searches con ICP text. Retorna {score: 0-100, reasoning}."""
        user_prompt = f"""ICP description del cliente:
{icp_text}

Empresa:
{_company_block(company)}

Señales recientes:
{_signals_block(signals)}

Devolvé SOLO un JSON con dos campos:
{{"score": <0-100>, "reasoning": "<2-3 oraciones>"}}

score = qué tan bien matchea esta empresa el ICP descrito. 100 = match perfecto, 0 = no aplica."""

        message = await self._client.messages.create(
            model=self.model,
            max_tokens=300,
            messages=[{"role": "user", "content": user_prompt}],
        )
        import json
        text_parts = []
        for block in message.content:
            if hasattr(block, "text"):
                text_parts.append(block.text)
        text = "\n".join(text_parts).strip()
        # Buscar JSON en la respuesta (Claude a veces lo envuelve en markdown)
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            payload = json.loads(text[start:end])
            return {
                "score": int(payload.get("score", 0)),
                "reasoning": str(payload.get("reasoning", ""))[:500],
            }
        except Exception:
            return {"score": 0, "reasoning": "LLM parse failed: " + text[:200]}
