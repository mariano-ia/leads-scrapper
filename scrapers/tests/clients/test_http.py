"""Tests para retry_request."""

import httpx
import pytest
import respx


@respx.mock
async def test_retry_request_retries_503_then_succeeds() -> None:
    from leads_scrapper.clients.http import retry_request

    route = respx.get("https://api.example.com/health").mock(
        side_effect=[
            httpx.Response(503, text="upstream"),
            httpx.Response(503, text="upstream"),
            httpx.Response(200, json={"status": "ok"}),
        ]
    )

    async with httpx.AsyncClient() as client:
        response = await retry_request(
            client,
            "GET",
            "https://api.example.com/health",
            max_attempts=5,
            min_wait_seconds=0.01,
            max_wait_seconds=0.05,
        )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert route.call_count == 3


@respx.mock
async def test_retry_request_does_not_retry_400() -> None:
    from leads_scrapper.clients.http import retry_request

    route = respx.get("https://api.example.com/x").mock(
        return_value=httpx.Response(400, json={"error": "bad request"})
    )

    async with httpx.AsyncClient() as client:
        with pytest.raises(httpx.HTTPStatusError) as exc:
            await retry_request(
                client,
                "GET",
                "https://api.example.com/x",
                max_attempts=5,
                min_wait_seconds=0.01,
            )

    assert exc.value.response.status_code == 400
    assert route.call_count == 1


@respx.mock
async def test_retry_request_gives_up_after_max_attempts() -> None:
    from leads_scrapper.clients.http import RetriableHTTPError, retry_request

    route = respx.get("https://api.example.com/down").mock(
        return_value=httpx.Response(503, text="still down")
    )

    async with httpx.AsyncClient() as client:
        with pytest.raises(RetriableHTTPError) as exc:
            await retry_request(
                client,
                "GET",
                "https://api.example.com/down",
                max_attempts=3,
                min_wait_seconds=0.01,
            )

    assert exc.value.response.status_code == 503
    assert route.call_count == 3


@respx.mock
async def test_retry_request_retries_on_transport_error() -> None:
    from leads_scrapper.clients.http import retry_request

    route = respx.get("https://api.example.com/transport").mock(
        side_effect=[
            httpx.ConnectError("connection refused"),
            httpx.Response(200, json={"ok": True}),
        ]
    )

    async with httpx.AsyncClient() as client:
        response = await retry_request(
            client,
            "GET",
            "https://api.example.com/transport",
            max_attempts=5,
            min_wait_seconds=0.01,
        )

    assert response.status_code == 200
    assert route.call_count == 2
