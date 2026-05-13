"""Apollo.io API client real.

Ver docs: https://docs.apollo.io/reference
Endpoints usados:
- POST /api/v1/mixed_companies/search (search empresas, no consume créditos)
- POST /api/v1/mixed_people/search (search contactos, consume créditos por reveal)
- GET  /api/v1/auth/health (verifica auth y devuelve info de cuenta)

NOTAS DE INTEGRACIÓN (verificar al primer call real con API key):
1. Endpoint exacto de credit balance puede variar — chequear docs cuando integremos.
   Apollo no expone créditos restantes vía API standard; hay que parsear de auth/health
   o de un header `x-api-credits-remaining` que algunos endpoints devuelven.
2. Apollo a veces cambia el shape de las responses sin avisar — preservamos `raw`
   en los modelos para no perder data.
3. Rate limit típico Basic: ~60 req/min. Backoff exponencial cubre.
"""

from collections.abc import AsyncIterator
from typing import Any

import httpx
from supabase import Client

from leads_scrapper.clients.http import retry_request
from leads_scrapper.models.apollo import (
    AccountSearchFilters,
    ApolloAccount,
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
        """Si hay supabase configurado, chequea budget. Aborta con excepción si abort."""
        if self.supabase is None:
            return  # no enforcement sin supabase
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
            # TODO Week 7: dispatch email a alert_emails

    async def _record_credits(self, credits: int) -> None:
        if self.supabase is None or credits == 0:
            return
        await record_credits_consumed(self.supabase, credits)

    async def search_accounts(
        self, filters: AccountSearchFilters
    ) -> AsyncIterator[ApolloAccount]:
        """Pagina y yield empresas matching los filtros.

        Search de empresas asumimos 0 credit cost (free in API). Aún así
        chequeamos budget como sanity.
        """
        await self._budget_or_raise(estimated_credits=0)

        async with self._build_client() as client:
            page = filters.page
            while True:
                body = filters.model_copy(update={"page": page}).to_request_body()
                logger.info(
                    "apollo search_accounts request",
                    extra={"page": page, "per_page": filters.per_page},
                )
                response = await retry_request(
                    client,
                    "POST",
                    "/mixed_companies/search",
                    json=body,
                )
                payload = response.json()
                accounts = payload.get("accounts") or payload.get("organizations") or []
                for raw in accounts:
                    yield ApolloAccount.from_apollo_response(raw)

                pagination = payload.get("pagination", {})
                total_pages = pagination.get("total_pages", 1)
                if page >= total_pages or not accounts:
                    break
                page += 1

    async def search_people(
        self, filters: PeopleSearchFilters
    ) -> AsyncIterator[ApolloPerson]:
        """Search de personas (decision makers).

        Consume créditos: ~1 por persona "revealed" en results. Estimamos
        por_page créditos por request.
        """
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
                    if person.email:  # solo cuenta créditos cuando vino email revealed
                        total_revealed += 1
                    yield person

                pagination = payload.get("pagination", {})
                total_pages = pagination.get("total_pages", 1)
                if page >= total_pages or not people:
                    break
                page += 1

            # Registra créditos consumidos al final
            if total_revealed > 0:
                await self._record_credits(total_revealed)

    async def get_credit_balance(self) -> dict[str, Any]:
        """Devuelve info de cuenta + créditos restantes (best-effort).

        Apollo no expone un endpoint estable para esto. Usamos /auth/health
        que devuelve info de cuenta. Si Apollo expone créditos restantes en
        algún header o campo, lo parseamos.
        """
        async with self._build_client() as client:
            response = await retry_request(client, "GET", "/auth/health")
            data = response.json()
            # Algunos endpoints devuelven 'credits' o similar — preservamos todo
            return {
                "raw": data,
                "credits_remaining_header": response.headers.get(
                    "x-api-credits-remaining"
                ),
            }
