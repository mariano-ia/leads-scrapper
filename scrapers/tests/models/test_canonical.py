"""Tests de validación de modelos canónicos."""

from datetime import datetime, timezone

import pytest


def test_signal_type_enum_values() -> None:
    from leads_scrapper.models import SignalType

    assert SignalType.JOB_POSTING.value == "job_posting"
    assert SignalType.BO_ACT.value == "bo_act"
    assert SignalType.WEB_CHANGE.value == "web_change"
    assert SignalType.APOLLO_HIRING.value == "apollo_hiring"


def test_canonical_company_requires_apollo_id_or_cuit() -> None:
    from pydantic import ValidationError

    from leads_scrapper.models import CanonicalCompany

    with pytest.raises(ValidationError, match="apollo_id.*cuit"):
        CanonicalCompany(razon_social="Test SRL")  # type: ignore[call-arg]


def test_canonical_company_valid_with_cuit() -> None:
    from leads_scrapper.models import CanonicalCompany

    company = CanonicalCompany(
        cuit="30-71234567-9",
        razon_social="Test SRL",
        location_pais="AR",
    )
    assert company.cuit == "30-71234567-9"
    assert company.razon_social == "Test SRL"
    assert company.location_pais == "AR"


def test_canonical_company_valid_with_apollo_id() -> None:
    from leads_scrapper.models import CanonicalCompany

    company = CanonicalCompany(
        apollo_id="abc123",
        razon_social="Test SA",
    )
    assert company.apollo_id == "abc123"


def test_canonical_signal_serializes_data_jsonb() -> None:
    from leads_scrapper.models import CanonicalSignal, SignalType

    signal = CanonicalSignal(
        company_id="b3b6a900-0000-0000-0000-000000000001",
        type=SignalType.JOB_POSTING,
        source="bumeran",
        occurred_at=datetime(2026, 5, 13, tzinfo=timezone.utc),
        data={"titulo": "Head of Data", "url": "https://bumeran.com.ar/abc"},
        intent_weight=30.0,
        decay_half_life_days=30,
    )
    assert signal.data["titulo"] == "Head of Data"
    assert signal.intent_weight == 30.0


def test_canonical_contact_email_validates() -> None:
    from pydantic import ValidationError

    from leads_scrapper.models import CanonicalContact

    with pytest.raises(ValidationError):
        CanonicalContact(
            company_id="b3b6a900-0000-0000-0000-000000000001",
            full_name="Juan Pérez",
            email="not-an-email",
            source="apollo",
        )

    valid = CanonicalContact(
        company_id="b3b6a900-0000-0000-0000-000000000001",
        full_name="Juan Pérez",
        email="juan@example.com",
        source="apollo",
    )
    assert valid.email == "juan@example.com"
