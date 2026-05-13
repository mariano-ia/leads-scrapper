"""Modelos Apollo: filtros de búsqueda y deserialización de responses.

Estos modelos espejan la API Apollo. NO son canónicos — los repositorios mapean
ApolloAccount → CanonicalCompany al persistir.

Refs:
- Pricing: https://www.apollo.io/pricing
- API docs: https://docs.apollo.io/reference
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AccountSearchFilters(BaseModel):
    """Filtros para POST /api/v1/mixed_companies/search.

    Ver schema completo en spec §7.1 (universe_master_versions.config).
    """

    organization_locations: list[str] = Field(default_factory=lambda: ["Argentina"])
    organization_num_employees_ranges: list[str] = Field(default_factory=list)
    q_organization_industry_tag_ids: list[str] = Field(default_factory=list)
    q_organization_keyword_tags: list[str] = Field(default_factory=list)
    founded_year_min: int | None = None
    founded_year_max: int | None = None
    per_page: int = 100
    page: int = 1

    def to_request_body(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "page": self.page,
            "per_page": self.per_page,
        }
        if self.organization_locations:
            body["organization_locations"] = self.organization_locations
        if self.organization_num_employees_ranges:
            body["organization_num_employees_ranges"] = (
                self.organization_num_employees_ranges
            )
        if self.q_organization_industry_tag_ids:
            body["q_organization_industry_tag_ids"] = (
                self.q_organization_industry_tag_ids
            )
        if self.q_organization_keyword_tags:
            body["q_organization_keyword_tags"] = self.q_organization_keyword_tags
        return body


class PeopleSearchFilters(BaseModel):
    """Filtros para POST /api/v1/mixed_people/search."""

    organization_ids: list[str] = Field(default_factory=list)
    person_titles: list[str] = Field(
        default_factory=lambda: [
            "CEO",
            "Founder",
            "Co-Founder",
            "CTO",
            "Head of Digital",
            "Director",
        ]
    )
    person_seniorities: list[str] = Field(
        default_factory=lambda: ["c_suite", "head", "vp", "director"]
    )
    per_page: int = 5  # top 5 decision makers
    page: int = 1

    def to_request_body(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "page": self.page,
            "per_page": self.per_page,
        }
        if self.organization_ids:
            body["organization_ids"] = self.organization_ids
        if self.person_titles:
            body["person_titles"] = self.person_titles
        if self.person_seniorities:
            body["person_seniorities"] = self.person_seniorities
        return body


class ApolloAccount(BaseModel):
    """Empresa devuelta por Apollo. Solo campos que mapeamos a `companies`.

    Apollo devuelve mucho más — preservamos todo en `apollo_data` para uso futuro.
    """

    model_config = ConfigDict(extra="allow")

    id: str  # Apollo company ID
    name: str | None = None
    website_url: str | None = None
    primary_domain: str | None = None
    industry: str | None = None
    sub_industry: str | None = None
    estimated_num_employees: int | None = None
    founded_year: int | None = None
    country: str | None = None
    state: str | None = None
    city: str | None = None
    technologies: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    short_description: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_apollo_response(cls, payload: dict[str, Any]) -> "ApolloAccount":
        """Construye desde un dict de Apollo. Preserva el payload original en `raw`."""
        return cls(
            id=payload["id"],
            name=payload.get("name"),
            website_url=payload.get("website_url"),
            primary_domain=payload.get("primary_domain"),
            industry=payload.get("industry"),
            sub_industry=payload.get("sub_industry"),
            estimated_num_employees=payload.get("estimated_num_employees"),
            founded_year=payload.get("founded_year"),
            country=payload.get("country"),
            state=payload.get("state"),
            city=payload.get("city"),
            technologies=payload.get("technologies") or [],
            keywords=payload.get("keywords") or [],
            short_description=payload.get("short_description"),
            raw=payload,
        )

    def headcount_range(self) -> str | None:
        """Mapea estimated_num_employees a rango canónico para `companies.headcount_range`."""
        n = self.estimated_num_employees
        if n is None:
            return None
        if n < 10:
            return "1-9"
        if n < 20:
            return "10-19"
        if n < 50:
            return "20-49"
        if n < 100:
            return "50-99"
        if n < 200:
            return "100-199"
        if n < 500:
            return "200-499"
        if n < 1000:
            return "500-999"
        return "1000+"


class ApolloPerson(BaseModel):
    """Contacto devuelto por Apollo."""

    model_config = ConfigDict(extra="allow")

    id: str
    organization_id: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    name: str | None = None
    title: str | None = None
    email: str | None = None
    email_status: str | None = None  # "verified" | "unverified" | ...
    linkedin_url: str | None = None
    phone: str | None = None
    seniority: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_apollo_response(cls, payload: dict[str, Any]) -> "ApolloPerson":
        return cls(
            id=payload["id"],
            organization_id=payload.get("organization_id"),
            first_name=payload.get("first_name"),
            last_name=payload.get("last_name"),
            name=payload.get("name"),
            title=payload.get("title"),
            email=payload.get("email"),
            email_status=payload.get("email_status"),
            linkedin_url=payload.get("linkedin_url"),
            phone=payload.get("sanitized_phone") or payload.get("phone"),
            seniority=payload.get("seniority"),
            raw=payload,
        )

    @property
    def full_name(self) -> str:
        if self.name:
            return self.name
        parts = [self.first_name, self.last_name]
        return " ".join(p for p in parts if p)

    def is_decision_maker(self) -> bool:
        if self.seniority in {"c_suite", "founder", "owner", "partner"}:
            return True
        if self.title:
            t = self.title.lower()
            for kw in ("ceo", "founder", "cto", "coo", "cfo", "chief", "head of"):
                if kw in t:
                    return True
        return False
