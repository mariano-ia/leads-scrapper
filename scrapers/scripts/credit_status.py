#!/usr/bin/env python3
"""Imprime el estado actual de créditos Apollo.

Uso:
    python scripts/credit_status.py
    python scripts/credit_status.py --json
"""

import argparse
import asyncio
import json
import sys

from leads_scrapper.clients.apollo import ApolloClient
from leads_scrapper.clients.supabase_client import create_supabase_admin_client
from leads_scrapper.config import get_settings
from leads_scrapper.utils.logging import setup_logging


async def get_status(probe_apollo: bool = True) -> dict:
    settings = get_settings()
    supabase = create_supabase_admin_client()

    # Local view
    view = supabase.table("apollo_credit_summary").select("*").execute()
    summary = view.data[0] if view.data else {}

    # Apollo healthcheck (best-effort, 0 créditos)
    apollo_health: dict = {}
    if probe_apollo and settings.apollo_api_key:
        try:
            apollo = ApolloClient(api_key=settings.apollo_api_key)
            apollo_health = await apollo.healthcheck()
        except Exception as e:
            apollo_health = {"error": str(e)}

    return {"summary": summary, "apollo_health": apollo_health}


def _format_pretty(status: dict) -> str:
    s = status["summary"]
    h = status["apollo_health"]
    if not s:
        return "❌ No apollo_budget_config row found. Run migration 0007."

    used = s.get("credits_used", 0)
    budget = s.get("monthly_budget_credits", 0)
    remaining = s.get("credits_remaining", 0)
    pct = s.get("pct_used", 0)
    bar_filled = int(pct / 5)
    bar = "█" * bar_filled + "░" * (20 - bar_filled)

    lines = [
        f"┌─ Apollo · {s.get('apollo_plan_name', '?')} (${s.get('apollo_plan_monthly_usd', '?')}/mes)",
        f"│  {s.get('year_month', '')}",
        f"│",
        f"│  Créditos: {used}/{budget}  ·  Restantes: {remaining}",
        f"│  [{bar}] {pct:.1f}%",
        f"│",
        f"│  Thresholds: {s.get('alert_thresholds_pct')}  ·  Hard stop: {s.get('hard_stop_pct')}%",
        f"│  Último sync: {s.get('last_sync_at') or 'nunca'}",
        f"│",
        f"│  Apollo health: {h.get('healthy', '?')}  ·  logged_in: {h.get('is_logged_in', '?')}",
        f"└─",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument(
        "--no-apollo-probe", action="store_true",
        help="No llama a Apollo /auth/health (solo lee DB)",
    )
    args = parser.parse_args(argv)

    setup_logging()
    status = asyncio.run(get_status(probe_apollo=not args.no_apollo_probe))

    if args.json:
        print(json.dumps(status, indent=2, default=str))
    else:
        print(_format_pretty(status))
    return 0


if __name__ == "__main__":
    sys.exit(main())
