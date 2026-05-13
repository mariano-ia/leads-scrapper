"""Pytest fixtures compartidos."""

import pytest


@pytest.fixture(autouse=True)
def isolate_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Limpia env vars que podrían contaminar tests."""
    for var in [
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "APOLLO_API_KEY",
        "ANTHROPIC_API_KEY",
        "RESEND_API_KEY",
    ]:
        monkeypatch.delenv(var, raising=False)
