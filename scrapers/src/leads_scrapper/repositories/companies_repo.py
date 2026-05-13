"""Repositorio de companies.

upsert_company_from_search: mapea lo que Apollo search devuelve (sin enrichment).
update_company_with_enrichment: completa los fields que solo da el enrich endpoint.
"""

from datetime import datetime, timezone
from typing import Any, cast

from supabase import Client

from leads_scrapper.models.apollo import (
    ApolloAccount,
    ApolloEnrichedOrganization,
)
from leads_scrapper.utils.logging import get_logger

logger = get_logger(__name__)


def _account_to_row(account: ApolloAccount) -> dict[str, Any]:
    """Mapea ApolloAccount (search response) → row de companies.

    Persiste tanto la data identitaria (razon_social, dominio) como los fields
    Apollo-specific en columnas flat (growth, intent, financial, etc.) para
    que la UI pueda querear sin parsear jsonb. industry/headcount/location/
    tech quedan null hasta que se enriquezca.
    """
    now = datetime.now(timezone.utc).isoformat()
    return {
        "apollo_id": account.id,
        "status": "active",  # garantiza re-activar si fue marcada inactive antes
        "razon_social": account.name or f"apollo_{account.id}",
        "dominio": account.primary_domain or account.website_url,
        "website_url": account.website_url,
        "linkedin_url": account.linkedin_url,
        "linkedin_uid": account.linkedin_uid,
        "twitter_url": account.twitter_url,
        "facebook_url": account.facebook_url,
        "logo_url": account.logo_url,
        "phone": account.phone,
        "sanitized_phone": account.sanitized_phone,
        "founded_year": account.founded_year,
        "location_pais": "AR",
        "market_cap": account.market_cap,
        "organization_revenue": account.organization_revenue,
        "organization_revenue_printed": account.organization_revenue_printed,
        "publicly_traded_symbol": account.publicly_traded_symbol,
        "publicly_traded_exchange": account.publicly_traded_exchange,
        "organization_headcount_six_month_growth": account.organization_headcount_six_month_growth,
        "organization_headcount_twelve_month_growth": account.organization_headcount_twelve_month_growth,
        "organization_headcount_twenty_four_month_growth": account.organization_headcount_twenty_four_month_growth,
        "intent_strength": account.intent_strength,
        "show_intent": account.show_intent,
        "has_intent_signal_account": account.has_intent_signal_account,
        "owned_by_organization_id": account.owned_by_organization_id,
        "alexa_ranking": account.alexa_ranking,
        "sic_codes": account.sic_codes,
        "languages": account.languages,
        "apollo_data": account.raw,
        "last_apollo_sync_at": now,
        "last_seen_at": now,
    }


async def upsert_company_from_search(
    supabase: Client,
    account: ApolloAccount,
) -> dict[str, Any]:
    """UPSERT empresa con lo que vino de search. 0 créditos Apollo."""
    row = _account_to_row(account)
    result = (
        supabase.table("companies")
        .upsert(row, on_conflict="apollo_id")
        .execute()
    )
    if not result.data:
        raise RuntimeError(
            f"upsert_company returned empty for apollo_id {account.id}"
        )
    return cast("dict[str, Any]", result.data[0])


async def bulk_upsert_companies_from_search(
    supabase: Client,
    accounts: list[ApolloAccount],
) -> dict[str, int]:
    """Batch upsert. 0 créditos Apollo."""
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
        logger.error(
            "bulk_upsert_companies failed",
            extra={"error": str(e), "n_accounts": len(accounts)},
        )
        return {"total": 0, "errors": len(accounts)}


async def update_company_with_enrichment(
    supabase: Client,
    company_id: str,
    enriched: ApolloEnrichedOrganization,
) -> dict[str, Any]:
    """Completa industry/headcount/location/tech sobre una company ya existente.

    Llamado después de un enrich_organization() exitoso.
    """
    update = {
        "sector": enriched.industry,
        "subsector": enriched.sub_industry,
        "headcount_range": enriched.headcount_range(),
        "location_pais": enriched.country or "AR",
        "location_provincia": enriched.state,
        "location_ciudad": enriched.city,
        "tech_stack": enriched.technologies or enriched.technology_names,
        # Guardamos también el payload completo del enrich en apollo_data junto al search payload
        "last_apollo_sync_at": datetime.now(timezone.utc).isoformat(),
    }
    # Filtrar None values para no sobrescribir campos existentes con NULL
    update = {k: v for k, v in update.items() if v is not None and v != []}

    result = (
        supabase.table("companies")
        .update(update)
        .eq("id", company_id)
        .execute()
    )
    return cast("dict[str, Any]", result.data[0]) if result.data else {}
