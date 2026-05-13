"""Scraper Google News RSS por empresa.

Estrategia:
1. Por cada empresa del radar/top_growth, query Google News RSS con
   `"<razon_social>" OR site:<dominio>` (filtrando AR/es).
2. Parse del RSS XML → items con título, link, pubDate, description.
3. Cada item se materializa como signal `type=press_mention`.

Pros:
- 0 cost (Google News RSS es público y gratuito).
- Cobertura amplia (no depende de CUIT).
- Detección de eventos reales: rondas, lanzamientos, contrataciones C-level, expansión, fusiones.

Cons / caveats:
- Algunas noticias son ruido (homónimos, mentions tangenciales). Mitigamos
  con: filtro de dominio cuando es posible + dedup por URL + decay rápido.
- Google a veces rate-limita si abusás → batch con sleep + max 100 empresas
  por corrida.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from bs4 import BeautifulSoup

from leads_scrapper.utils.logging import get_logger

logger = get_logger(__name__)


GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"

# Palabras comunes que NO son nombres únicos de empresa — skip por completo
# o exigir contexto adicional. Si la razón social es solo una de estas, no
# vamos a Google News porque produce solo ruido.
COMMON_AMBIGUOUS_NAMES = {
    "humana", "humano", "humanos", "norte", "sur", "este", "oeste", "centro",
    "argentina", "buenos aires", "plus", "global", "central", "premium",
    "consultora", "estudio", "grupo", "abc", "argentina sa", "argentina srl",
    "consultores", "industria", "construcciones", "servicios", "argentina sas",
    "tecnologia", "tecnologias", "soluciones", "ingenieria",
}

# Sources spam conocidos que aparecen en Google News con guías falsas / SEO
SPAM_SOURCES = {
    "American Association of Teachers of Japanese",
}

# Solo aceptar noticias recientes (últimos N días)
MAX_AGE_DAYS = 90


def _clean_razon_social(razon_social: str) -> str:
    """Quita sufijos S.A./SRL/SAS de la razón social para queries más limpias."""
    rs = razon_social.strip()
    rs_clean = re.sub(r"\b(s\.?a\.?|srl|s\.?r\.?l\.?|sas|s\.?a\.?s\.?)\b\.?$", "", rs, flags=re.IGNORECASE).strip(" .,")
    return rs_clean or rs


def _build_query(razon_social: str, dominio: str | None) -> str:
    """Construye query para Google News con buena precisión.

    - `intitle:"<razon_social>"` exige que el nombre aparezca en el título → reduce ruido.
    - Excluye el propio dominio (about-us, careers) y agregadores ruidosos.
    """
    rs_clean = _clean_razon_social(razon_social)
    # Usar intitle: para forzar que el nombre esté en el título; reduce dramáticamente
    # los falsos positivos en nombres comunes (e.g. "Humana", "Norte", "Sur").
    parts = [f'intitle:"{rs_clean}"']
    if dominio:
        parts.append(f"-site:{dominio}")
    for blacklist in ("linkedin.com/company", "glassdoor.com", "indeed.com", "computrabajo.com"):
        parts.append(f"-site:{blacklist}")
    return " ".join(parts)


def _matches_company(title: str, razon_social: str) -> bool:
    """Filtro post-fetch defensivo: el título debe contener la RS como término."""
    rs_clean = _clean_razon_social(razon_social).lower()
    if len(rs_clean) < 4:
        return False  # nombres muy cortos = demasiado ruido
    text = title.lower()
    # Permite match con punto/coma alrededor: "Humana." o "(Humana)" cuentan
    return bool(re.search(rf"\b{re.escape(rs_clean)}\b", text))


def _categorize_news(title: str, summary: str) -> tuple[str, float]:
    """Clasifica la noticia y devuelve (label, intent_weight).

    Weights altos = señal fuerte de momento de compra:
    - funding/financing: 40
    - hiring (c-level): 30
    - hiring (tech/ai/data): 25
    - expansion / new product: 25
    - partnership / deal: 20
    - press mention general: 10
    """
    text = f"{title} {summary}".lower()
    if re.search(r"\b(ronda|funding|inversi[oó]n|invierte|recauda|capital seed|serie [a-c])\b", text):
        return ("funding_round", 40.0)
    if re.search(r"\b(designa|nombra|incorpora|nuevo cto|nuevo ceo|nueva cfo|head of|head digital|jefe digital|director general|chief)\b", text):
        return ("c_level_hire", 30.0)
    if re.search(r"\b(busca|contrata|hiring|incorporar|abrir vacante|posici[oó]n|talento)\b.*\b(ai|ia|data|automation|automatizaci[oó]n|machine learning|ml|product manager|cto|head of digital|software|developer|engineer)\b", text):
        return ("c_level_hire", 25.0)  # tech-hiring relevante para Yacaré
    if re.search(r"\b(lanza|lanzamiento|nuevo producto|expansi[oó]n|expande|abre|adquiere|adquisici[oó]n)\b", text):
        return ("expansion_or_launch", 25.0)
    if re.search(r"\b(alianza|partnership|acuerdo|firma con|joint venture)\b", text):
        return ("partnership", 20.0)
    return ("press_mention", 10.0)


async def fetch_news_for_company(
    client: httpx.AsyncClient,
    razon_social: str,
    dominio: str | None,
    *,
    lang: str = "es-419",
    country: str = "AR",
    max_items: int = 5,
) -> list[dict[str, Any]]:
    """Devuelve items recientes desde Google News RSS para esta empresa."""
    # Skip empresas con nombre ambiguo (solo 1 palabra común) sin dominio que ancle.
    rs_clean = _clean_razon_social(razon_social).lower()
    if rs_clean in COMMON_AMBIGUOUS_NAMES and not dominio:
        logger.info("skip ambiguous name without domain", extra={"razon_social": razon_social})
        return []
    if rs_clean in COMMON_AMBIGUOUS_NAMES:
        # Si es ambiguo pero hay dominio, igual demasiado ruido en news → skip
        # (Google News searches con intitle:"Humana" siempre van a traer "humana" como adjetivo).
        logger.info("skip ambiguous name", extra={"razon_social": razon_social, "dominio": dominio})
        return []

    query = _build_query(razon_social, dominio)
    params = {"q": query, "hl": lang, "gl": country, "ceid": f"{country}:{lang.split('-')[0]}"}
    url = f"{GOOGLE_NEWS_RSS}?{httpx.QueryParams(params)}"
    age_cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    try:
        response = await client.get(url, timeout=20)
        response.raise_for_status()
    except Exception as e:
        logger.warning("google news fetch failed", extra={"razon_social": razon_social, "err": str(e)})
        return []

    soup = BeautifulSoup(response.text, "xml")
    items: list[dict[str, Any]] = []
    for raw_item in soup.find_all("item"):
        if len(items) >= max_items:
            break
        title_el = raw_item.find("title")
        link_el = raw_item.find("link")
        pub_el = raw_item.find("pubDate")
        desc_el = raw_item.find("description")
        source_el = raw_item.find("source")
        if not title_el or not link_el:
            continue
        title = title_el.get_text(strip=True)
        # Defensa anti-ruido: si el título no contiene la RS como token, descartar.
        if not _matches_company(title, razon_social):
            continue
        source_name = source_el.get_text(strip=True) if source_el else "google_news"
        if source_name in SPAM_SOURCES:
            continue
        link = link_el.get_text(strip=True)
        summary_html = desc_el.get_text(strip=True) if desc_el else ""
        # description suele ser HTML con texto plano embebido
        summary = BeautifulSoup(summary_html, "lxml").get_text(" ", strip=True) if summary_html else ""
        try:
            occurred_at = parsedate_to_datetime(pub_el.get_text(strip=True)).astimezone(timezone.utc) if pub_el else datetime.now(timezone.utc)
        except Exception:
            occurred_at = datetime.now(timezone.utc)
        # Filtrar noticias viejas — relevancia decae rápido
        if occurred_at < age_cutoff:
            continue
        category, weight = _categorize_news(title, summary)
        items.append({
            "title": title,
            "url": link,
            "summary": summary[:500],
            "occurred_at": occurred_at.isoformat(),
            "source_name": source_name,
            "category": category,
            "intent_weight": weight,
        })
    logger.info(
        "google news fetched",
        extra={"razon_social": razon_social, "items": len(items)},
    )
    return items


async def fetch_news_batch(
    companies: list[dict[str, Any]],
    *,
    concurrency: int = 5,
    per_company_max: int = 5,
) -> dict[str, list[dict[str, Any]]]:
    """Pulls Google News para una lista de companies en paralelo.

    Cada company dict debe tener: id, razon_social, dominio (opcional).
    Devuelve dict[company_id] → list[news_items].
    """
    sem = asyncio.Semaphore(concurrency)
    results: dict[str, list[dict[str, Any]]] = {}

    async with httpx.AsyncClient(
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 leads-scrapper/0.1"
        },
        follow_redirects=True,
    ) as client:
        async def worker(c: dict[str, Any]) -> None:
            async with sem:
                items = await fetch_news_for_company(
                    client,
                    razon_social=c["razon_social"],
                    dominio=c.get("dominio"),
                    max_items=per_company_max,
                )
                results[c["id"]] = items

        await asyncio.gather(*(worker(c) for c in companies))

    return results
