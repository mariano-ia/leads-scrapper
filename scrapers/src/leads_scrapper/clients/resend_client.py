"""Resend email API wrapper.

Implementación completa en Week 7.
"""

from typing import Any


class ResendEmailClient:
    """Wrapper para envíos transaccionales."""

    def __init__(
        self,
        api_key: str,
        from_email: str,
        from_name: str,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.from_email = from_email
        self.from_name = from_name

    async def send_alert_email(
        self,
        to: str,
        subject: str,
        html_body: str,
    ) -> dict[str, Any]:
        raise NotImplementedError("Implemented in Week 7 plan")
