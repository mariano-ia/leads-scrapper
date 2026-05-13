"""Supabase client factory para jobs Python con service_role.

Esta es la única función que se usa en runtime en Week 1 — los tests
del resto de jobs van a mockear el cliente.
"""

from supabase import Client, create_client

from leads_scrapper.config import get_settings


def create_supabase_admin_client() -> Client:
    """Crea un cliente Supabase con service_role key (bypass RLS).

    SOLO usar en jobs/scrapers, NUNCA exponer en endpoints públicos.
    """
    settings = get_settings()
    return create_client(
        settings.next_public_supabase_url,
        settings.supabase_service_role_key,
    )
