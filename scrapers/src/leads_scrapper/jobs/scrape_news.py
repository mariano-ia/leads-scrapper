"""Job: scrape Google News por empresa + materializa signals.

Target: empresas con mayor probabilidad de noticias relevantes:
  1. Todas las del radar (org_companies) — prioritarias.
  2. Top N empresas del universo por growth_12m descendente (descubrimiento).

Dedup: signals existentes con la misma URL no se reinsertan.

Invocación:
  python -m leads_scrapper.jobs.scrape_news [--radar-only] [--top-growth N] [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from typing import Any

from leads_scrapper.clients.supabase_client import create_supabase_admin_client
from leads_scrapper.scrapers.google_news import fetch_news_batch
from leads_scrapper.utils.logging import get_logger, setup_logging

logger = get_logger("scrape_news")

DEFAULT_HALF_LIFE_DAYS = 60  # noticias decaen rápido — relevancia ~2 meses


def _load_radar_companies(supabase) -> list[dict[str, Any]]:
    """Toma todas las companies en el radar de cualquier org."""
    resp = (
        supabase.table("org_companies")
        .select("company_id, companies(id, razon_social, dominio)")
        .execute()
    )
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in resp.data or []:
        c = row.get("companies")
        if not c or c["id"] in seen:
            continue
        seen.add(c["id"])
        out.append({"id": c["id"], "razon_social": c["razon_social"], "dominio": c.get("dominio")})
    return out


def _load_top_growth_companies(supabase, limit: int) -> list[dict[str, Any]]:
    """Top empresas activas por growth 12m descendente."""
    resp = (
        supabase.table("companies")
        .select("id, razon_social, dominio")
        .eq("status", "active")
        .not_.is_("organization_headcount_twelve_month_growth", "null")
        .order("organization_headcount_twelve_month_growth", desc=True)
        .limit(limit)
        .execute()
    )
    return [
        {"id": r["id"], "razon_social": r["razon_social"], "dominio": r.get("dominio")}
        for r in (resp.data or [])
    ]


def _existing_urls_for(supabase, company_ids: list[str]) -> set[str]:
    """URLs ya guardadas como signals — para dedup."""
    if not company_ids:
        return set()
    resp = (
        supabase.table("signals")
        .select("data->>url")
        .in_("company_id", company_ids)
        .eq("type", "press_mention")
        .execute()
    )
    return {r["url"] for r in (resp.data or []) if r.get("url")}


def _insert_signal(supabase, company_id: str, item: dict[str, Any]) -> bool:
    try:
        supabase.table("signals").insert({
            "company_id": company_id,
            "type": "press_mention",
            "source": item.get("source_name") or "google_news",
            "occurred_at": item["occurred_at"],
            "data": {
                "title": item["title"],
                "url": item["url"],
                "summary": item["summary"],
                "category": item["category"],
            },
            "intent_weight": item["intent_weight"],
            "decay_half_life_days": DEFAULT_HALF_LIFE_DAYS,
        }).execute()
        return True
    except Exception as e:
        logger.warning("signal insert failed", extra={"company_id": company_id, "err": str(e)})
        return False


async def run(
    *,
    radar_only: bool = False,
    top_growth: int = 50,
    per_company_max: int = 5,
    concurrency: int = 5,
    dry_run: bool = False,
) -> int:
    setup_logging()
    supabase = create_supabase_admin_client()

    # Run row
    run_row = {
        "source": "google_news",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running",
    }
    run_id = None
    if not dry_run:
        try:
            r = supabase.table("scrape_runs").insert(run_row).execute()
            run_id = r.data[0]["id"] if r.data else None
        except Exception as e:
            logger.warning("scrape_runs insert failed (continuando)", extra={"err": str(e)})

    # Targets
    radar = _load_radar_companies(supabase)
    targets = list(radar)
    seen_ids = {c["id"] for c in targets}
    if not radar_only:
        for c in _load_top_growth_companies(supabase, top_growth):
            if c["id"] not in seen_ids:
                targets.append(c)
                seen_ids.add(c["id"])

    if not targets:
        logger.warning("no targets to scrape")
        return 0

    logger.info(
        "starting google news scrape",
        extra={"targets": len(targets), "radar_count": len(radar), "dry_run": dry_run},
    )

    company_ids = [c["id"] for c in targets]
    existing_urls = _existing_urls_for(supabase, company_ids)

    results = await fetch_news_batch(
        targets, concurrency=concurrency, per_company_max=per_company_max
    )

    total_items = 0
    dedup_skips = 0
    signals_inserted = 0
    errors: list[dict[str, str]] = []

    for company_id, items in results.items():
        for it in items:
            total_items += 1
            if it["url"] in existing_urls:
                dedup_skips += 1
                continue
            if dry_run:
                continue
            if _insert_signal(supabase, company_id, it):
                signals_inserted += 1
                existing_urls.add(it["url"])
            else:
                errors.append({"company_id": company_id, "url": it["url"]})

    logger.info(
        "google news scrape complete",
        extra={
            "total_items": total_items,
            "dedup_skips": dedup_skips,
            "signals_inserted": signals_inserted,
            "errors": len(errors),
            "dry_run": dry_run,
        },
    )

    if run_id and not dry_run:
        try:
            supabase.table("scrape_runs").update({
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "status": "completed",
                "items_scraped": total_items,
                "signals_inserted": signals_inserted,
                "companies_matched": len([k for k, v in results.items() if v]),
                "items_unmatched": dedup_skips,
                "errors": errors[:50],
            }).eq("id", run_id).execute()
        except Exception as e:
            logger.warning("scrape_runs update failed", extra={"err": str(e)})

    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scrape Google News por empresa")
    parser.add_argument("--radar-only", action="store_true", help="Solo empresas del radar (sin top growth)")
    parser.add_argument("--top-growth", type=int, default=50, help="N top growth companies (extra al radar)")
    parser.add_argument("--per-company-max", type=int, default=5)
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    return asyncio.run(
        run(
            radar_only=args.radar_only,
            top_growth=args.top_growth,
            per_company_max=args.per_company_max,
            concurrency=args.concurrency,
            dry_run=args.dry_run,
        )
    )


if __name__ == "__main__":
    sys.exit(main())
