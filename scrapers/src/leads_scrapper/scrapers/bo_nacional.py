"""Scraper Boletín Oficial Nacional · Sección Segunda (Sociedades).

Estrategia:
1. Descargar el JSON del día anterior con listado de avisos sección 2
2. Para cada aviso: extraer CUIT, razón social, tipo de acto, capital, fecha
3. Matchear contra companies (by CUIT, fallback razon_social fuzzy)
4. Si match → INSERT signal type=bo_act
5. Si no match → INSERT candidate_companies (banco para promote a universe)

Endpoint público: https://www.boletinoficial.gob.ar/
La API JSON pública es: /api/v1.0/avisos/getMatches con filtros, devuelve resultados de sección.

Para F0: scrape via HTML de https://www.boletinoficial.gob.ar/seccion/segunda con date filter.
Implementación mínima viable — la idea es probar el patrón signal completo
(detect → match → store) más que cubrir 100% de los actos.
"""

import re
from datetime import datetime, timezone
from typing import Any

import httpx
from bs4 import BeautifulSoup

from leads_scrapper.utils.logging import get_logger

logger = get_logger(__name__)

BO_LISTING_URL = "https://www.boletinoficial.gob.ar/seccion/segunda"

# Tipos de acto societario reconocidos en titulares del BO
ACT_TYPES = {
    "constitución": "constitucion",
    "constitucion": "constitucion",
    "ampliación de capital": "ampliacion_capital",
    "aumento de capital": "ampliacion_capital",
    "fusión": "fusion",
    "fusion": "fusion",
    "escisión": "escision",
    "escision": "escision",
    "cambio de objeto": "cambio_objeto",
    "modificación del objeto": "cambio_objeto",
    "disolución": "disolucion",
    "disolucion": "disolucion",
    "transformación": "transformacion",
    "transformacion": "transformacion",
}

CUIT_RE = re.compile(r"\b(\d{2}-?\d{8}-?\d{1})\b")
CAPITAL_RE = re.compile(r"\$\s*([\d\.,]+)", re.IGNORECASE)


def normalize_cuit(raw: str) -> str:
    """11 dígitos sin separadores."""
    return re.sub(r"\D", "", raw)


def detect_act_type(title: str) -> str | None:
    t = title.lower()
    for keyword, tipo in ACT_TYPES.items():
        if keyword in t:
            return tipo
    return None


def parse_capital(text: str) -> float | None:
    m = CAPITAL_RE.search(text)
    if not m:
        return None
    raw = m.group(1).replace(".", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


async def fetch_listing_html(client: httpx.AsyncClient, date_str: str | None = None) -> str:
    """Trae el HTML del listado de avisos de Sección Segunda.

    date_str: formato YYYY-MM-DD, default hoy.
    """
    params: dict[str, str] = {}
    if date_str:
        params["fecha"] = date_str
    response = await client.get(BO_LISTING_URL, params=params, timeout=30)
    response.raise_for_status()
    return response.text


def parse_listings(html: str) -> list[dict[str, Any]]:
    """Extrae avisos del HTML.

    El listing del BO tiene tarjetas/items con título, sumario, links a PDF.
    Esta implementación parsea best-effort. Cuando el HTML cambia hay que ajustar.
    """
    soup = BeautifulSoup(html, "lxml")
    avisos: list[dict[str, Any]] = []

    # Selector heurístico: buscar links con texto que parezca razón social + tipo
    for anchor in soup.select("a.aviso, .aviso-item, article a, .resultado a"):
        title = anchor.get_text(strip=True)
        if not title or len(title) < 5:
            continue
        href = anchor.get("href")
        full_text = anchor.parent.get_text(" ", strip=True) if anchor.parent else title

        cuit_match = CUIT_RE.search(full_text)
        act_type = detect_act_type(title) or detect_act_type(full_text)
        if not act_type and not cuit_match:
            continue  # no parece ser un acto societario

        avisos.append({
            "title": title,
            "url": href if isinstance(href, str) else None,
            "summary": full_text[:500],
            "cuit": normalize_cuit(cuit_match.group(1)) if cuit_match else None,
            "act_type": act_type,
            "capital": parse_capital(full_text),
        })

    logger.info("parsed BO listings", extra={"avisos_count": len(avisos)})
    return avisos


async def scrape_bo_nacional(date_str: str | None = None) -> list[dict[str, Any]]:
    """Pull + parse + retorna lista de avisos enriquecidos."""
    async with httpx.AsyncClient(headers={"User-Agent": "leads-scrapper/0.1 (yacare.io)"}) as client:
        html = await fetch_listing_html(client, date_str=date_str)
        avisos = parse_listings(html)
        return avisos
