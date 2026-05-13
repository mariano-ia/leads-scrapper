"""Resend email API wrapper.

API docs: https://resend.com/docs/api-reference/emails/send-email
"""

from typing import Any

import httpx

RESEND_API_URL = "https://api.resend.com"


class ResendEmailClient:
    """Wrapper async para enviar emails transaccionales."""

    def __init__(
        self,
        api_key: str,
        from_email: str,
        from_name: str = "Leads Yacaré",
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.from_email = from_email
        self.from_name = from_name

    async def send_email(
        self,
        *,
        to: str | list[str],
        subject: str,
        html: str,
        text: str | None = None,
        reply_to: str | None = None,
    ) -> dict[str, Any]:
        """POST /emails. Devuelve {id, ...} con el resend_id de tracking."""
        recipients = [to] if isinstance(to, str) else to
        payload: dict[str, Any] = {
            "from": f"{self.from_name} <{self.from_email}>",
            "to": recipients,
            "subject": subject,
            "html": html,
        }
        if text:
            payload["text"] = text
        if reply_to:
            payload["reply_to"] = reply_to

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{RESEND_API_URL}/emails",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            return response.json()
