"""httpx wrapper con retry exponencial vía tenacity.

Reintenta en errores transitorios (429 rate limit, 5xx server errors).
NO reintenta en 4xx client errors (excepto 429).
"""

from typing import Any

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

RETRY_STATUS_CODES = {429, 500, 502, 503, 504}


class RetriableHTTPError(Exception):
    """Excepción levantada para que tenacity sepa que vale reintentar."""

    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        super().__init__(f"HTTP {response.status_code}: {response.text[:200]}")


def _is_retriable(exc: BaseException) -> bool:
    return isinstance(exc, RetriableHTTPError | httpx.TransportError)


async def retry_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    max_attempts: int = 5,
    min_wait_seconds: float = 1.0,
    max_wait_seconds: float = 30.0,
    **kwargs: Any,
) -> httpx.Response:
    """Ejecuta un request httpx con retry exponencial.

    Args:
        client: AsyncClient httpx (configurar timeout afuera).
        method: GET, POST, etc.
        url: URL absoluta o relativa al base_url del client.
        max_attempts: máximo de intentos.
        min_wait_seconds: espera mínima entre intentos.
        max_wait_seconds: espera máxima.
        **kwargs: pasados a client.request (headers, json, params, etc.).

    Returns:
        Response 2xx.

    Raises:
        RetriableHTTPError: si después de max_attempts sigue fallando con código retriable.
        httpx.HTTPStatusError: si la respuesta es 4xx no retriable.
        httpx.TransportError: errores de red persistentes.
    """
    retryer = AsyncRetrying(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=min_wait_seconds, max=max_wait_seconds),
        retry=retry_if_exception(_is_retriable),
        reraise=True,
    )

    async for attempt in retryer:
        with attempt:
            response = await client.request(method, url, **kwargs)
            if response.status_code in RETRY_STATUS_CODES:
                raise RetriableHTTPError(response)
            response.raise_for_status()
            return response

    # Unreachable — tenacity reraise=True garantiza propagación.
    raise RuntimeError("retry_request fell through retry loop")
