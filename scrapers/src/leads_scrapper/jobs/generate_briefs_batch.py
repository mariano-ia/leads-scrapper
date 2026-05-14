"""Genera AI briefs usando Anthropic Message Batches API (50% más barato + async).

vs `generate_briefs.py` que llama 1-a-1:
- Cost: $0.0025/brief (vs $0.005/brief) → 50% off
- Latency: 1 batch submit, espera, download. Total wall-clock similar pero NO
  bloquea el proceso del scraper mientras Claude procesa.
- Trade-off: hasta 24h de SLA de Anthropic; OK para batch nocturno, no para
  on-demand. El `generate_briefs.py` original queda para casos on-demand.

Flow:
  1. Pull candidates (limit N)
  2. Build batch request con N custom_ids
  3. Submit batch → batch_id
  4. Poll cada 30s hasta processing_status='ended'
  5. Download results, update companies

Invocación:
  python -m leads_scrapper.jobs.generate_briefs_batch [--limit N] [--poll-interval 30]
"""

import argparse
import asyncio
import sys
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from leads_scrapper.clients.supabase_client import create_supabase_admin_client
from leads_scrapper.config import get_settings
from leads_scrapper.utils.logging import get_logger, setup_logging

logger = get_logger("generate_briefs_batch")

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages/batches"

SYSTEM_PROMPT = (
    "Sos un analista B2B que escribe briefs ejecutivos sobre empresas argentinas "
    "para un equipo de ventas de Yacaré (estudio de diseño y desarrollo digital "
    "con foco en IA para PYMEs).\n\n"
    "Cada brief tiene exactamente 4 oraciones cortas, 80-130 palabras totales:\n"
    "1. Qué hace la empresa (industria, tamaño, modelo)\n"
    "2. Por qué está en el radar (crecimiento, señales recientes, financiera)\n"
    "3. Por qué Yacaré podría serle útil (pitch específico, no genérico)\n"
    "4. Riesgo o caveat (estado actual, competencia, momento del ciclo)\n\n"
    "Tono: directo, sin marketing-speak. Castellano rioplatense neutro."
)


def _build_user_prompt(c: dict[str, Any]) -> str:
    growth_12 = c.get("organization_headcount_twelve_month_growth")
    growth_24 = c.get("organization_headcount_twenty_four_month_growth")
    tech = c.get("tech_stack") or []
    return (
        f"# {c.get('razon_social') or '?'}\n"
        f"- Sector: {c.get('sector') or '?'}\n"
        f"- Subsector: {c.get('subsector') or '?'}\n"
        f"- Empleados: {c.get('headcount_range') or '?'}\n"
        f"- Fundada: {c.get('founded_year') or '?'}\n"
        f"- Ubicación: {', '.join([x for x in [c.get('location_ciudad'), c.get('location_provincia'), c.get('location_pais')] if x]) or '?'}\n"
        f"- Web: {c.get('dominio') or '?'}\n"
        f"- Revenue: {c.get('organization_revenue_printed') or '?'}\n"
        f"- Growth 12m: {f'{growth_12 * 100:.1f}%' if growth_12 is not None else '?'}\n"
        f"- Growth 24m: {f'{growth_24 * 100:.1f}%' if growth_24 is not None else '?'}\n"
        f"- Tech: {', '.join(tech[:15]) if isinstance(tech, list) and tech else '—'}\n"
        f"- Apollo intent: {c.get('intent_strength') or 'n/a'}\n\n"
        f"Generá el brief siguiendo el formato del system prompt."
    )


async def submit_batch(client: httpx.AsyncClient, api_key: str, model: str, requests: list[dict]) -> str:
    """Submit batch a Anthropic, devuelve batch_id."""
    body = {"requests": requests}
    resp = await client.post(
        ANTHROPIC_API_URL,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "message-batches-2024-09-24",
            "content-type": "application/json",
        },
        json=body,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["id"]


