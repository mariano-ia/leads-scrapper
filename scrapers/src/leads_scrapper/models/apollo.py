"""Modelos Apollo: filtros de búsqueda + deserialización de responses.

CAMPOS REALES de Apollo `mixed_companies/search` (basado en testing 2026-05-13):
search devuelve UN SUBSET — id/name/domain/founded_year/growth/intent/financial.
Para industry/headcount/location/tech hay que llamar a `organizations/enrich`
(1 crédito por empresa).

Refs:
- https://docs.apollo.io/reference/organization-search
- https://docs.apollo.io/reference/organizations-enrichment
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AccountSearchFilters(BaseModel):
    """Filtros para POST /api/v1/mixed_companies/search.

    Los filtros SÍ se aplican aunque después el field no se eche en el response
    (Apollo filtra at-source, no echoes).
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
        if self.founded_year_min is not None or self.founded_year_max is not None:
            # Apollo accepts founded_year as a list of ranges
            year_range = {
                "min": self.founded_year_min,
                "max": self.founded_year_max,
            }
            body["organization_founded_year_ranges"] = [year_range]
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
    per_page: int = 5
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
    """Empresa devuelta por Apollo search.

    Campos que SÍ vienen en search (verificado en producción 2026-05-13):
    - Identidad: id, name, primary_domain, website_url, linkedin_url/uid, social urls
    - Identidad legal: phone, founded_year, sic_codes
    - Financial: market_cap, organization_revenue
    - Growth signals: organization_headcount_six/twelve/twenty_four_month_growth
    - Intent: intent_strength, show_intent, has_intent_signal_account

    Campos que NO vienen en search (requieren /organizations/enrich, 1 crédito):
    - industry, sub_industry
    - estimated_num_employees, headcount_range
    - country, state, city
    - technologies, keywords, short_description
    """

    model_config = ConfigDict(extra="allow")

    # Identidad core
    id: str  # Apollo company ID
    name: str | None = None
    primary_domain: str | None = None
    website_url: str | None = None

    # Social / contact
    linkedin_url: str | None = None
    linkedin_uid: str | None = None
    twitter_url: str | None = None
    facebook_url: str | None = None
    angellist_url: str | None = None
    crunchbase_url: str | None = None
    logo_url: str | None = None
    phone: str | None = None
    sanitized_phone: str | None = None

    # Empresa info básica
    founded_year: int | None = None
    sic_codes: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)

    # Financial
    market_cap: str | None = None
    organization_revenue: float | None = None
    organization_revenue_printed: str | None = None
    publicly_traded_symbol: str | None = None
    publicly_traded_exchange: str | None = None

    # Growth signals (oro para intent_score)
    organization_headcount_six_month_growth: float | None = None
    organization_headcount_twelve_month_growth: float | None = None
    organization_headcount_twenty_four_month_growth: float | None = None

    # Apollo intent
    intent_strength: str | None = None
    show_intent: bool | None = None
    has_intent_signal_account: bool | None = None

    # Ownership
    owned_by_organization_id: str | None = None

    # Otros
    alexa_ranking: int | None = None

    # Raw payload preservado (incluye fields no modelados arriba)
    raw: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_apollo_response(cls, payload: dict[str, Any]) -> "ApolloAccount":
        return cls(
            id=payload["id"],
            name=payload.get("name"),
            primary_domain=payload.get("primary_domain"),
            website_url=payload.get("website_url"),
            linkedin_url=payload.get("linkedin_url"),
            linkedin_uid=payload.get("linkedin_uid"),
            twitter_url=payload.get("twitter_url"),
            facebook_url=payload.get("facebook_url"),
            angellist_url=payload.get("angellist_url"),
            crunchbase_url=payload.get("crunchbase_url"),
            logo_url=payload.get("logo_url"),
            phone=payload.get("phone"),
            sanitized_phone=payload.get("sanitized_phone"),
            founded_year=payload.get("founded_year"),
            sic_codes=payload.get("sic_codes") or [],
            languages=payload.get("languages") or [],
            market_cap=payload.get("market_cap"),
            organization_revenue=payload.get("organization_revenue"),
            organization_revenue_printed=payload.get("organization_revenue_printed"),
            publicly_traded_symbol=payload.get("publicly_traded_symbol"),
            publicly_traded_exchange=payload.get("publicly_traded_exchange"),
            organization_headcount_six_month_growth=payload.get(
                "organization_headcount_six_month_growth"
            ),
            organization_headcount_twelve_month_growth=payload.get(
                "organization_headcount_twelve_month_growth"
            ),
            organization_headcount_twenty_four_month_growth=payload.get(
                "organization_headcount_twenty_four_month_growth"
            ),
            intent_strength=payload.get("intent_strength"),
            show_intent=payload.get("show_intent"),
            has_intent_signal_account=payload.get("has_intent_signal_account"),
            owned_by_organization_id=payload.get("owned_by_organization_id"),
            alexa_ranking=payload.get("alexa_ranking"),
            raw=payload,
        )


class ApolloEnrichedOrganization(BaseModel):
    """Detalle completo de empresa devuelto por /organizations/enrich.

    Trae los fields que search NO da: industry, headcount, location, tech, etc.
    Consume 1 crédito por llamada.
    """

    model_config = ConfigDict(extra="allow")

    id: str
    name: str | None = None
    primary_domain: str | None = None
    industry: str | None = None
    sub_industry: str | None = None
    keywords: list[str] = Field(default_factory=list)
    estimated_num_employees: int | None = None
    short_description: str | None = None
    raw_address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    languages: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    technology_names: list[str] = Field(default_factory=list)
    founded_year: int | None = None
    raw: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_apollo_response(cls, payload: dict[str, Any]) -> "ApolloEnrichedOrganization":
        org = payload.get("organization") if isinstance(payload, dict) else None
        data = org or payload
        return cls(
            id=data["id"],
            name=data.get("name"),
            primary_domain=data.get("primary_domain"),
            industry=data.get("industry"),
            sub_industry=data.get("sub_industry"),
            keywords=data.get("keywords") or [],
            estimated_num_employees=data.get("estimated_num_employees"),
            short_description=data.get("short_description"),
            raw_address=data.get("raw_address"),
            city=data.get("city"),
            state=data.get("state"),
            country=data.get("country"),
            languages=data.get("languages") or [],
            technologies=[t.get("name") if isinstance(t, dict) else t for t in (data.get("technologies") or [])],
            technology_names=data.get("technology_names") or [],
            founded_year=data.get("founded_year"),
            raw=data,
        )

    def headcount_range(self) -> str | None:
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
    email_status: str | None = None
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
