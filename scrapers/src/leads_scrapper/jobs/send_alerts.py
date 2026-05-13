"""Envía alerts por email para searches con alert_enabled=true.

Estrategia simple para F0:
- Para cada search activa con alert_enabled=true:
  - Encontrar org_companies nuevas (first_matched_at > now() - 24h)
    que aún no fueron alertadas
  - Si digest_mode=immediate: un email por empresa
  - Si digest_mode=daily: un email con todas
- Registrar cada envío en alert_dispatches

Invocación (cron diario):
  python -m leads_scrapper.jobs.send_alerts [--dry-run]
"""

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

from leads_scrapper.clients.resend_client import ResendEmailClient
from leads_scrapper.clients.supabase_client import create_supabase_admin_client
from leads_scrapper.config import get_settings
from leads_scrapper.utils.logging import get_logger, setup_logging

logger = get_logger("send_alerts")


def _format_company_for_email(c: dict[str, Any]) -> str:
    name = c.get("razon_social") or c.get("name") or "Sin nombre"
    domain = c.get("dominio")
    sector = c.get("sector")
    headcount = c.get("headcount_range")
    growth = c.get("organization_headcount_twelve_month_growth")
    brief = c.get("ai_brief")

    lines = [f"<h3 style='margin-bottom:4px'>{name}</h3>"]
    sub = []
    if sector:
        sub.append(sector)
    if headcount:
        sub.append(f"{headcount} empleados")
    if domain:
        sub.append(f'<a href="https://{domain}">{domain}</a>')
    if sub:
        lines.append(f"<div style='color:#666;font-size:14px;margin-bottom:8px'>{' · '.join(sub)}</div>")
    if growth is not None:
        sign = "+" if float(growth) >= 0 else ""
        color = "#16a34a" if float(growth) > 0 else "#dc2626"
        lines.append(f"<div style='color:{color};font-size:13px'>Growth 12m: {sign}{float(growth) * 100:.1f}%</div>")
    if brief:
        lines.append(f"<p style='margin-top:8px;line-height:1.5'>{brief}</p>")
    return "\n".join(lines)


def _render_digest_html(search_name: str, companies: list[dict[str, Any]], app_url: str, org_slug: str) -> str:
    items = "\n<hr style='border:0;border-top:1px solid #eee;margin:24px 0'>\n".join(
        _format_company_for_email(c) for c in companies
    )
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="margin-bottom:8px">Nuevos matches en "{search_name}"</h2>
  <p style="color:#666;font-size:14px;margin-top:0">{len(companies)} empresa{'s' if len(companies) != 1 else ''} entró al radar en las últimas 24h.</p>
  <div style="margin-top:24px">{items}</div>
  <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;color:#999;font-size:12px">
    <a href="{app_url}/{org_slug}/companies" style="color:#666">Ver todas en Leads Scrapper →</a>
  </div>
</body>
</html>"""


async def run(*, dry_run: bool = False) -> int:
    setup_logging()
    settings = get_settings()
    supabase = create_supabase_admin_client()

    if not settings.resend_api_key:
        logger.error("RESEND_API_KEY not set")
        return 2
    if not settings.resend_from_email:
        logger.error("RESEND_FROM_EMAIL not set")
        return 3

    # Buscar searches activas con alertas
    searches = (
        supabase.table("searches")
        .select("id, org_id, name, alert_enabled, alert_email, digest_mode, orgs(slug)")
        .eq("active", True)
        .eq("alert_enabled", True)
        .execute()
        .data
        or []
    )

    if not searches:
        logger.info("no searches con alertas activas")
        return 0

    resend = ResendEmailClient(
        api_key=settings.resend_api_key,
        from_email=settings.resend_from_email,
        from_name=settings.resend_from_name or "Leads Yacaré",
    )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    total_emails_sent = 0

    for s in searches:
        # Empresas que matchearon esta search en últimas 24h y no fueron alertadas
        # Get org_companies new in window
        new_matches = (
            supabase.table("org_companies")
            .select("id, company_id, first_matched_at, companies(razon_social, dominio, sector, headcount_range, organization_headcount_twelve_month_growth, ai_brief)")
            .eq("org_id", s["org_id"])
            .eq("last_search_id", s["id"])
            .gte("first_matched_at", cutoff)
            .execute()
            .data
            or []
        )

        if not new_matches:
            continue

        # Filter out org_companies already alerted for this search
        alerted = (
            supabase.table("alert_dispatches")
            .select("org_company_id")
            .eq("search_id", s["id"])
            .gte("sent_at", cutoff)
            .execute()
            .data
            or []
        )
        alerted_set = {a["org_company_id"] for a in alerted}
        new_unalerted = [m for m in new_matches if m["id"] not in alerted_set]

        if not new_unalerted:
            continue

        recipient = s.get("alert_email")
        if not recipient:
            logger.warning("search alert_enabled but no alert_email", extra={"search_id": s["id"]})
            continue

        # @ts-expect-error
        org_slug = (s.get("orgs") or {}).get("slug", "")  # type: ignore[union-attr]
        app_url = "http://localhost:3000"  # TODO: env var NEXT_PUBLIC_APP_URL

        companies_for_email = [
            {**m["companies"], "id": m["company_id"]} for m in new_unalerted
        ]
        html = _render_digest_html(s["name"], companies_for_email, app_url, org_slug)

        if dry_run:
            logger.info(
                "dry_run: would send",
                extra={
                    "search": s["name"],
                    "to": recipient,
                    "n_companies": len(new_unalerted),
                },
            )
            continue

        try:
            result = await resend.send_email(
                to=recipient,
                subject=f"Leads Scrapper · {len(new_unalerted)} match{'es' if len(new_unalerted) != 1 else ''} en {s['name']}",
                html=html,
            )
            total_emails_sent += 1

            # Registrar dispatches
            for m in new_unalerted:
                supabase.table("alert_dispatches").insert({
                    "org_id": s["org_id"],
                    "search_id": s["id"],
                    "org_company_id": m["id"],
                    "channel": "email",
                    "recipient": recipient,
                    "digest_mode": s.get("digest_mode", "immediate"),
                    "resend_id": result.get("id"),
                    "status": "sent",
                }).execute()

            logger.info(
                "email sent",
                extra={
                    "search": s["name"],
                    "to": recipient,
                    "n_companies": len(new_unalerted),
                    "resend_id": result.get("id"),
                },
            )

        except Exception as e:
            logger.exception("email send failed", extra={"search_id": s["id"], "err": str(e)})

    logger.info("complete", extra={"emails_sent": total_emails_sent})
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    return asyncio.run(run(dry_run=args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
