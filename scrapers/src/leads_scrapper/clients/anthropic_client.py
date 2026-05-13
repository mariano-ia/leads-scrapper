"""Anthropic Claude API wrapper.

Implementación completa en Week 4 (cuando llegamos a LLM filter + briefs).
"""

from typing import Any


class AnthropicLLMClient:
    """Wrapper con prompt caching para LLM filter y AI brief generation."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.model = model

    async def score_company(
        self,
        company: dict[str, Any],
        signals: list[dict[str, Any]],
        icp_text: str,
    ) -> dict[str, Any]:
        raise NotImplementedError("Implemented in Week 4 plan")

    async def generate_brief(
        self,
        company: dict[str, Any],
        signals: list[dict[str, Any]],
        contacts: list[dict[str, Any]],
    ) -> str:
        raise NotImplementedError("Implemented in Week 4 plan")
