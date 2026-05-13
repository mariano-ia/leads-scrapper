#!/usr/bin/env python3
"""Seed inicial de universe_master_versions v1.

Crea la primera versión del universo maestro con criterios Yacaré default.
Marca como is_active=true. Requiere super_admin user existente.

Uso:
    python scripts/seed_universe_master.py --created-by-email marianonoceti@gmail.com
"""

import argparse
import os
import sys

from leads_scrapper.clients.supabase_client import create_supabase_admin_client
from leads_scrapper.utils.logging import get_logger, setup_logging

logger = get_logger("seed_universe_master")

DEFAULT_CONFIG = {
    "location_country": "AR",
    "headcount_min": 10,
    "headcount_max": 500,
    "founded_year_min": 2005,
    "founded_year_max": None,
    # Sectores priorizados para Yacaré (PYMEs con potencial de adopción IA).
    # Estos son los nombres de "industry" de Apollo, pueden ajustarse después
    # del primer sync real cuando veamos qué devuelve Apollo.
    "industries": [
        "information technology and services",
        "marketing and advertising",
        "retail",
        "construction",
        "logistics and supply chain",
        "real estate",
        "food and beverages",
        "wholesale",
        "manufacturing",
        "professional services",
        "financial services",
        "education management",
        "health, wellness and fitness",
        "consumer goods",
        "automotive",
    ],
    "exclude_industries": ["defense", "tobacco", "gambling"],
    "keywords_any": [],
    "max_companies_target": 15000,
}


def main(argv: list[str] | None = None) -> int:
    setup_logging()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--created-by-email",
        default=os.environ.get("SUPER_ADMIN_EMAIL"),
        help="Email del super-admin que crea la versión (default: SUPER_ADMIN_EMAIL env)",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Si ya existe una versión activa, desactivarla y crear nueva",
    )
    args = parser.parse_args(argv)

    if not args.created_by_email:
        logger.error("Need --created-by-email or SUPER_ADMIN_EMAIL env")
        return 2

    supabase = create_supabase_admin_client()

    # 1. Resolver user_id
    users_resp = supabase.auth.admin.list_users()
    target = None
    for user in users_resp:
        if user.email == args.created_by_email:
            target = user
            break
    if target is None:
        logger.error("User not found", extra={"email": args.created_by_email})
        return 3

    # 2. Check existing active
    existing = (
        supabase.table("universe_master_versions")
        .select("*")
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if existing.data:
        if not args.replace:
            logger.error(
                "Active universe_master_versions already exists. Use --replace to swap.",
                extra={"existing_version_int": existing.data[0]["version_int"]},
            )
            return 4
        # Deactivate existing (transaction: deferred unique on is_active permite swap)
        from datetime import datetime, timezone

        supabase.table("universe_master_versions").update(
            {
                "is_active": False,
                "deactivated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", existing.data[0]["id"]).execute()
        new_version_int = existing.data[0]["version_int"] + 1
    else:
        new_version_int = 1

    # 3. Insert new version
    from datetime import datetime, timezone

    new_row = {
        "version_int": new_version_int,
        "config": DEFAULT_CONFIG,
        "created_by": target.id,
        "is_active": True,
        "activated_at": datetime.now(timezone.utc).isoformat(),
    }
    result = (
        supabase.table("universe_master_versions").insert(new_row).execute()
    )
    if not result.data:
        logger.error("Insert failed")
        return 5

    logger.info(
        "universe_master_versions seeded",
        extra={
            "version_int": new_version_int,
            "id": result.data[0]["id"],
            "config_summary": {
                "country": DEFAULT_CONFIG["location_country"],
                "headcount_range": f"{DEFAULT_CONFIG['headcount_min']}-{DEFAULT_CONFIG['headcount_max']}",
                "industries_count": len(DEFAULT_CONFIG["industries"]),
            },
        },
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
