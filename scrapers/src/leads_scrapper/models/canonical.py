"""Modelos canónicos alineados con el schema de Supabase.

Ver docs/superpowers/specs/2026-05-13-leads-scrapper-fase-0-design.md §6
"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class SignalType(str, Enum):
    JOB_POSTING = "job_posting"
    BO_ACT = "bo_act"
    WEB_CHANGE = "web_change"
    APOLLO_HIRING = "apollo_hiring"


class CanonicalCompany(BaseModel):
    model_config = ConfigDict(extra="forbid")

    apollo_id: str | None = None
    cuit: str | None = None
    razon_social: str
    nombre_comercial: str | None = None
    dominio: str | None = None
    sector: str | None = None
    subsector: str | None = None
    headcount_range: str | None = None
    founded_year: int | None = None
    location_pais: str = "AR"
    location_provincia: str | None = None
    location_ciudad: str | None = None
    tech_stack: list[str] = Field(default_factory=list)
    apollo_data: dict[str, Any] | None = None

    @model_validator(mode="after")
    def require_apollo_id_or_cuit(self) -> "CanonicalCompany":
        if self.apollo_id is None and self.cuit is None:
            raise ValueError(
                "company must have either apollo_id or cuit as identity"
            )
        return self


class CanonicalContact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company_id: str
    apollo_person_id: str | None = None
    full_name: str
    title: str | None = None
    email: EmailStr | None = None
    email_status: str | None = None
    linkedin_url: str | None = None
    phone: str | None = None
    is_decision_maker: bool = False
    source: str


class CanonicalSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company_id: str
    type: SignalType
    source: str
    occurred_at: datetime
    detected_at: datetime | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    intent_weight: float
    decay_half_life_days: int
