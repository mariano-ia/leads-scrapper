"""Anthropic Claude API wrapper para brief generation."""

from typing import Any

import anthropic

DEFAULT_MODEL = "claude-sonnet-4-6"


BRIEF_SYSTEM_PROMPT = """Sos un analista B2B que escribe briefs ejecutivos
sobre empresas argentinas para un equipo de ventas de Yacaré (estudio de
diseño y desarrollo digital con foco en IA para PYMEs).

Cada brief tiene exactamente 4 oraciones cortas, 80-130 palabras totales:
1. Qué hace la empresa (industria, tamaño, modelo)
2. Por qué está en el radar (crecimiento, señales recientes, financiera)
3. Por qué Yacaré podría serle útil (pitch específico, no genérico)
4. Riesgo o caveat (estado actual, competencia, momento del ciclo)

Tono: directo, sin marketing-speak, sin adjetivos vacíos. Ningún "innovador",
"líder", "estratégico" salvo que sea factual. Castellano rioplatense neutro.
Si faltan datos clave, dejarlo claro en lugar de inventar.
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
            max_tokens=400,
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
