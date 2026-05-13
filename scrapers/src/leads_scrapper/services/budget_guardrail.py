"""Apollo budget guardrail.

Verifica antes de cada batch de operaciones Apollo si excederíamos thresholds
configurados (`apollo_budget_config.alert_thresholds_pct` y `hard_stop_pct`).
Registra alertas en `apollo_budget_alerts` para no spamear el mismo threshold
más de una vez por mes.

Decisiones:
- PROCEED: por debajo de cualquier threshold de alerta o hard stop
- PROCEED_WITH_ALERT: cruza un threshold de alerta nuevo (alerta debe enviarse)
- ABORT: cruza o cruzaría hard_stop_pct → el caller NO debe ejecutar la operación
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from supabase import Client


class BudgetAction(str, Enum):
    PROCEED = "proceed"
    PROCEED_WITH_ALERT = "proceed_with_alert"
    ABORT = "abort"


@dataclass
class BudgetDecision:
    action: BudgetAction
    reason: str
    current_used: int
    projected_used: int
    monthly_budget: int
    crossed_threshold_pct: int | None = None  # set if PROCEED_WITH_ALERT
    hard_stop_pct: int = 100

    @property
    def projected_pct(self) -> float:
        if self.monthly_budget == 0:
            return 0.0
        return round(self.projected_used / self.monthly_budget * 100, 2)


def _current_year_month() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.year:04d}-{now.month:02d}"


async def check_apollo_budget(
    supabase: Client,
    estimated_credits: int,
    *,
    year_month: str | None = None,
) -> BudgetDecision:
    """Verifica budget antes de operar.

    Args:
        supabase: cliente con service_role (necesario para acceso a budget tables).
        estimated_credits: créditos que la operación pendiente va a consumir.
        year_month: opcional, formato "YYYY-MM". Default = mes actual UTC.

    Returns:
        BudgetDecision con action a tomar.
    """
    ym = year_month or _current_year_month()

    # 1. Cargar config (una sola fila esperada)
    config_resp = supabase.table("apollo_budget_config").select("*").limit(1).execute()
    if not config_resp.data:
        raise RuntimeError(
            "apollo_budget_config has no rows. Apply migration 0007 first."
        )
    config = config_resp.data[0]
    monthly_budget = int(config["monthly_budget_credits"])
    thresholds: list[int] = list(config["alert_thresholds_pct"])
    hard_stop = int(config["hard_stop_pct"])

    # 2. Cargar uso del mes (crear si no existe)
    usage_resp = (
        supabase.table("apollo_credit_usage_monthly")
        .select("*")
        .eq("year_month", ym)
        .limit(1)
        .execute()
    )
    if usage_resp.data:
        current_used = int(usage_resp.data[0]["credits_used"])
    else:
        supabase.table("apollo_credit_usage_monthly").insert(
            {"year_month": ym, "credits_used": 0}
        ).execute()
        current_used = 0

    projected = current_used + estimated_credits
    projected_pct = (projected / monthly_budget * 100) if monthly_budget > 0 else 0.0

    # 3. Hard stop check
    if projected_pct >= hard_stop:
        return BudgetDecision(
            action=BudgetAction.ABORT,
            reason=(
                f"Projected {projected}/{monthly_budget} ({projected_pct:.1f}%) "
                f"exceeds hard_stop {hard_stop}%"
            ),
            current_used=current_used,
            projected_used=projected,
            monthly_budget=monthly_budget,
            hard_stop_pct=hard_stop,
        )

    # 4. Threshold crossing check (orden descendente para reportar el más alto)
    for threshold in sorted(thresholds, reverse=True):
        if projected_pct >= threshold:
            # ¿Ya enviamos alerta para este threshold este mes?
            existing = (
                supabase.table("apollo_budget_alerts")
                .select("id")
                .eq("year_month", ym)
                .eq("threshold_pct", threshold)
                .limit(1)
                .execute()
            )
            if not existing.data:
                # Registrar la alerta (caller debe enviar email)
                supabase.table("apollo_budget_alerts").insert(
                    {
                        "year_month": ym,
                        "threshold_pct": threshold,
                        "credits_used_at_alert": current_used,
                    }
                ).execute()
                return BudgetDecision(
                    action=BudgetAction.PROCEED_WITH_ALERT,
                    reason=(
                        f"Crossed {threshold}% threshold: {projected_used_str(projected, monthly_budget)}"
                    ),
                    current_used=current_used,
                    projected_used=projected,
                    monthly_budget=monthly_budget,
                    crossed_threshold_pct=threshold,
                    hard_stop_pct=hard_stop,
                )
            # Ya alertamos, no levantar de nuevo
            break

    return BudgetDecision(
        action=BudgetAction.PROCEED,
        reason=f"{projected_used_str(projected, monthly_budget)}",
        current_used=current_used,
        projected_used=projected,
        monthly_budget=monthly_budget,
        hard_stop_pct=hard_stop,
    )


def projected_used_str(projected: int, budget: int) -> str:
    pct = (projected / budget * 100) if budget > 0 else 0.0
    return f"{projected}/{budget} ({pct:.1f}%)"


async def record_credits_consumed(
    supabase: Client,
    credits: int,
    *,
    year_month: str | None = None,
) -> dict[str, Any]:
    """Suma créditos al contador del mes. Llamar después de cada operación real."""
    ym = year_month or _current_year_month()

    # Garantiza row del mes
    existing = (
        supabase.table("apollo_credit_usage_monthly")
        .select("credits_used")
        .eq("year_month", ym)
        .limit(1)
        .execute()
    )
    if not existing.data:
        result = (
            supabase.table("apollo_credit_usage_monthly")
            .insert(
                {
                    "year_month": ym,
                    "credits_used": credits,
                    "last_sync_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        )
        return result.data[0]

    new_total = int(existing.data[0]["credits_used"]) + credits
    result = (
        supabase.table("apollo_credit_usage_monthly")
        .update(
            {
                "credits_used": new_total,
                "last_sync_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("year_month", ym)
        .execute()
    )
    return result.data[0]
