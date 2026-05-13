# Leads Scrapper

Plataforma multi-tenant de señales de intent sobre PYMEs argentinas. Ver [`docs/superpowers/specs/2026-05-13-leads-scrapper-fase-0-design.md`](docs/superpowers/specs/2026-05-13-leads-scrapper-fase-0-design.md) para diseño completo.

## Quick start

### Pre-requisitos
- Node 20+ (usar `.nvmrc`)
- Python 3.11+
- Supabase CLI (https://supabase.com/docs/guides/cli)

### Setup
```bash
# Web
cd web
npm install
cp ../.env.example ../.env.local
# completar .env.local con tus keys
npm run dev

# Scrapers
cd ../scrapers
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

### Tests
```bash
cd web && npm test
cd scrapers && pytest
```

### Project layout
- `web/` — Next.js 14 app
- `scrapers/` — Python jobs y scrapers
- `supabase/migrations/` — SQL migrations (aplicar vía Supabase CLI o dashboard)
- `docs/superpowers/` — specs y planes de implementación
- `.github/workflows/` — CI y cron jobs

## Development workflow
Ver `CLAUDE.md` para guidelines de trabajo con Claude Code en este proyecto.
