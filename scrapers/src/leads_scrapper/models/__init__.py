"""Canonical Pydantic models que reflejan el schema de Supabase."""

from leads_scrapper.models.canonical import (
    CanonicalCompany,
    CanonicalContact,
    CanonicalSignal,
    SignalType,
)

__all__ = [
    "CanonicalCompany",
    "CanonicalContact",
    "CanonicalSignal",
    "SignalType",
]
