"""Tests que validan que los stubs de clients existen e importan limpios."""

import pytest


def test_apollo_client_importable() -> None:
    from leads_scrapper.clients.apollo import ApolloClient

    assert ApolloClient is not None


def test_apollo_client_requires_api_key() -> None:
    from leads_scrapper.clients.apollo import ApolloClient

    with pytest.raises(ValueError, match="api_key"):
        ApolloClient(api_key="")


def test_anthropic_client_importable() -> None:
    from leads_scrapper.clients.anthropic_client import AnthropicLLMClient

    assert AnthropicLLMClient is not None


def test_resend_client_importable() -> None:
    from leads_scrapper.clients.resend_client import ResendEmailClient

    assert ResendEmailClient is not None


def test_supabase_client_importable() -> None:
    from leads_scrapper.clients.supabase_client import create_supabase_admin_client

    assert callable(create_supabase_admin_client)