async def poll_batch(client: httpx.AsyncClient, api_key: str, batch_id: str, interval: int) -> dict:
    """Poll hasta processing_status='ended'."""
    while True:
        resp = await client.get(
            f"{ANTHROPIC_API_URL}/{batch_id}",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "message-batches-2024-09-24",
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        status = data.get("processing_status")
        logger.info("batch poll", extra={"batch_id": batch_id, "status": status, "counts": data.get("request_counts")})
        if status == "ended":
            return data
        if status in ("canceled", "expired", "errored"):
            raise RuntimeError(f"batch {batch_id} ended in {status}")
        await asyncio.sleep(interval)


async def download_results(client: httpx.AsyncClient, api_key: str, results_url: str) -> list[dict]:
    """Descarga results.jsonl, parsea y devuelve lista."""
    resp = await client.get(
        results_url,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "message-batches-2024-09-24",
        },
        timeout=120,
    )
    resp.raise_for_status()
    out = []
    for line in resp.text.splitlines():
        line = line.strip()
        if line:
            import json
            out.append(json.loads(line))
    return out


async def run(*, limit: int = 50, poll_interval: int = 30) -> int:
    setup_logging()
    settings = get_settings()
    supabase = create_supabase_admin_client()

    if not settings.anthropic_api_key:
        logger.error("ANTHROPIC_API_KEY not set")
        return 2

    candidates = (
        supabase.table("companies")
        .select(
            "id, razon_social, sector, subsector, headcount_range, founded_year, "
            "location_ciudad, location_provincia, location_pais, dominio, "
            "organization_revenue_printed, organization_headcount_twelve_month_growth, "
            "organization_headcount_twenty_four_month_growth, tech_stack, intent_strength"
        )
        .eq("status", "active")
        .not_.is_("sector", "null")
        .is_("ai_brief", "null")
        .limit(limit)
        .execute()
        .data
        or []
    )

    if not candidates:
        logger.info("no candidates, nothing to do")
        return 0

    logger.info("submitting batch", extra={"n_candidates": len(candidates), "model": settings.anthropic_model})

    requests = [
        {
            "custom_id": c["id"],
            "params": {
                "model": settings.anthropic_model,
                "max_tokens": 400,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": _build_user_prompt(c)}],
            },
        }
        for c in candidates
    ]

    async with httpx.AsyncClient() as client:
        batch_id = await submit_batch(client, settings.anthropic_api_key, settings.anthropic_model, requests)
        logger.info("batch submitted", extra={"batch_id": batch_id})

        ended = await poll_batch(client, settings.anthropic_api_key, batch_id, poll_interval)
        results_url = ended.get("results_url")
        if not results_url:
            logger.error("no results_url in ended batch", extra=ended)
            return 3

        results = await download_results(client, settings.anthropic_api_key, results_url)

    generated = 0
    errors = 0
    now = datetime.now(timezone.utc).isoformat()
    for r in results:
        custom_id = r.get("custom_id")
        result = r.get("result", {})
        if result.get("type") == "succeeded":
            message = result.get("message", {})
            brief = "\n".join(b.get("text", "") for b in message.get("content", [])).strip()
            if brief and custom_id:
                supabase.table("companies").update({
                    "ai_brief": brief,
                    "ai_brief_generated_at": now,
                    "ai_brief_model": settings.anthropic_model,
                }).eq("id", custom_id).execute()
                generated += 1
        else:
            errors += 1
            logger.warning("brief item failed", extra={"custom_id": custom_id, "result_type": result.get("type")})

    logger.info(
        "batch complete",
        extra={"batch_id": batch_id, "generated": generated, "errors": errors, "cost_savings": "~50% vs sync"},
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate briefs via Anthropic Batch API (50% cheaper)")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--poll-interval", type=int, default=30, help="Segundos entre polls al batch status")
    args = parser.parse_args(argv)
    return asyncio.run(run(limit=args.limit, poll_interval=args.poll_interval))


if __name__ == "__main__":
    sys.exit(main())
