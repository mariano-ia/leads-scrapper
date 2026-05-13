#!/usr/bin/env python3
"""Seed inicial: marca un user de Supabase Auth como super_admin.

Prerequisito: el user debe existir en `auth.users` (crear via Supabase dashboard
o registrarse en la web app primero).

Uso:
    python scripts/seed_super_admin.py --email marianonoceti@gmail.com
    python scripts/seed_super_admin.py  # usa SUPER_ADMIN_EMAIL del .env
"""

import argparse
import os
import sys

from leads_scrapper.clients.supabase_client import create_supabase_admin_client
from leads_scrapper.utils.logging import get_logger, setup_logging

logger = get_logger("seed_super_admin")


def main(argv: list[str] | None = None) -> int:
    setup_logging()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--email",
        default=os.environ.get("SUPER_ADMIN_EMAIL"),
        help="Email del user a marcar como super_admin (default: SUPER_ADMIN_EMAIL env)",
    )
    args = parser.parse_args(argv)

    if not args.email:
        logger.error("Need --email or SUPER_ADMIN_EMAIL env")
        return 2

    supabase = create_supabase_admin_client()

    # 1. Buscar user en auth.users por email
    # supabase-py expone auth.admin para esto
    users_resp = supabase.auth.admin.list_users()
    target = None
    for user in users_resp:
        if user.email == args.email:
            target = user
            break

    if target is None:
        logger.error(
            "User not found in auth.users. Create the user first via Supabase "
            "dashboard or the app's /signup flow.",
            extra={"email": args.email},
        )
        return 3

    logger.info(
        "Found user, granting super_admin",
        extra={"email": args.email, "user_id": target.id},
    )

    # 2. INSERT INTO super_admins ON CONFLICT DO NOTHING
    try:
        supabase.table("super_admins").upsert(
            {"user_id": target.id},
            on_conflict="user_id",
        ).execute()
    except Exception as e:
        logger.exception("Failed to insert super_admin")
        return 4

    logger.info("super_admin granted", extra={"email": args.email})
    return 0


if __name__ == "__main__":
    sys.exit(main())
