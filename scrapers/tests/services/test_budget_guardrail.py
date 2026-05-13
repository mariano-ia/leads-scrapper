"""Tests para budget guardrail con cliente Supabase mockeado."""

from typing import Any
from unittest.mock import MagicMock


def _build_supabase_mock(
    *,
    config: dict[str, Any],
    usage: dict[str, Any] | None,
    existing_alerts: list[dict[str, Any]] | None = None,
) -> MagicMock:
    """Construye un mock que responde a las queries que hace check_apollo_budget."""
    mock = MagicMock(name="supabase")

    def table_side_effect(name: str) -> MagicMock:
        t = MagicMock(name=f"table[{name}]")
        # method chain stubs
        t.select.return_value = t
        t.eq.return_value = t
        t.limit.return_value = t
        t.insert.return_value = t
        t.update.return_value = t

        if name == "apollo_budget_config":
            t.execute.return_value = MagicMock(data=[config])
        elif name == "apollo_credit_usage_monthly":
            t.execute.return_value = MagicMock(data=[usage] if usage else [])
        elif name == "apollo_budget_alerts":
            t.execute.return_value = MagicMock(data=existing_alerts or [])
        else:
            t.execute.return_value = MagicMock(data=[])
        return t

    mock.table.side_effect = table_side_effect
    return mock


async def test_proceed_when_well_below_budget() -> None:
    from leads_scrapper.services.budget_guardrail import (
        BudgetAction,
        check_apollo_budget,
    )

    supabase = _build_supabase_mock(
        config={
            "monthly_budget_credits": 1000,
            "alert_thresholds_pct": [70, 85, 95],
            "hard_stop_pct": 100,
        },
        usage={"credits_used": 100},
    )

    decision = await check_apollo_budget(supabase, estimated_credits=50)
    assert decision.action == BudgetAction.PROCEED
    assert decision.current_used == 100
    assert decision.projected_used == 150
    assert decision.monthly_budget == 1000


async def test_abort_when_hard_stop_crossed() -> None:
    from leads_scrapper.services.budget_guardrail import (
        BudgetAction,
        check_apollo_budget,
    )

    supabase = _build_supabase_mock(
        config={
            "monthly_budget_credits": 1000,
            "alert_thresholds_pct": [70, 85, 95],
            "hard_stop_pct": 100,
        },
        usage={"credits_used": 950},
    )

    decision = await check_apollo_budget(supabase, estimated_credits=100)
    assert decision.action == BudgetAction.ABORT
    assert "exceeds hard_stop" in decision.reason


async def test_alert_when_crossing_85_threshold_first_time() -> None:
    from leads_scrapper.services.budget_guardrail import (
        BudgetAction,
        check_apollo_budget,
    )

    supabase = _build_supabase_mock(
        config={
            "monthly_budget_credits": 1000,
            "alert_thresholds_pct": [70, 85, 95],
            "hard_stop_pct": 100,
        },
        usage={"credits_used": 800},
        existing_alerts=[],  # No alerts yet
    )

    decision = await check_apollo_budget(supabase, estimated_credits=80)
    # 800 + 80 = 880 = 88% → cruza 85
    assert decision.action == BudgetAction.PROCEED_WITH_ALERT
    assert decision.crossed_threshold_pct == 85


async def test_no_double_alert_for_same_threshold() -> None:
    from leads_scrapper.services.budget_guardrail import (
        BudgetAction,
        check_apollo_budget,
    )

    supabase = _build_supabase_mock(
        config={
            "monthly_budget_credits": 1000,
            "alert_thresholds_pct": [70, 85, 95],
            "hard_stop_pct": 100,
        },
        usage={"credits_used": 850},
        existing_alerts=[{"id": "some-uuid", "threshold_pct": 85}],
    )

    decision = await check_apollo_budget(supabase, estimated_credits=10)
    # 850 + 10 = 860 = 86% → cruzaría 85, pero ya alertamos
    assert decision.action == BudgetAction.PROCEED


async def test_initializes_month_if_no_usage_row() -> None:
    from leads_scrapper.services.budget_guardrail import (
        BudgetAction,
        check_apollo_budget,
    )

    supabase = _build_supabase_mock(
        config={
            "monthly_budget_credits": 1000,
            "alert_thresholds_pct": [70, 85, 95],
            "hard_stop_pct": 100,
        },
        usage=None,  # Sin row del mes
    )

    decision = await check_apollo_budget(supabase, estimated_credits=50)
    assert decision.action == BudgetAction.PROCEED
    assert decision.current_used == 0
    assert decision.projected_used == 50
