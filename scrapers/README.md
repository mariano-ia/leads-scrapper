# leads-scrapper · Python jobs

## Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Tests
```bash
pytest                          # unit tests
pytest --cov=leads_scrapper     # con cobertura
```

## Lint y typecheck
```bash
ruff check src tests
ruff format src tests
mypy src
```

## Entry points (Week 2+)
- `python -m leads_scrapper.jobs.apollo_sync --mode delta`
- `python -m leads_scrapper.jobs.scrape_bumeran` (Week 3)
- (más en weeks siguientes)
