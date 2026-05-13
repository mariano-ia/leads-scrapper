"""Test email rápido: manda un email de verificación a un destinatario.

Uso:
    python -m leads_scrapper.jobs.test_email --to vos@yacare.io
"""

import argparse
import asyncio
import sys

from leads_scrapper.clients.resend_client import ResendEmailClient
from leads_scrapper.config import get_settings
from leads_scrapper.utils.logging import get_logger, setup_logging

logger = get_logger("test_email")


async def run(to: str) -> int:
    setup_logging()
    settings = get_settings()
    if not settings.resend_api_key or not settings.resend_from_email:
        logger.error("RESEND_API_KEY y RESEND_FROM_EMAIL son requeridos")
        return 2

    resend = ResendEmailClient(
        api_key=settings.resend_api_key,
        from_email=settings.resend_from_email,
        from_name=settings.resend_from_name or "Leads Yacaré",
    )

    html = """<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin-bottom:8px">Leads Scrapper · Test email</h2>
  <p style="color:#666;font-size:14px;margin-top:0">Si recibís este mensaje, Resend está funcionando.</p>
  <p style="margin-top:16px">Dominio verificado, API key activa, alertas listas para empezar a llegar cuando un lead matchee tus searches.</p>
  <hr style="border:0;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">Yacaré · Leads Scrapper F0 · 2026</p>
</body></html>"""

    try:
        result = await resend.send_email(
            to=to,
            subject="Test · Leads Scrapper",
            html=html,
        )
        logger.info("email sent", extra={"resend_id": result.get("id"), "to": to})
        print(f"OK · resend_id={result.get('id')}")
        return 0
    except Exception as e:
        logger.exception("send failed")
        print(f"FAIL · {e}")
        return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--to", required=True, help="Email destinatario")
    args = parser.parse_args(argv)
    return asyncio.run(run(args.to))


if __name__ == "__main__":
    sys.exit(main())
