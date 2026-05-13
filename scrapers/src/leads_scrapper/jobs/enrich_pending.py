"""Enriquecimiento automático de companies que cumplen criterio de fit.

Estrategia: gastamos créditos Apollo enrichment solo en empresas que valen.
Criterio default (configurable via env):
  - dominio IS NOT NULL          (sin dominio, Apollo enrich casi no funciona)
  - growth_12m > 5%              (empresa con momentum)
  - organization_revenue > $1M   (descarta freelancers y empresas chicas)
  - sector IS NULL               (todavía no enriquecida)

Para cada empresa que matchea: llama Apollo /organizations/enrich (1 crédito),
actualiza columnas (sector, subsector, headcount_range, city, state, technologies).

Invocación:
  python -m leads_scrapper.jobs.enrich_pending [--limit N] [--min-growth 0.05] [--dry-run]
"""

import argparse
import asyncio
import sys
from datetime import datetime, timezone

from leads_scrapper.clients.apollo import ApolloBudgetExceeded, ApolloClient
from leads_scrapper.clients.supabase_client import create_supabase_admin_client
from leads_scrapper.config import get_settings
from leads_scrapper.repositories.companies_repo import update_company_with_enrichment
from leads_scrapper.utils.logging import get_logger, setup_logging

logger = get_logger("enrich_pending")


async def run(
    *,
    limit: int = 100,
    min_growth: float = 0.05,
    min_revenue: float = 1_000_000.0,
    dry_run: bool = False,
) -> int:
    setup_logging()
    settings = get_settings()
    supabase = create_supabase_admin_client()

    if not settings.apollo_api_key:
        logger.error("APOLLO_API_KEY not set")
        return 2

    # Empresas elegibles
    query = (
        supabase.table("companies")
        .select("id, razon_social, dominio, organization_headcount_twelve_month_growth, organization_revenue")
        .eq("status", "active")
        .is_("sector", "null")  # solo no enriquecidas
        .not_.is_("dominio", "null")
        .gt("organization_headcount_twelve_month_growth", min_growth)
        .gt("organization_revenue", min_revenue)
        .order("organization_headcount_twelve_month_growth", desc=True)
        .limit(limit)
    )
    candidates = query.execute().data or []

    logger.info(
        "enrichment candidates found",
        extra={
            "n_candidates": len(candidates),
            "min_growth": min_growth,
            "min_revenue": min_revenue,
            "limit": limit,
            "dry_run": dry_run,
        },
    )

    if dry_run:
        for c in candidates[:10]:
            logger.info(
                "would enrich",
                extra={
                    "id": c["id"],
                    "razon_social": c["razon_social"],
                    "dominio": c["dominio"],
                    "growth_12m": c["organization_headcount_twelve_month_growth"],
                    "revenue": c["organization_revenue"],
                },
            )
        return 0

    apollo = ApolloClient(api_key=settings.apollo_api_key, supabase=supabase)

    enriched_count = 0
    not_found_count = 0
    errors: list[dict] = []

    for c in candidates:
        try:
            enriched = await apollo.enrich_organization(domain=c["dominio"])
        except ApolloBudgetExceeded as e:
            logger.error("budget exceeded, stopping enrichment loop", extra={"reason": str(e)})
            break
        except Exception as e:
            errors.append({"id": c["id"], "error": str(e)})
            logger.exception("enrich failed", extra={"id": c["id"]})
            continue

        if not enriched:
            not_found_count += 1
            logger.info("apollo enrich not found", extra={"id": c["id"], "dominio": c["dominio"]})
            continue

        try:
            await update_company_with_enrichment(supabase, c["id"], enriched)
            enriched_count += 1
            logger.info(
                "enriched",
                extra={
                    "id": c["id"],
                    "razon_social": c["razon_social"],
                    "industry": enriched.industry,
                    "estimated_num_employees": enriched.estimated_num_employees,
                    "city": enriched.city,
                },
            )
        except Exception as e:
            errors.append({"id": c["id"], "error": str(e)})
            logger.exception("update failed", extra={"id": c["id"]})

    logger.info(
        "enrichment complete",
        extra={
            "enriched": enriched_count,
            "not_found": not_found_count,
            "errors": len(errors),
            "credits_estimated": enriched_count,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Enriquecer empresas que cumplen criterio fit")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--min-growth", type=float, default=0.05, help="Crecimiento 12m mínimo (0.05 = 5%)")
    parser.add_argument("--min-revenue", type=float, default=1_000_000.0, help="Revenue USD mínimo")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    return asyncio.run(run(
        limit=args.limit,
        min_growth=args.min_growth,
        min_revenue=args.min_revenue,
        dry_run=args.dry_run,
    ))


if __name__ == "__main__":
    sys.exit(main())
