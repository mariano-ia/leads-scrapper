"""Repositorio de companies: upsert desde ApolloAccount al schema canónico."""

from datetime import datetime, timezone
from typing import Any

from supabase import Client

from leads_scrapper.models.apollo import ApolloAccount
from leads_scrapper.utils.logging import get_logger

logger = get_logger(__name__)


def _account_to_row(account: ApolloAccount) -> dict[str, Any]:
    """Mapea ApolloAccount → row del schema `companies`."""
    now = datetime.now(timezone.utc).isoformat()
    return {
        "apollo_id": account.id,
        "razon_social": account.name or f"apollo_{account.id}",
        "dominio": account.primary_domain or account.website_url,
        "sector": account.industry,
        "subsector": account.sub_industry,
        "headcount_range": account.headcount_range(),
        "founded_year": account.founded_year,
        "location_pais": account.country or "AR",
        "location_provincia": account.state,
        "location_ciudad": account.city,
        "tech_stack": account.technologies,
        "apollo_data": account.raw,
        "last_apollo_sync_at": now,
        "last_seen_at": now,
    }


async def upsert_company(
    supabase: Client,
    account: ApolloAccount,
) -> dict[str, Any]:
    """UPSERT by apollo_id. Si la empresa existe, actualiza campos volátiles."""
    row = _account_to_row(account)

    # supabase-py soporta upsert con on_conflict
    result = (
        supabase.table("companies")
        .upsert(row, on_conflict="apollo_id")
        .execute()
    )
    if not result.data:
        raise RuntimeError(f"upsert_company returned empty data for apollo_id {account.id}")
    return result.data[0]


async def bulk_upsert_companies(
    supabase: Client,
    accounts: list[ApolloAccount],
) -> dict[str, int]:
    """Batch upsert. Devuelve {inserted, updated, total}.

    Nota: supabase-py no distingue insert vs update en upsert response.
    Reportamos `total` y `errors` solamente.
    """
    if not accounts:
        return {"total": 0, "errors": 0}

    rows = [_account_to_row(a) for a in accounts]
    try:
        result = (
            supabase.table("companies")
            .upsert(rows, on_conflict="apollo_id")
            .execute()
        )
        return {"total": len(result.data or []), "errors": 0}
    except Exception as e:
        logger.error("bulk_upsert_companies failed", extra={"error": str(e), "n_accounts": len(accounts)})
        return {"total": 0, "errors": len(accounts)}
