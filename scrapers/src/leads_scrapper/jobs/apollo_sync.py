"""Apollo sync job — orquesta el pull del universo de Apollo al DB.

Modos:
- initial: full pull (sin filtro de last_updated_at). Usado una sola vez al setear.
- delta:   solo empresas con cambios últimos 7 días.
- targeted_contacts: refresca contactos de empresas que están en org_companies.

Invocación:
    python -m leads_scrapper.jobs.apollo_sync --mode initial [--dry-run]
"""

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from typing import Any

from leads_scrapper.clients.apollo import ApolloBudgetExceeded, ApolloClient
from leads_scrapper.clients.supabase_client import create_supabase_admin_client
from leads_scrapper.config import get_settings
from leads_scrapper.models.apollo import AccountSearchFilters
from leads_scrapper.repositories.companies_repo import upsert_company
from leads_scrapper.utils.logging import get_logger, setup_logging

logger = get_logger("apollo_sync")


def _load_active_universe_master(supabase) -> dict[str, Any] | None:  # noqa: ANN001
    """Carga la versión activa del universe maestro."""
    resp = (
        supabase.table("universe_master_versions")
        .select("*")
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not resp.data:
        return None
    return resp.data[0]


def _config_to_filters(config: dict[str, Any]) -> AccountSearchFilters:
    """Mapea universe_master_versions.config → AccountSearchFilters."""
    return AccountSearchFilters(
        organization_locations=[
            config.get("location_country", "Argentina") or "Argentina"
        ],
        organization_num_employees_ranges=_employees_ranges_from_config(config),
        q_organization_keyword_tags=config.get("keywords_any") or [],
        founded_year_min=config.get("founded_year_min"),
        founded_year_max=config.get("founded_year_max"),
        per_page=100,
    )


def _employees_ranges_from_config(config: dict[str, Any]) -> list[str]:
    """Convierte headcount_min/max a la lista de ranges que espera Apollo."""
    h_min = config.get("headcount_min")
    h_max = config.get("headcount_max")
    if h_min is None and h_max is None:
        return []
    # Apollo acepta ranges discretos. Hacemos best-effort.
    ranges = ["1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000", "1001,5000", "5001,10000", "10001,1000000"]
    selected = []
    for r in ranges:
        lo, hi = (int(x) for x in r.split(","))
        if (h_min is None or hi >= h_min) and (h_max is None or lo <= h_max):
            selected.append(r)
    return selected


async def run_sync(mode: str, dry_run: bool = False) -> int:
    setup_logging()
    settings = get_settings()
    supabase = create_supabase_admin_client()

    if not settings.apollo_api_key:
        logger.error("APOLLO_API_KEY not set")
        return 2

    master = _load_active_universe_master(supabase)
    if master is None:
        logger.error(
            "No active universe_master_versions row. "
            "Run seed_universe_master.py first."
        )
        return 3

    logger.info(
        "starting apollo sync",
        extra={
            "mode": mode,
            "master_version_id": master["id"],
            "master_version_int": master["version_int"],
            "dry_run": dry_run,
        },
    )

    # 1. Insert apollo_sync_runs (status='running')
    run_row = {
        "mode": mode,
        "master_version_id": master["id"],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running",
    }
    if dry_run:
        logger.info("dry_run: skipping apollo_sync_runs insert", extra=run_row)
        run_id = None
    else:
        run_resp = supabase.table("apollo_sync_runs").insert(run_row).execute()
        run_id = run_resp.data[0]["id"]
        logger.info("created apollo_sync_runs row", extra={"run_id": run_id})

    # 2. Build filters from config and run search
    config = master["config"]
    filters = _config_to_filters(config)

    apollo = ApolloClient(api_key=settings.apollo_api_key, supabase=supabase)

    companies_added = 0
    companies_updated = 0
    errors: list[dict[str, str]] = []
    accounts_batch = []
    BATCH_SIZE = 50

    try:
        async for account in apollo.search_accounts(filters):
            accounts_batch.append(account)
            if len(accounts_batch) >= BATCH_SIZE:
                if dry_run:
                    logger.info(
                        "dry_run: would upsert batch",
                        extra={"batch_size": len(accounts_batch)},
                    )
                else:
                    for acc in accounts_batch:
                        try:
                            await upsert_company(supabase, acc)
                            companies_added += 1
                        except Exception as e:
                            errors.append({"apollo_id": acc.id, "error": str(e)})
                accounts_batch = []
        # flush remaining
        if accounts_batch:
            if dry_run:
                logger.info(
                    "dry_run: would upsert final batch",
                    extra={"batch_size": len(accounts_batch)},
                )
            else:
                for acc in accounts_batch:
                    try:
                        await upsert_company(supabase, acc)
                        companies_added += 1
                    except Exception as e:
                        errors.append({"apollo_id": acc.id, "error": str(e)})

    except ApolloBudgetExceeded as e:
        logger.error("apollo budget exceeded, aborting", extra={"reason": str(e)})
        if run_id and not dry_run:
            supabase.table("apollo_sync_runs").update(
                {
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "status": "aborted",
                    "companies_added": companies_added,
                    "errors": errors,
                    "aborted_reason": "budget_exceeded",
                }
            ).eq("id", run_id).execute()
        return 4
    except Exception as e:
        logger.exception("apollo sync failed unexpectedly")
        if run_id and not dry_run:
            supabase.table("apollo_sync_runs").update(
                {
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "status": "failed",
                    "companies_added": companies_added,
                    "errors": [*errors, {"fatal": str(e)}],
                }
            ).eq("id", run_id).execute()
        return 5

    # 3. Finalize run
    if run_id and not dry_run:
        supabase.table("apollo_sync_runs").update(
            {
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "status": "completed",
                "companies_added": companies_added,
                "companies_updated": companies_updated,
                "errors": errors,
            }
        ).eq("id", run_id).execute()

    logger.info(
        "apollo sync completed",
        extra={
            "companies_added": companies_added,
            "errors": len(errors),
            "dry_run": dry_run,
        },
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Apollo sync job")
    parser.add_argument(
        "--mode",
        choices=["initial", "delta", "targeted_contacts"],
        default="delta",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="No escribe en DB, solo loguea lo que haría",
    )
    args = parser.parse_args(argv)

    return asyncio.run(run_sync(args.mode, dry_run=args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
