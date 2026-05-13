"""Apollo.io API client real.

Endpoints usados:
- POST /api/v1/mixed_companies/search    (search empresas, 0 créditos)
- GET  /api/v1/auth/health                (healthcheck, 0 créditos)
- POST /api/v1/mixed_people/search        (search contactos, 1 crédito/persona reveal)
- POST /api/v1/organizations/enrich       (enrich empresa, 1 crédito)

ESTRATEGIA DE CRÉDITOS:
- Initial universe sync: solo search → 0 créditos
- Enrichment on-demand: cuando una empresa entra a `org_companies` (matchea
  una search activa), enriquecemos para tener industry/headcount/location/tech.
  Estimación: 200-500 enrichments/mes para Yacaré.
- People reveal: 1 crédito por persona revealed (top 3-5 decision makers por
  empresa en org_companies).
"""

from collections.abc import AsyncIterator
from typing import Any

import httpx
from supabase import Client

from leads_scrapper.clients.http import retry_request
from leads_scrapper.models.apollo import (
    AccountSearchFilters,
    ApolloAccount,
    ApolloEnrichedOrganization,
    ApolloPerson,
    PeopleSearchFilters,
)
from leads_scrapper.services.budget_guardrail import (
    BudgetAction,
    check_apollo_budget,
    record_credits_consumed,
)
from leads_scrapper.utils.logging import get_logger

logger = get_logger(__name__)


class ApolloBudgetExceeded(Exception):
    """Levantada cuando el budget guardrail aborta una operación."""


class ApolloClient:
    """Thin wrapper sobre Apollo REST API con retry + budget guardrail."""

    BASE_URL = "https://api.apollo.io/api/v1"

    def __init__(
        self,
        api_key: str,
        supabase: Client | None = None,
        *,
        timeout: float = 30.0,
        base_url: str | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.supabase = supabase
        self.base_url = base_url or self.BASE_URL
        self._timeout = timeout

    def _build_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "X-Api-Key": self.api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Cache-Control": "no-cache",
            },
            timeout=self._timeout,
        )

    async def _budget_or_raise(self, estimated_credits: int) -> None:
        if self.supabase is None:
            return
        decision = await check_apollo_budget(self.supabase, estimated_credits)
        if decision.action == BudgetAction.ABORT:
            logger.error(
                "apollo budget abort",
                extra={
                    "reason": decision.reason,
                    "current_used": decision.current_used,
                    "projected_used": decision.projected_used,
                    "monthly_budget": decision.monthly_budget,
                },
            )
            raise ApolloBudgetExceeded(decision.reason)
        if decision.action == BudgetAction.PROCEED_WITH_ALERT:
            logger.warning(
                "apollo budget threshold crossed",
                extra={
                    "threshold_pct": decision.crossed_threshold_pct,
                    "current_used": decision.current_used,
                    "projected_used": decision.projected_used,
                    "monthly_budget": decision.monthly_budget,
                },
            )

    async def _record_credits(self, credits: int) -> None:
        if self.supabase is None or credits == 0:
            return
        await record_credits_consumed(self.supabase, credits)

    async def healthcheck(self) -> dict[str, Any]:
        """GET /auth/health — confirma que la API key es válida. 0 créditos."""
        async with self._build_client() as client:
            response = await retry_request(client, "GET", "/auth/health")
            return response.json()

    async def search_accounts(
        self, filters: AccountSearchFilters
    ) -> AsyncIterator[ApolloAccount]:
        """Pagina y yield empresas matching los filtros. 0 créditos."""
        await self._budget_or_raise(estimated_credits=0)

        async with self._build_client() as client:
            page = filters.page
            while True:
                body = filters.model_copy(update={"page": page}).to_request_body()
                logger.info(
                    "apollo search_accounts request",
                    extra={"page": page, "per_page": filters.per_page},
                )
                try:
                    response = await retry_request(
                        client,
                        "POST",
                        "/mixed_companies/search",
                        json=body,
                    )
                except httpx.HTTPStatusError as e:
                    # Apollo Basic limita pagination ~500 páginas con 422 "unprocessable"
                    if e.response.status_code == 422 and page > 1:
                        logger.info(
                            "apollo pagination limit reached, stopping",
                            extra={"page": page, "status": 422},
                        )
                        return
                    raise
                payload = response.json()
                accounts = payload.get("accounts") or payload.get("organizations") or []
                for raw in accounts:
                    yield ApolloAccount.from_apollo_response(raw)

                pagination = payload.get("pagination", {})
                total_pages = pagination.get("total_pages", 1)
                if page >= total_pages or not accounts:
                    break
                page += 1

    async def enrich_organization(
        self,
        *,
        domain: str | None = None,
        organization_id: str | None = None,
    ) -> ApolloEnrichedOrganization | None:
        """POST /organizations/enrich — detalle completo de empresa.

        Consume 1 crédito. Devuelve None si Apollo no encuentra la empresa.

        Args:
            domain: dominio de la empresa (e.g., "mercadolibre.com").
            organization_id: Apollo company ID (alternativa a domain).
        """
        if domain is None and organization_id is None:
            raise ValueError("Need either domain or organization_id")

        await self._budget_or_raise(estimated_credits=1)

        params: dict[str, Any] = {}
        if domain:
            params["domain"] = domain
        if organization_id:
            params["organization_id"] = organization_id

        async with self._build_client() as client:
            logger.info("apollo enrich_organization request", extra=params)
            response = await retry_request(
                client,
                "POST",
                "/organizations/enrich",
                params=params,
            )
            data = response.json()

            org_data = data.get("organization") if isinstance(data, dict) else None
            if not org_data and not data.get("id"):
                logger.warning("apollo enrich returned no organization", extra=params)
                return None

            # Apollo cobra 1 crédito incluso si "not found"? — defensive: record only on found
            await self._record_credits(1)
            return ApolloEnrichedOrganization.from_apollo_response(data)

    async def search_people(
        self, filters: PeopleSearchFilters
    ) -> AsyncIterator[ApolloPerson]:
        """Search de personas (decision makers). 1 crédito por persona revealed."""
        await self._budget_or_raise(estimated_credits=filters.per_page)

        async with self._build_client() as client:
            page = filters.page
            total_revealed = 0
            while True:
                body = filters.model_copy(update={"page": page}).to_request_body()
                logger.info(
                    "apollo search_people request",
                    extra={"page": page, "per_page": filters.per_page},
                )
                response = await retry_request(
                    client,
                    "POST",
                    "/mixed_people/search",
                    json=body,
                )
                payload = response.json()
                people = payload.get("people") or payload.get("contacts") or []
                for raw in people:
                    person = ApolloPerson.from_apollo_response(raw)
                    if person.email:
                        total_revealed += 1
                    yield person

                pagination = payload.get("pagination", {})
                total_pages = pagination.get("total_pages", 1)
                if page >= total_pages or not people:
                    break
                page += 1

            if total_revealed > 0:
                await self._record_credits(total_revealed)

    async def get_credit_balance(self) -> dict[str, Any]:
        """Devuelve info de cuenta + créditos restantes (best-effort)."""
        async with self._build_client() as client:
            response = await retry_request(client, "GET", "/auth/health")
            data = response.json()
            return {
                "raw": data,
                "credits_remaining_header": response.headers.get(
                    "x-api-credits-remaining"
                ),
            }
