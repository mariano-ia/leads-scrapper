"""Tests para ApolloClient con respx mocking."""

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
import respx

APOLLO_BASE = "https://api.apollo.io/api/v1"


def _ok_supabase_mock() -> MagicMock:
    """Mock de Supabase que siempre devuelve PROCEED budget."""
    mock = MagicMock(name="supabase")

    def table_side_effect(name: str) -> MagicMock:
        t = MagicMock(name=f"table[{name}]")
        t.select.return_value = t
        t.eq.return_value = t
        t.limit.return_value = t
        t.insert.return_value = t
        t.update.return_value = t

        if name == "apollo_budget_config":
            t.execute.return_value = MagicMock(
                data=[
                    {
                        "monthly_budget_credits": 10000,
                        "alert_thresholds_pct": [70, 85, 95],
                        "hard_stop_pct": 100,
                    }
                ]
            )
        elif name == "apollo_credit_usage_monthly":
            t.execute.return_value = MagicMock(data=[{"credits_used": 0}])
        else:
            t.execute.return_value = MagicMock(data=[])
        return t

    mock.table.side_effect = table_side_effect
    return mock


def test_apollo_client_requires_api_key() -> None:
    from leads_scrapper.clients.apollo import ApolloClient

    with pytest.raises(ValueError, match="api_key"):
        ApolloClient(api_key="")


@respx.mock
async def test_search_accounts_paginates_and_yields_all() -> None:
    from leads_scrapper.clients.apollo import ApolloClient
    from leads_scrapper.models.apollo import AccountSearchFilters

    # Mock 2 páginas: page 1 con 2 accounts, page 2 con 1, total_pages=2
    respx.post(f"{APOLLO_BASE}/mixed_companies/search").mock(
        side_effect=[
            httpx.Response(
                200,
                json={
                    "accounts": [
                        {"id": "a1", "name": "Empresa A", "primary_domain": "a.com"},
                        {"id": "a2", "name": "Empresa B", "primary_domain": "b.com"},
                    ],
                    "pagination": {"page": 1, "total_pages": 2},
                },
            ),
            httpx.Response(
                200,
                json={
                    "accounts": [
                        {"id": "a3", "name": "Empresa C", "primary_domain": "c.com"},
                    ],
                    "pagination": {"page": 2, "total_pages": 2},
                },
            ),
        ]
    )

    client = ApolloClient(api_key="test-key", supabase=_ok_supabase_mock())
    accounts = []
    async for account in client.search_accounts(
        AccountSearchFilters(per_page=2)
    ):
        accounts.append(account)

    assert len(accounts) == 3
    assert {a.id for a in accounts} == {"a1", "a2", "a3"}
    assert accounts[0].primary_domain == "a.com"


@respx.mock
async def test_search_accounts_aborts_on_budget_exceeded() -> None:
    from leads_scrapper.clients.apollo import ApolloBudgetExceeded, ApolloClient
    from leads_scrapper.models.apollo import AccountSearchFilters

    # Supabase mock que devuelve ABORT
    supabase = MagicMock(name="supabase")

    def table_side_effect(name: str) -> MagicMock:
        t = MagicMock(name=f"table[{name}]")
        t.select.return_value = t
        t.eq.return_value = t
        t.limit.return_value = t
        t.insert.return_value = t

        if name == "apollo_budget_config":
            t.execute.return_value = MagicMock(
                data=[
                    {
                        "monthly_budget_credits": 1000,
                        "alert_thresholds_pct": [70, 85, 95],
                        "hard_stop_pct": 100,
                    }
                ]
            )
        elif name == "apollo_credit_usage_monthly":
            t.execute.return_value = MagicMock(data=[{"credits_used": 1100}])
        else:
            t.execute.return_value = MagicMock(data=[])
        return t

    supabase.table.side_effect = table_side_effect

    # No setupeamos respx mock — si llega a hacer request, falla con respx.MockNotMatched
    client = ApolloClient(api_key="test-key", supabase=supabase)

    with pytest.raises(ApolloBudgetExceeded):
        async for _ in client.search_accounts(AccountSearchFilters()):
            pass  # no debería entrar nunca


@respx.mock
async def test_search_people_yields_persons() -> None:
    from leads_scrapper.clients.apollo import ApolloClient
    from leads_scrapper.models.apollo import PeopleSearchFilters

    respx.post(f"{APOLLO_BASE}/mixed_people/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "people": [
                    {
                        "id": "p1",
                        "organization_id": "a1",
                        "name": "Juan Pérez",
                        "title": "CEO",
                        "email": "juan@empresa-a.com",
                        "email_status": "verified",
                        "seniority": "c_suite",
                    },
                ],
                "pagination": {"page": 1, "total_pages": 1},
            },
        )
    )

    client = ApolloClient(api_key="test-key", supabase=_ok_supabase_mock())
    people = []
    async for person in client.search_people(
        PeopleSearchFilters(organization_ids=["a1"], per_page=5)
    ):
        people.append(person)

    assert len(people) == 1
    assert people[0].email == "juan@empresa-a.com"
    assert people[0].full_name == "Juan Pérez"
    assert people[0].is_decision_maker() is True


@respx.mock
async def test_get_credit_balance_returns_health_data() -> None:
    from leads_scrapper.clients.apollo import ApolloClient

    respx.get(f"{APOLLO_BASE}/auth/health").mock(
        return_value=httpx.Response(
            200,
            json={"is_logged_in": True, "user_email": "test@yacare.io"},
            headers={"x-api-credits-remaining": "2400"},
        )
    )

    client = ApolloClient(api_key="test-key")
    result = await client.get_credit_balance()

    assert result["raw"]["is_logged_in"] is True
    assert result["credits_remaining_header"] == "2400"
