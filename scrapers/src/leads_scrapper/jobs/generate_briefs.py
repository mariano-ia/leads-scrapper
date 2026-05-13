"""Genera AI briefs para empresas enriquecidas que todavía no tienen brief.

Costo: ~$0.005 por brief con claude-sonnet-4-6 + prompt caching.
Para 500 empresas → ~$2.5 (negligible vs presupuesto Anthropic ~$10/mes).

Invocación:
  python -m leads_scrapper.jobs.generate_briefs [--limit N] [--regenerate-older-than-days N]
"""

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone

from leads_scrapper.clients.anthropic_client import AnthropicLLMClient
from leads_scrapper.clients.supabase_client import create_supabase_admin_client
from leads_scrapper.config import get_settings
from leads_scrapper.utils.logging import get_logger, setup_logging

logger = get_logger("generate_briefs")


async def run(*, limit: int = 50, regenerate_older_than_days: int | None = None) -> int:
    setup_logging()
    settings = get_settings()
    supabase = create_supabase_admin_client()

    if not settings.anthropic_api_key:
        logger.error("ANTHROPIC_API_KEY not set")
        return 2

    # Candidates:
    #   - status='active'
    #   - sector NOT NULL (= ya enriquecidas, tienen suficiente data)
    #   - ai_brief IS NULL  o  ai_brief_generated_at más viejo que threshold
    query = (
        supabase.table("companies")
        .select("id, razon_social, sector, subsector, headcount_range, founded_year, location_ciudad, location_provincia, location_pais, dominio, organization_revenue_printed, organization_headcount_twelve_month_growth, organization_headcount_twenty_four_month_growth, tech_stack, intent_strength, ai_brief, ai_brief_generated_at")
        .eq("status", "active")
        .not_.is_("sector", "null")
    )

    if regenerate_older_than_days is None:
        query = query.is_("ai_brief", "null")
    else:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=regenerate_older_than_days)).isoformat()
        query = query.or_(f"ai_brief.is.null,ai_brief_generated_at.lt.{cutoff}")

    query = query.limit(limit)
    candidates = query.execute().data or []

    logger.info(
        "brief candidates",
        extra={"n": len(candidates), "limit": limit, "regenerate_older_than_days": regenerate_older_than_days},
    )

    if not candidates:
        return 0

    llm = AnthropicLLMClient(api_key=settings.anthropic_api_key, model=settings.anthropic_model)

    generated = 0
    errors: list[dict] = []

    for c in candidates:
        try:
            # Pull signals + contacts asociados (best-effort)
            signals = (
                supabase.table("signals")
                .select("type, source, occurred_at, data")
                .eq("company_id", c["id"])
                .order("occurred_at", desc=True)
                .limit(10)
                .execute()
                .data
                or []
            )
            contacts = (
                supabase.table("company_contacts")
                .select("full_name, title, email, is_decision_maker")
                .eq("company_id", c["id"])
                .limit(5)
                .execute()
                .data
                or []
            )

            brief = await llm.generate_brief(c, signals=signals, contacts=contacts)

            supabase.table("companies").update({
                "ai_brief": brief,
                "ai_brief_generated_at": datetime.now(timezone.utc).isoformat(),
                "ai_brief_model": settings.anthropic_model,
            }).eq("id", c["id"]).execute()

            generated += 1
            logger.info("brief generated", extra={"id": c["id"], "razon_social": c["razon_social"]})

        except Exception as e:
            errors.append({"id": c["id"], "error": str(e)})
            logger.exception("brief failed", extra={"id": c["id"]})

    logger.info("complete", extra={"generated": generated, "errors": len(errors)})
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument(
        "--regenerate-older-than-days",
        type=int,
        default=None,
        help="Si pasa, también regenera briefs con esta antigüedad o más",
    )
    args = parser.parse_args(argv)
    return asyncio.run(run(limit=args.limit, regenerate_older_than_days=args.regenerate_older_than_days))


if __name__ == "__main__":
    sys.exit(main())
