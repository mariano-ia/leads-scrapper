"""Filtro de industrias basado en SIC codes (Standard Industrial Classification).

Apollo no expone tag IDs de industrias públicamente, pero SÍ devuelve sic_codes
en cada empresa. Filtramos localmente post-search usando rangos SIC conocidos.

Ref: https://www.osha.gov/data/sic-manual
"""

from typing import Iterable

# Mapeo: nombre de industria → lista de rangos (inclusive) o códigos exactos SIC.
# Cobertura aproximada de los 15 sectores priorizados para Yacaré.
TARGET_INDUSTRIES_SIC: dict[str, list[tuple[int, int]]] = {
    "information_technology_and_services": [
        (7370, 7379),  # Services-Computer programming, software, data processing
    ],
    "marketing_and_advertising": [
        (7310, 7319),  # Services-Advertising
    ],
    "retail": [
        (5200, 5999),  # Retail trade (broad)
    ],
    "construction": [
        (1500, 1799),  # Construction
    ],
    "logistics_and_supply_chain": [
        (4000, 4099),  # Railroad transportation
        (4200, 4299),  # Motor freight transportation, warehousing
        (4400, 4499),  # Water transportation
        (4500, 4599),  # Transportation by air
        (4600, 4699),  # Pipelines
        (4700, 4799),  # Transportation services
    ],
    "real_estate": [
        (6500, 6599),  # Real estate
    ],
    "food_and_beverages": [
        (2000, 2099),  # Food manufacturing
        (5400, 5499),  # Food stores
        (5800, 5899),  # Eating and drinking places
    ],
    "wholesale": [
        (5000, 5199),  # Wholesale trade
    ],
    "manufacturing": [
        (2200, 2299),  # Textiles
        (2300, 2399),  # Apparel
        (2400, 2599),  # Lumber, wood, furniture
        (2600, 2699),  # Paper
        (2700, 2799),  # Printing
        (2800, 2899),  # Chemicals
        (2900, 2999),  # Petroleum refining
        (3000, 3099),  # Rubber, plastics
        (3200, 3299),  # Stone, clay, glass
        (3300, 3399),  # Primary metal
        (3400, 3499),  # Fabricated metal
        (3500, 3599),  # Industrial machinery
        (3600, 3699),  # Electronic / electrical equip
        (3800, 3899),  # Instruments
    ],
    "professional_services": [
        (8100, 8199),  # Legal services
        (8700, 8799),  # Engineering, accounting, mgmt consulting
    ],
    "financial_services": [
        (6000, 6099),  # Depository institutions
        (6100, 6199),  # Non-depository credit
        (6200, 6299),  # Securities & commodities
        (6300, 6399),  # Insurance carriers
        (6400, 6499),  # Insurance agents
    ],
    "education_management": [
        (8200, 8299),  # Educational services
    ],
    "health_wellness_and_fitness": [
        (8000, 8099),  # Health services
        (7991, 7991),  # Physical fitness facilities
    ],
    "consumer_goods": [
        (3100, 3199),  # Leather and leather products
        (3900, 3999),  # Misc manufacturing (toys, jewelry, etc.)
    ],
    "automotive": [
        (3711, 3713),  # Motor vehicles + bodies
        (3714, 3714),  # Motor vehicle parts & accessories
        (5500, 5599),  # Auto dealers + gasoline stations
        (7530, 7549),  # Auto repair
    ],
}

# Excluidas explícitas (consistente con universe_master config "exclude_industries")
EXCLUDED_SIC: list[tuple[int, int]] = [
    (2100, 2199),  # Tobacco
    (3760, 3769),  # Guided missiles
    (3795, 3795),  # Tanks
    (7993, 7993),  # Coin-operated amusement (gambling)
    (8412, 8412),  # Museums (gambling-related... no, OK skip)
]


def _code_in_ranges(code: int, ranges: list[tuple[int, int]]) -> bool:
    return any(lo <= code <= hi for lo, hi in ranges)


def _parse_sic_codes(raw: Iterable) -> list[int]:
    """Parsea sic_codes que pueden venir como strings o ints."""
    out: list[int] = []
    for c in raw or []:
        try:
            # Apollo devuelve como string normalmente
            out.append(int(str(c).strip()))
        except (ValueError, TypeError):
            continue
    return out


def matches_target_industries(
    sic_codes: Iterable,
    *,
    allowed_industries: list[str] | None = None,
) -> bool:
    """Devuelve True si al menos un SIC code matchea las industrias allowed.

    Args:
        sic_codes: lista de SIC codes (strings o ints) del Apollo response.
        allowed_industries: lista de nombres en snake_case (keys de
            TARGET_INDUSTRIES_SIC). Si None → todas las del mapeo.

    También aplica EXCLUDED_SIC: si algún code está en excluidas, no matchea
    aunque también esté en allowed (ambivalencia hacia exclusión).
    """
    codes = _parse_sic_codes(sic_codes)
    if not codes:
        return False  # sin SIC info, descartamos por seguridad

    # Check exclusion first
    if any(_code_in_ranges(c, EXCLUDED_SIC) for c in codes):
        return False

    # Build allowed ranges
    if allowed_industries is None:
        allowed_industries = list(TARGET_INDUSTRIES_SIC.keys())

    allowed_ranges: list[tuple[int, int]] = []
    for ind in allowed_industries:
        ranges = TARGET_INDUSTRIES_SIC.get(ind.lower().replace(" ", "_").replace(",", "").replace("&", "and"))
        if ranges:
            allowed_ranges.extend(ranges)

    if not allowed_ranges:
        return False

    return any(_code_in_ranges(c, allowed_ranges) for c in codes)


def industry_label_for_sic(sic_codes: Iterable) -> str | None:
    """Devuelve el nombre de la industria del primer SIC code que matchea."""
    codes = _parse_sic_codes(sic_codes)
    for ind_name, ranges in TARGET_INDUSTRIES_SIC.items():
        if any(_code_in_ranges(c, ranges) for c in codes):
            return ind_name
    return None
