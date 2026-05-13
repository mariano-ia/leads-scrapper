"""Settings loaded from environment variables, validated by Pydantic."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Supabase
    next_public_supabase_url: str = Field(..., alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_project_ref: str | None = Field(None, alias="SUPABASE_PROJECT_REF")

    # Apollo
    apollo_api_key: str | None = Field(None, alias="APOLLO_API_KEY")

    # Anthropic
    anthropic_api_key: str | None = Field(None, alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field("claude-sonnet-4-6", alias="ANTHROPIC_MODEL")

    # Resend
    resend_api_key: str | None = Field(None, alias="RESEND_API_KEY")
    resend_from_email: str | None = Field(None, alias="RESEND_FROM_EMAIL")
    resend_from_name: str | None = Field(None, alias="RESEND_FROM_NAME")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
