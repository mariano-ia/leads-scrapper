"""Smoke tests: el package se importa y la config valida."""

import pytest


def test_package_imports() -> None:
    import leads_scrapper

    assert leads_scrapper.__version__ == "0.1.0"


def test_config_raises_when_required_vars_missing() -> None:
    from pydantic import ValidationError

    from leads_scrapper.config import Settings

    with pytest.raises(ValidationError):
        Settings()  # type: ignore[call-arg]


def test_config_loads_when_required_vars_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    from leads_scrapper.config import Settings

    settings = Settings()  # type: ignore[call-arg]
    assert settings.next_public_supabase_url == "https://example.supabase.co"
    assert settings.supabase_service_role_key == "test-key"
    assert settings.anthropic_model == "claude-sonnet-4-6"
