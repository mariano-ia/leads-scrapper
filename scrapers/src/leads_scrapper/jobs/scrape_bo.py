"""Job: scrape Boletín Oficial Nacional Sección Segunda + match a companies.

Para cada aviso parseado:
- Match por CUIT primero, fallback fuzzy razon_social
- Si match: INSERT signal type=bo_act
- Si no match: UPSERT candidate_companies (banco para futuro)

Invocación (cron diario):
  python -m leads_scrapper.jobs.scrape_bo [--date YYYY-MM-DD] [--dry-run]
"""

import argparse
import asyncio
import sys
from datetime import date, datetime, timedelta, timezone

from leads_scrapper.clients.supabase_client import create_supabase_admin_client
from leads_scrapper.scrapers.bo_nacional import scrape_bo_nacional
from leads_scrapper.utils.logging import get_logger, setup_logging

logger = get_logger("scrape_bo")


# Intent weights por tipo de acto. Override-able vía signal_type_config table.
DEFAULT_WEIGHTS = {
    "ampliacion_capital": 20.0,
    "fusion": 25.0,
    "escision": 15.0,
    "cambio_objeto": 15.0,
    "transformacion": 10.0,
    "constitucion": 5.0,    # empresa nueva, baja prioridad para Yacaré target
    "disolucion": 0.0,
}
DEFAULT_HALF_LIFE_DAYS = 180


def _match_company_by_cuit(supabase, cuit: str):
    if not cuit or len(cuit) < 11:
        return None
    result = supabase.table("companies").select("id, razon_social").eq("cuit", cuit).limit(1).execute()
    return (result.data or [None])[0]


def _match_company_by_name(supabase, name: str):
    """Fuzzy match por razon_social con pg_trgm similarity."""
    if not name or len(name) < 6:
        return None
    result = (
        supabase.rpc("companies_fuzzy_by_name", {"q": name, "threshold": 0.6})
        .execute()
    )
    if hasattr(result, "data") and result.data:
        return result.data[0]
    return None


def _upsert_candidate(supabase, aviso: dict, source: str):
    cuit = aviso.get("cuit")
    if not cuit:
        return
    name = aviso.get("title") or "?"
    # Buscar existente
    existing = supabase.table("candidate_companies").select("id, detection_count").eq("cuit", cuit).limit(1).execute()
    if existing.data:
        cid = existing.data[0]["id"]
        new_count = int(existing.data[0]["detection_count"]) + 1
        supabase.table("candidate_companies").update({
            "detection_count": new_count,
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", cid).execute()
    else:
        supabase.table("candidate_companies").insert({
            "cuit": cuit,
            "razon_social": name[:200],
            "source": source,
            "source_data": aviso,
        }).execute()


def _insert_signal(supabase, company_id: str, aviso: dict, source: str = "bo_nacional"):
    act_type = aviso.get("act_type") or "constitucion"
    weight = DEFAULT_WEIGHTS.get(act_type, 5.0)
    if weight <= 0:
        return  # acto sin valor (disolución)
    supabase.table("signals").insert({
        "company_id": company_id,
        "type": "bo_act",
        "source": source,
        "occurred_at": datetime.now(timezone.utc).isoformat(),  # idealmente la fecha del aviso, parseo limitado
        "data": {
            "act_type": act_type,
            "title": aviso.get("title"),
            "url": aviso.get("url"),
            "capital": aviso.get("capital"),
            "summary": aviso.get("summary"),
        },
        "intent_weight": weight,
        "decay_half_life_days": DEFAULT_HALF_LIFE_DAYS,
    }).execute()


async def run(*, date_str: str | None = None, dry_run: bool = False) -> int:
    setup_logging()
    supabase = create_supabase_admin_client()

    if date_str is None:
        date_str = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")

    run_row = {
        "source": "bo_nacional",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running",
    }
    if dry_run:
        run_id = None
    else:
        r = supabase.table("scrape_runs").insert(run_row).execute()
        run_id = r.data[0]["id"]

    logger.info("starting BO scrape", extra={"date": date_str, "dry_run": dry_run})

    try:
        avisos = await scrape_bo_nacional(date_str=date_str)
    except Exception as e:
        logger.exception("BO fetch failed", extra={"err": str(e)})
        if run_id:
            supabase.table("scrape_runs").update({
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "status": "failed",
                "errors": [{"fatal": str(e)}],
            }).eq("id", run_id).execute()
        return 1

    matched = 0
    unmatched = 0
    signals_inserted = 0

    for aviso in avisos:
        cuit = aviso.get("cuit")
        company = _match_company_by_cuit(supabase, cuit) if cuit else None
        if company is None:
            # Skip fuzzy match for now — pg_trgm RPC requires custom function. F0.5 task.
            unmatched += 1
            if not dry_run and cuit:
                _upsert_candidate(supabase, aviso, source="bo_nacional")
            continue

        matched += 1
        if not dry_run:
            try:
                _insert_signal(supabase, company["id"], aviso)
                signals_inserted += 1
            except Exception as e:
                logger.exception("signal insert failed", extra={"company_id": company["id"], "err": str(e)})

    logger.info(
        "BO scrape complete",
        extra={
            "avisos_scraped": len(avisos),
            "matched": matched,
            "unmatched": unmatched,
            "signals_inserted": signals_inserted,
            "dry_run": dry_run,
        },
    )

    if run_id:
        supabase.table("scrape_runs").update({
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "status": "completed",
            "items_scraped": len(avisos),
            "signals_inserted": signals_inserted,
            "companies_matched": matched,
            "items_unmatched": unmatched,
        }).eq("id", run_id).execute()

    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Fecha YYYY-MM-DD (default ayer)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    return asyncio.run(run(date_str=args.date, dry_run=args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
