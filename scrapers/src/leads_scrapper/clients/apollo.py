"""Apollo.io API client.

Implementación completa en Week 2. Este stub define la interfaz pública
y valida config para que el resto del código pueda importar y typecheckear.
"""

from typing import Any


class ApolloClient:
    """Thin wrapper sobre Apollo REST API con retry y budget guardrail.

    Implementación de métodos en Week 2:
        - search_accounts()
        - search_people()
        - get_credit_balance()
    """

    BASE_URL = "https://api.apollo.io/v1"

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key

    async def search_accounts(self, **filters: Any) -> dict[str, Any]:
        raise NotImplementedError("Implemented in Week 2 plan")

    async def search_people(self, **filters: Any) -> dict[str, Any]:
        raise NotImplementedError("Implemented in Week 2 plan")

    async def get_credit_balance(self) -> int:
        raise NotImplementedError("Implemented in Week 2 plan")
