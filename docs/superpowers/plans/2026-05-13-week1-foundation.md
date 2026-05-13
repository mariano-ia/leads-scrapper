# Week 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap el repo monorepo con scaffolding completo de Next.js + Python + migraciones SQL definidas + CI verde para ambos lenguajes + env config documentado. End state: el proyecto compila y los tests pasan, listo para Week 2 (Supabase project + Apollo integration).

**Architecture:** Monorepo con tres pedazos top-level: `web/` (Next.js 14), `scrapers/` (Python package), `supabase/migrations/` (SQL files no-aplicados). CI con dos jobs paralelos (web + scrapers) que se mergean en `ci.yml`. Cron workflows (`apollo_sync.yml`, `daily_scrape.yml`, `web_changes.yml`) creados pero solo scaffolding — invocan jobs Python que existen como stubs.

**Tech Stack:** Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + Vitest. Python 3.11+ + Pydantic 2 + pytest + ruff. Supabase CLI para migrations. GitHub Actions.

---

## File Structure

Files a crear en Week 1:

```
.
├── .gitignore                              # Ignore patterns multi-lenguaje
├── .env.example                            # Template de env vars (sin secrets)
├── README.md                               # Setup + dev commands
├── docs/                                   # (ya existe)
│   └── superpowers/
├── web/                                    # Next.js workspace
│   ├── .nvmrc                              # Node 20
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── vitest.config.ts
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                        # Landing temporal "Leads Scrapper"
│   │   └── globals.css
│   ├── components/
│   │   └── ui/                             # shadcn placeholder (lo poblamos en Week 5)
│   ├── lib/
│   │   ├── env.ts                          # Validación de env con Zod
│   │   └── supabase/
│   │       ├── client.ts                   # Browser client (stub)
│   │       └── server.ts                   # Server client (stub)
│   └── tests/
│       └── smoke.test.ts                   # Test smoke que web boota
├── scrapers/                               # Python package
│   ├── pyproject.toml
│   ├── README.md                           # Quick reference
│   ├── src/
│   │   └── leads_scrapper/
│   │       ├── __init__.py
│   │       ├── config.py                   # Pydantic settings desde env
│   │       ├── clients/
│   │       │   ├── __init__.py
│   │       │   ├── apollo.py               # Stub con interface
│   │       │   ├── anthropic_client.py     # Stub
│   │       │   ├── resend_client.py        # Stub
│   │       │   └── supabase_client.py      # Stub
│   │       ├── scrapers/
│   │       │   └── __init__.py
│   │       ├── jobs/
│   │       │   ├── __init__.py
│   │       │   └── apollo_sync.py          # Entry point stub
│   │       ├── models/
│   │       │   ├── __init__.py
│   │       │   └── canonical.py            # Pydantic models del spec
│   │       └── utils/
│   │           ├── __init__.py
│   │           └── logging.py              # Structured logging setup
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py
│       └── test_smoke.py                   # Verifica imports
├── supabase/
│   ├── config.toml
│   ├── seed.sql
│   └── migrations/
│       ├── 0001_globales.sql               # Tablas globales del spec §6.1
│       ├── 0002_org.sql                    # Tablas por-org del spec §6.2
│       ├── 0003_rls.sql                    # Policies del spec §6.3
│       ├── 0004_super_admins.sql           # spec §6.4
│       ├── 0005_signal_type_seed.sql       # Seed para pesos default
│       └── 0006_universe_master_seed.sql   # Seed para v1 del maestro
└── .github/
    └── workflows/
        ├── ci.yml                          # Tests + lint + typecheck
        ├── apollo_sync.yml                 # Cron stub
        ├── daily_scrape.yml                # Cron stub
        └── web_changes.yml                 # Cron stub
```

**Responsabilidades**:
- `web/` autónomo: tiene su propio `package.json`, build, tests
- `scrapers/` autónomo: tiene su propio `pyproject.toml`, build, tests
- `supabase/migrations/` son SQL puros, aplicables vía CLI o dashboard
- `.github/workflows/` orquesta CI + cron jobs

---

## Task 1: Repo bootstrap + .gitignore + README

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `.env.example`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# Node
node_modules/
.next/
out/
build/
dist/
*.tsbuildinfo
.npm
.yarn

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
*.egg-info/
.eggs/
.pytest_cache/
.ruff_cache/
.mypy_cache/
.venv/
venv/
env/

# Env files
.env
.env.local
.env.*.local
!.env.example

# IDE
.vscode/
.idea/
*.swp
.DS_Store

# Supabase local
supabase/.branches
supabase/.temp

# Misc
*.log
.cache
.turbo
```

- [ ] **Step 2: Create `.env.example`**

```bash
# === SUPABASE ===
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=

# === APOLLO ===
APOLLO_API_KEY=

# === ANTHROPIC ===
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6

# === RESEND ===
RESEND_API_KEY=
RESEND_FROM_EMAIL=leads@leads.yacare.io
RESEND_FROM_NAME=Leads Yacaré

# === WEB ===
NEXT_PUBLIC_APP_URL=http://localhost:3000

# === SUPER ADMIN SEED (one-time) ===
SUPER_ADMIN_EMAIL=marianonoceti@gmail.com
```

- [ ] **Step 3: Create `README.md`**

```markdown
# Leads Scrapper

Plataforma multi-tenant de señales de intent sobre PYMEs argentinas. Ver `docs/superpowers/specs/2026-05-13-leads-scrapper-fase-0-design.md` para diseño completo.

## Quick start

### Pre-requisitos
- Node 20+ (usar `.nvmrc`)
- Python 3.11+
- Supabase CLI (https://supabase.com/docs/guides/cli)

### Setup
\`\`\`bash
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
\`\`\`

### Tests
\`\`\`bash
cd web && npm test
cd scrapers && pytest
\`\`\`

### Project layout
- \`web/\` — Next.js 14 app
- \`scrapers/\` — Python jobs y scrapers
- \`supabase/migrations/\` — SQL migrations (aplicar vía Supabase CLI o dashboard)
- \`docs/superpowers/\` — specs y planes de implementación
- \`.github/workflows/\` — CI y cron jobs

## Development workflow
Ver \`CLAUDE.md\` para guidelines de trabajo con Claude Code en este proyecto.
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example README.md
git commit -m "chore: initialize repo with gitignore, env template, README"
```

---

## Task 2: Web — Next.js scaffolding

**Files:**
- Create: `web/.nvmrc`
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.mjs`
- Create: `web/tailwind.config.ts`
- Create: `web/postcss.config.mjs`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx`
- Create: `web/app/globals.css`

- [ ] **Step 1: Create `web/.nvmrc`**

```
20
```

- [ ] **Step 2: Create `web/package.json`**

```json
{
  "name": "@leads-scrapper/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.45.0",
    "@tanstack/react-query": "^5.59.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.453.0",
    "next": "14.2.16",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.53.0",
    "tailwind-merge": "^2.5.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/node": "^22.7.5",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.1",
    "eslint-config-next": "14.2.16",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.3",
    "vitest": "^2.1.2"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
```

- [ ] **Step 5: Create `web/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create `web/postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create `web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create `web/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leads Scrapper — Yacaré",
  description: "Plataforma multi-tenant de señales de intent sobre PYMEs argentinas",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Create `web/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Leads Scrapper</h1>
        <p className="text-gray-600">Yacaré · Fase 0 en construcción</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 10: Install deps and verify build**

```bash
cd web
npm install
npm run build
```

Expected: build completes con 0 errors.

- [ ] **Step 11: Commit**

```bash
git add web/
git commit -m "feat(web): scaffold next.js 14 app with tailwind"
```

---

## Task 3: Web — Vitest smoke test

**Files:**
- Create: `web/vitest.config.ts`
- Create: `web/tests/smoke.test.ts`

- [ ] **Step 1: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

- [ ] **Step 2: Write the failing test `web/tests/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest is configured and Node version is 20+", () => {
    const major = parseInt(process.versions.node.split(".")[0]!, 10);
    expect(major).toBeGreaterThanOrEqual(20);
  });

  it("project metadata is loadable from package.json", async () => {
    const pkg = await import("../package.json");
    expect(pkg.default.name).toBe("@leads-scrapper/web");
  });
});
```

- [ ] **Step 3: Run tests and verify pass**

```bash
cd web && npm test
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add web/vitest.config.ts web/tests/
git commit -m "test(web): add vitest smoke test"
```

---

## Task 4: Web — env validation + Supabase client stubs

**Files:**
- Create: `web/lib/env.ts`
- Create: `web/lib/supabase/client.ts`
- Create: `web/lib/supabase/server.ts`
- Create: `web/tests/env.test.ts`

- [ ] **Step 1: Write the failing test `web/tests/env.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("env validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    await expect(async () => {
      const mod = await import("../lib/env?missing-url-" + Date.now());
      mod.getPublicEnv();
    }).rejects.toThrow();
  });

  it("returns parsed env when all required vars present", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    const { getPublicEnv } = await import("../lib/env?ok-" + Date.now());
    const env = getPublicEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd web && npm test -- tests/env.test.ts
```

Expected: FAIL (`lib/env` not found).

- [ ] **Step 3: Implement `web/lib/env.ts`**

```ts
import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

const ServerEnvSchema = PublicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APOLLO_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_FROM_NAME: z.string().optional(),
});

export function getPublicEnv() {
  return PublicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}

export function getServerEnv() {
  return ServerEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    APOLLO_API_KEY: process.env.APOLLO_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_FROM_NAME: process.env.RESEND_FROM_NAME,
  });
}

export type PublicEnv = z.infer<typeof PublicEnvSchema>;
export type ServerEnv = z.infer<typeof ServerEnvSchema>;
```

- [ ] **Step 4: Implement `web/lib/supabase/client.ts`** (browser stub)

```ts
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "../env";

export function createSupabaseBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
```

- [ ] **Step 5: Implement `web/lib/supabase/server.ts`** (server stub)

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "../env";

export function createSupabaseServerClient() {
  const env = getServerEnv();
  const cookieStore = cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set() {
        // no-op on server (set via Response in Server Actions)
      },
      remove() {
        // no-op on server
      },
    },
  });
}

export function createSupabaseServiceClient() {
  const env = getServerEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { get: () => undefined, set: () => {}, remove: () => {} },
  });
}
```

- [ ] **Step 6: Run tests, verify pass**

```bash
cd web && npm test
```

Expected: all tests pass.

- [ ] **Step 7: Run typecheck**

```bash
cd web && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add web/lib/ web/tests/env.test.ts
git commit -m "feat(web): add zod env validation and supabase client stubs"
```

---

## Task 5: Scrapers — Python package scaffolding

**Files:**
- Create: `scrapers/pyproject.toml`
- Create: `scrapers/README.md`
- Create: `scrapers/src/leads_scrapper/__init__.py`
- Create: `scrapers/src/leads_scrapper/config.py`
- Create: `scrapers/tests/__init__.py`
- Create: `scrapers/tests/conftest.py`
- Create: `scrapers/tests/test_smoke.py`

- [ ] **Step 1: Create `scrapers/pyproject.toml`**

```toml
[project]
name = "leads-scrapper"
version = "0.1.0"
description = "Yacaré · Scrapers y jobs Python para Leads Scrapper"
readme = "README.md"
requires-python = ">=3.11"
dependencies = [
    "anthropic>=0.39.0",
    "beautifulsoup4>=4.12.3",
    "httpx>=0.27.0",
    "lxml>=5.3.0",
    "pdfplumber>=0.11.4",
    "pydantic>=2.9.0",
    "pydantic-settings>=2.5.0",
    "python-dotenv>=1.0.1",
    "supabase>=2.9.0",
    "tenacity>=9.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=5.0.0",
    "respx>=0.21.1",
    "ruff>=0.7.0",
    "mypy>=1.13.0",
    "types-beautifulsoup4>=4.12.0",
]

[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
addopts = "-v --tb=short"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "C4", "SIM", "RUF"]
ignore = ["E501"]  # line length handled by formatter

[tool.mypy]
python_version = "3.11"
strict = true
ignore_missing_imports = true
```

- [ ] **Step 2: Create `scrapers/README.md`**

```markdown
# leads-scrapper · Python jobs

## Setup
\`\`\`bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
\`\`\`

## Tests
\`\`\`bash
pytest                          # unit tests
pytest --cov=leads_scrapper     # con cobertura
\`\`\`

## Lint y typecheck
\`\`\`bash
ruff check src tests
ruff format src tests
mypy src
\`\`\`

## Entry points (Week 2+)
- \`python -m leads_scrapper.jobs.apollo_sync --mode delta\`
- \`python -m leads_scrapper.jobs.scrape_bumeran\`
- (más en weeks siguientes)
```

- [ ] **Step 3: Create `scrapers/src/leads_scrapper/__init__.py`**

```python
"""Leads Scrapper - Yacaré.

Scrapers y jobs Python para alimentar el universo de empresas y señales
de intent. Ver docs/superpowers/specs/ para diseño completo.
"""

__version__ = "0.1.0"
```

- [ ] **Step 4: Create `scrapers/src/leads_scrapper/config.py`**

```python
"""Settings loaded from environment variables, validated by Pydantic."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Supabase
    next_public_supabase_url: str = Field(..., alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_project_ref: str | None = Field(None, alias="SUPABASE_PROJECT_REF")

    # Apollo
    apollo_api_key: str | None = Field(None, alias="APOLLO_API_KEY")

    # Anthropic
    anthropic_api_key: str | None = Field(None, alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field("claude-sonnet-4-6", alias="ANTHROPIC_MODEL")

    # Resend
    resend_api_key: str | None = Field(None, alias="RESEND_API_KEY")
    resend_from_email: str | None = Field(None, alias="RESEND_FROM_EMAIL")
    resend_from_name: str | None = Field(None, alias="RESEND_FROM_NAME")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
```

- [ ] **Step 5: Create `scrapers/tests/__init__.py`** (empty file)

```python
```

- [ ] **Step 6: Create `scrapers/tests/conftest.py`**

```python
"""Pytest fixtures compartidos."""

import os

import pytest


@pytest.fixture(autouse=True)
def isolate_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Limpia env vars que podrían contaminar tests."""
    for var in [
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "APOLLO_API_KEY",
        "ANTHROPIC_API_KEY",
        "RESEND_API_KEY",
    ]:
        monkeypatch.delenv(var, raising=False)
```

- [ ] **Step 7: Write the failing test `scrapers/tests/test_smoke.py`**

```python
"""Smoke tests: el package se importa y la config valida."""

import pytest


def test_package_imports() -> None:
    import leads_scrapper

    assert leads_scrapper.__version__ == "0.1.0"


def test_config_raises_when_required_vars_missing() -> None:
    # Sin env vars seteadas (gracias a conftest.isolate_env)
    from pydantic import ValidationError

    from leads_scrapper.config import Settings

    with pytest.raises(ValidationError):
        Settings()  # type: ignore[call-arg]


def test_config_loads_when_required_vars_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    from leads_scrapper.config import Settings

    settings = Settings()  # type: ignore[call-arg]
    assert settings.next_public_supabase_url == "https://example.supabase.co"
    assert settings.supabase_service_role_key == "test-key"
    assert settings.anthropic_model == "claude-sonnet-4-6"
```

- [ ] **Step 8: Install deps and run tests**

```bash
cd scrapers
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

Expected: 3 tests pass.

- [ ] **Step 9: Run linter and typecheck**

```bash
cd scrapers
ruff check src tests
mypy src
```

Expected: 0 issues.

- [ ] **Step 10: Commit**

```bash
git add scrapers/
git commit -m "feat(scrapers): scaffold python package with pydantic settings and smoke tests"
```

---

## Task 6: Scrapers — Pydantic canonical models

**Files:**
- Create: `scrapers/src/leads_scrapper/models/__init__.py`
- Create: `scrapers/src/leads_scrapper/models/canonical.py`
- Create: `scrapers/tests/models/__init__.py`
- Create: `scrapers/tests/models/test_canonical.py`

- [ ] **Step 1: Create `scrapers/src/leads_scrapper/models/__init__.py`**

```python
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
```

- [ ] **Step 2: Write the failing test `scrapers/tests/models/test_canonical.py`**

```python
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

    # Falta tanto apollo_id como cuit
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
```

- [ ] **Step 3: Create empty `scrapers/tests/models/__init__.py`**

```python
```

- [ ] **Step 4: Run test, verify it fails**

```bash
cd scrapers && pytest tests/models/test_canonical.py
```

Expected: FAIL (models don't exist).

- [ ] **Step 5: Implement `scrapers/src/leads_scrapper/models/canonical.py`**

```python
"""Modelos canónicos alineados con el schema de Supabase.

Ver docs/superpowers/specs/2026-05-13-leads-scrapper-fase-0-design.md §6
"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class SignalType(str, Enum):
    JOB_POSTING = "job_posting"
    BO_ACT = "bo_act"
    WEB_CHANGE = "web_change"
    APOLLO_HIRING = "apollo_hiring"


class CanonicalCompany(BaseModel):
    model_config = ConfigDict(extra="forbid")

    apollo_id: str | None = None
    cuit: str | None = None
    razon_social: str
    nombre_comercial: str | None = None
    dominio: str | None = None
    sector: str | None = None
    subsector: str | None = None
    headcount_range: str | None = None
    founded_year: int | None = None
    location_pais: str = "AR"
    location_provincia: str | None = None
    location_ciudad: str | None = None
    tech_stack: list[str] = Field(default_factory=list)
    apollo_data: dict[str, Any] | None = None

    @model_validator(mode="after")
    def require_apollo_id_or_cuit(self) -> "CanonicalCompany":
        if self.apollo_id is None and self.cuit is None:
            raise ValueError(
                "company must have either apollo_id or cuit as identity"
            )
        return self


class CanonicalContact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company_id: str
    apollo_person_id: str | None = None
    full_name: str
    title: str | None = None
    email: EmailStr | None = None
    email_status: str | None = None
    linkedin_url: str | None = None
    phone: str | None = None
    is_decision_maker: bool = False
    source: str


class CanonicalSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company_id: str
    type: SignalType
    source: str
    occurred_at: datetime
    detected_at: datetime | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    intent_weight: float
    decay_half_life_days: int
```

- [ ] **Step 6: Run tests, verify pass**

```bash
cd scrapers && pytest tests/models/test_canonical.py
```

Expected: 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add scrapers/src/leads_scrapper/models/ scrapers/tests/models/
git commit -m "feat(scrapers): add canonical pydantic models for company, contact, signal"
```

---

## Task 7: Scrapers — Client stubs (Apollo, Anthropic, Resend, Supabase)

**Files:**
- Create: `scrapers/src/leads_scrapper/clients/__init__.py`
- Create: `scrapers/src/leads_scrapper/clients/apollo.py`
- Create: `scrapers/src/leads_scrapper/clients/anthropic_client.py`
- Create: `scrapers/src/leads_scrapper/clients/resend_client.py`
- Create: `scrapers/src/leads_scrapper/clients/supabase_client.py`
- Create: `scrapers/tests/clients/__init__.py`
- Create: `scrapers/tests/clients/test_stubs.py`

- [ ] **Step 1: Write the failing test `scrapers/tests/clients/test_stubs.py`**

```python
"""Tests que validan que los stubs de clients existen e importan limpios."""

import pytest


def test_apollo_client_importable() -> None:
    from leads_scrapper.clients.apollo import ApolloClient

    assert ApolloClient is not None


def test_apollo_client_requires_api_key() -> None:
    from leads_scrapper.clients.apollo import ApolloClient

    with pytest.raises(ValueError, match="api_key"):
        ApolloClient(api_key="")


def test_anthropic_client_importable() -> None:
    from leads_scrapper.clients.anthropic_client import AnthropicLLMClient

    assert AnthropicLLMClient is not None


def test_resend_client_importable() -> None:
    from leads_scrapper.clients.resend_client import ResendEmailClient

    assert ResendEmailClient is not None


def test_supabase_client_importable() -> None:
    from leads_scrapper.clients.supabase_client import create_supabase_admin_client

    assert callable(create_supabase_admin_client)
```

- [ ] **Step 2: Create empty `scrapers/tests/clients/__init__.py`**

```python
```

- [ ] **Step 3: Run test, verify fail**

```bash
cd scrapers && pytest tests/clients/test_stubs.py
```

Expected: FAIL (modules don't exist).

- [ ] **Step 4: Implement `scrapers/src/leads_scrapper/clients/__init__.py`**

```python
"""External service clients."""
```

- [ ] **Step 5: Implement `scrapers/src/leads_scrapper/clients/apollo.py`** (stub)

```python
"""Apollo.io API client.

Implementación completa en Week 2. Este stub define la interfaz pública
y valida config para que el resto del código pueda importar y typecheckear.
"""

from typing import Any


class ApolloClient:
    """Thin wrapper sobre Apollo REST API con retry y budget guardrail.

    Implementación de métodos en Week 2:
        - search_accounts()
        - search_people()
        - get_credit_balance()
    """

    BASE_URL = "https://api.apollo.io/v1"

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key

    async def search_accounts(self, **filters: Any) -> dict[str, Any]:
        """TODO Week 2: implementar /accounts/search con paginación."""
        raise NotImplementedError("Implemented in Week 2 plan")

    async def search_people(self, **filters: Any) -> dict[str, Any]:
        """TODO Week 2: implementar /mixed_people/search."""
        raise NotImplementedError("Implemented in Week 2 plan")

    async def get_credit_balance(self) -> int:
        """TODO Week 2: retornar créditos restantes del mes."""
        raise NotImplementedError("Implemented in Week 2 plan")
```

- [ ] **Step 6: Implement `scrapers/src/leads_scrapper/clients/anthropic_client.py`** (stub)

```python
"""Anthropic Claude API wrapper.

Implementación completa en Week 4 (cuando llegamos a LLM filter + briefs).
"""

from typing import Any


class AnthropicLLMClient:
    """Wrapper con prompt caching para LLM filter y AI brief generation."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.model = model

    async def score_company(
        self,
        company: dict[str, Any],
        signals: list[dict[str, Any]],
        icp_text: str,
    ) -> dict[str, Any]:
        """TODO Week 4: prompt estructurado, return {score, reasoning}."""
        raise NotImplementedError("Implemented in Week 4 plan")

    async def generate_brief(
        self,
        company: dict[str, Any],
        signals: list[dict[str, Any]],
        contacts: list[dict[str, Any]],
    ) -> str:
        """TODO Week 4: prompt narrativo, return brief 80-150 palabras."""
        raise NotImplementedError("Implemented in Week 4 plan")
```

- [ ] **Step 7: Implement `scrapers/src/leads_scrapper/clients/resend_client.py`** (stub)

```python
"""Resend email API wrapper.

Implementación completa en Week 7.
"""

from typing import Any


class ResendEmailClient:
    """Wrapper para envíos transaccionales."""

    def __init__(
        self,
        api_key: str,
        from_email: str,
        from_name: str,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.from_email = from_email
        self.from_name = from_name

    async def send_alert_email(
        self,
        to: str,
        subject: str,
        html_body: str,
    ) -> dict[str, Any]:
        """TODO Week 7."""
        raise NotImplementedError("Implemented in Week 7 plan")
```

- [ ] **Step 8: Implement `scrapers/src/leads_scrapper/clients/supabase_client.py`**

```python
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
```

- [ ] **Step 9: Run tests, verify pass**

```bash
cd scrapers && pytest tests/clients/test_stubs.py
```

Expected: 5 tests pass.

- [ ] **Step 10: Run typecheck**

```bash
cd scrapers && mypy src
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add scrapers/src/leads_scrapper/clients/ scrapers/tests/clients/
git commit -m "feat(scrapers): scaffold client stubs (apollo, anthropic, resend, supabase)"
```

---

## Task 8: Scrapers — Logging utility + entry point stub

**Files:**
- Create: `scrapers/src/leads_scrapper/utils/__init__.py`
- Create: `scrapers/src/leads_scrapper/utils/logging.py`
- Create: `scrapers/src/leads_scrapper/jobs/__init__.py`
- Create: `scrapers/src/leads_scrapper/jobs/apollo_sync.py`
- Create: `scrapers/tests/utils/__init__.py`
- Create: `scrapers/tests/utils/test_logging.py`

- [ ] **Step 1: Create `scrapers/src/leads_scrapper/utils/__init__.py`**

```python
"""Utilities cross-cutting."""
```

- [ ] **Step 2: Write failing test `scrapers/tests/utils/test_logging.py`**

```python
"""Test structured logging setup."""

import logging
from io import StringIO


def test_get_logger_returns_named_logger() -> None:
    from leads_scrapper.utils.logging import get_logger

    logger = get_logger("test.module")
    assert logger.name == "test.module"


def test_logger_outputs_structured_json(caplog: object) -> None:  # noqa: ANN001
    from leads_scrapper.utils.logging import get_logger, setup_logging

    buffer = StringIO()
    setup_logging(stream=buffer)
    logger = get_logger("test.json")
    logger.info("hello", extra={"company_id": "abc123"})

    output = buffer.getvalue()
    assert "hello" in output
    assert "company_id" in output
    assert "abc123" in output
```

- [ ] **Step 3: Create empty `scrapers/tests/utils/__init__.py`**

```python
```

- [ ] **Step 4: Implement `scrapers/src/leads_scrapper/utils/logging.py`**

```python
"""Structured logging setup. JSON output para CI/GitHub Actions logs limpios."""

import json
import logging
import sys
from typing import IO, Any


class JsonFormatter(logging.Formatter):
    """Formatter que emite cada log como una línea JSON."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
        }
        # Extra fields (e.g., logger.info("x", extra={"company_id": "..."}))
        reserved = {
            "name", "msg", "args", "levelname", "levelno", "pathname",
            "filename", "module", "exc_info", "exc_text", "stack_info",
            "lineno", "funcName", "created", "msecs", "relativeCreated",
            "thread", "threadName", "processName", "process", "message",
        }
        for key, value in record.__dict__.items():
            if key not in reserved:
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def setup_logging(
    level: int = logging.INFO,
    stream: IO[str] | None = None,
) -> None:
    """Configura el root logger con JsonFormatter. Idempotente."""
    root = logging.getLogger()
    root.setLevel(level)
    # Limpia handlers previos
    for handler in list(root.handlers):
        root.removeHandler(handler)
    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Retorna un logger nombrado. Llamar setup_logging() una vez al inicio."""
    return logging.getLogger(name)
```

- [ ] **Step 5: Implement `scrapers/src/leads_scrapper/jobs/__init__.py`**

```python
"""Entry points for GitHub Actions cron jobs."""
```

- [ ] **Step 6: Implement `scrapers/src/leads_scrapper/jobs/apollo_sync.py`** (stub)

```python
"""Apollo sync job entry point.

Invocado por .github/workflows/apollo_sync.yml semanalmente.
Implementación completa en Week 2 plan.
"""

import argparse
import sys

from leads_scrapper.utils.logging import get_logger, setup_logging


def main(argv: list[str] | None = None) -> int:
    setup_logging()
    logger = get_logger("apollo_sync")

    parser = argparse.ArgumentParser(description="Apollo sync job")
    parser.add_argument(
        "--mode",
        choices=["initial", "delta", "targeted_contacts"],
        default="delta",
    )
    args = parser.parse_args(argv)

    logger.info("apollo_sync starting", extra={"mode": args.mode})
    logger.warning("Week 1 stub: not implemented yet, exiting 0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 7: Run tests**

```bash
cd scrapers && pytest tests/utils/test_logging.py
```

Expected: 2 tests pass.

- [ ] **Step 8: Smoke-run the entry point**

```bash
cd scrapers && python -m leads_scrapper.jobs.apollo_sync --mode delta
```

Expected: prints JSON logs y exits 0.

- [ ] **Step 9: Commit**

```bash
git add scrapers/src/leads_scrapper/utils/ scrapers/src/leads_scrapper/jobs/ scrapers/tests/utils/
git commit -m "feat(scrapers): add json logging and apollo_sync entry point stub"
```

---

## Task 9: Supabase migrations — globales

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/seed.sql`
- Create: `supabase/migrations/0001_globales.sql`

- [ ] **Step 1: Create `supabase/config.toml`**

```toml
# Supabase project config — generated by `supabase init`
project_id = "leads-scrapper"

[api]
enabled = true
port = 54321
schemas = ["public", "storage"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 15

[studio]
enabled = true
port = 54323

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]
jwt_expiry = 3600
enable_signup = false  # solo via invite en F0
```

- [ ] **Step 2: Create `supabase/seed.sql`** (vacío por ahora)

```sql
-- Seed data se aplica via migrations 0005 y 0006.
```

- [ ] **Step 3: Create `supabase/migrations/0001_globales.sql`**

Contenido completo del schema globales del spec §6.1. (Long file — copy-paste del spec):

```sql
-- Migration 0001: tablas globales (sin org_id)
-- Ver docs/superpowers/specs/2026-05-13-leads-scrapper-fase-0-design.md §6.1

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- para fuzzy matching de razón social

-- =============================================================================
-- universe_master_versions
-- =============================================================================
CREATE TABLE universe_master_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_int int NOT NULL UNIQUE,
  config jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deactivated_at timestamptz,
  is_active bool NOT NULL DEFAULT false,
  companies_count_snapshot int,
  credits_used_to_build int
);

CREATE UNIQUE INDEX universe_master_one_active
  ON universe_master_versions (is_active)
  WHERE is_active = true;

-- =============================================================================
-- companies
-- =============================================================================
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apollo_id text UNIQUE,
  cuit text UNIQUE,
  razon_social text NOT NULL,
  nombre_comercial text,
  dominio text,
  sector text,
  subsector text,
  headcount_range text,
  founded_year int,
  location_pais text NOT NULL DEFAULT 'AR',
  location_provincia text,
  location_ciudad text,
  tech_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  apollo_data jsonb,
  status text NOT NULL DEFAULT 'active',
  merged_into_id uuid REFERENCES companies(id),
  last_apollo_sync_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_must_have_id CHECK (
    apollo_id IS NOT NULL OR cuit IS NOT NULL
  ),
  CONSTRAINT companies_status_valid CHECK (
    status IN ('active', 'inactive', 'merged_into')
  )
);

CREATE INDEX idx_companies_sector ON companies(sector) WHERE status = 'active';
CREATE INDEX idx_companies_provincia ON companies(location_provincia) WHERE status = 'active';
CREATE INDEX idx_companies_headcount ON companies(headcount_range) WHERE status = 'active';
CREATE INDEX idx_companies_tech ON companies USING gin (tech_stack);
CREATE INDEX idx_companies_dominio ON companies(dominio) WHERE dominio IS NOT NULL;
CREATE INDEX idx_companies_razon_social_trgm ON companies USING gin (razon_social gin_trgm_ops);

-- =============================================================================
-- company_contacts
-- =============================================================================
CREATE TABLE company_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  apollo_person_id text,
  full_name text NOT NULL,
  title text,
  email text,
  email_status text,
  linkedin_url text,
  phone text,
  is_decision_maker bool NOT NULL DEFAULT false,
  source text NOT NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

CREATE INDEX idx_company_contacts_company ON company_contacts(company_id);
CREATE INDEX idx_company_contacts_apollo_id
  ON company_contacts(apollo_person_id) WHERE apollo_person_id IS NOT NULL;

-- =============================================================================
-- signals
-- =============================================================================
CREATE TABLE signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL,
  source text NOT NULL,
  occurred_at timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  intent_weight numeric(5,2) NOT NULL,
  decay_half_life_days int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signals_type_valid CHECK (
    type IN ('job_posting', 'bo_act', 'web_change', 'apollo_hiring')
  )
);

CREATE INDEX idx_signals_company_occurred ON signals(company_id, occurred_at DESC);
CREATE INDEX idx_signals_type_occurred ON signals(type, occurred_at DESC);
CREATE INDEX idx_signals_recent
  ON signals(occurred_at DESC)
  WHERE occurred_at > now() - interval '180 days';

-- =============================================================================
-- signal_type_config
-- =============================================================================
CREATE TABLE signal_type_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  variant text,
  intent_weight numeric(5,2) NOT NULL,
  decay_half_life_days int NOT NULL,
  match_rules jsonb,
  active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type, variant)
);

-- =============================================================================
-- apollo_sync_runs
-- =============================================================================
CREATE TABLE apollo_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  master_version_id uuid REFERENCES universe_master_versions(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  companies_added int NOT NULL DEFAULT 0,
  companies_updated int NOT NULL DEFAULT 0,
  contacts_added int NOT NULL DEFAULT 0,
  contacts_updated int NOT NULL DEFAULT 0,
  credits_used int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  aborted_reason text,
  CONSTRAINT apollo_runs_mode_valid CHECK (
    mode IN ('initial', 'delta', 'targeted_contacts')
  ),
  CONSTRAINT apollo_runs_status_valid CHECK (
    status IN ('running', 'completed', 'failed', 'aborted')
  )
);

CREATE INDEX idx_apollo_runs_started ON apollo_sync_runs(started_at DESC);

-- =============================================================================
-- scrape_runs
-- =============================================================================
CREATE TABLE scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  items_scraped int NOT NULL DEFAULT 0,
  signals_inserted int NOT NULL DEFAULT 0,
  companies_matched int NOT NULL DEFAULT 0,
  items_unmatched int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT scrape_runs_status_valid CHECK (
    status IN ('running', 'completed', 'failed', 'aborted')
  )
);

CREATE INDEX idx_scrape_runs_source_started ON scrape_runs(source, started_at DESC);

-- =============================================================================
-- candidate_companies
-- =============================================================================
CREATE TABLE candidate_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuit text UNIQUE,
  razon_social text NOT NULL,
  source text NOT NULL,
  source_data jsonb,
  detection_count int NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  promoted_to_company_id uuid REFERENCES companies(id)
);

CREATE INDEX idx_candidate_razon_social_trgm
  ON candidate_companies USING gin (razon_social gin_trgm_ops);

-- =============================================================================
-- apollo_budget_config / usage / alerts
-- =============================================================================
CREATE TABLE apollo_budget_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_budget_credits int NOT NULL,
  alert_thresholds_pct int[] NOT NULL DEFAULT ARRAY[70, 85, 95],
  hard_stop_pct int NOT NULL DEFAULT 100,
  alert_emails text[] NOT NULL DEFAULT '{}',
  apollo_plan_name text,
  apollo_plan_monthly_usd numeric(8,2),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE apollo_credit_usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL UNIQUE,
  credits_used int NOT NULL DEFAULT 0,
  last_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE apollo_budget_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month text NOT NULL,
  threshold_pct int NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  credits_used_at_alert int NOT NULL,
  UNIQUE (year_month, threshold_pct)
);

-- =============================================================================
-- universe_metrics_snapshots
-- =============================================================================
CREATE TABLE universe_metrics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at timestamptz NOT NULL DEFAULT now(),
  master_version_id uuid REFERENCES universe_master_versions(id),
  companies_count int NOT NULL,
  contacts_count int NOT NULL,
  companies_with_email_count int NOT NULL,
  companies_with_dm_count int NOT NULL,
  by_sector jsonb,
  by_provincia jsonb,
  by_headcount_range jsonb,
  signals_last_7d int,
  signals_last_30d int
);

-- =============================================================================
-- updated_at trigger helper
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER company_contacts_updated_at BEFORE UPDATE ON company_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml supabase/seed.sql supabase/migrations/0001_globales.sql
git commit -m "feat(supabase): add migration 0001 with global tables (companies, signals, etc.)"
```

---

## Task 10: Supabase migrations — tablas por-org

**Files:**
- Create: `supabase/migrations/0002_org.sql`

- [ ] **Step 1: Create `supabase/migrations/0002_org.sql`**

```sql
-- Migration 0002: tablas por-org (con org_id)
-- Ver docs/superpowers/specs/2026-05-13-leads-scrapper-fase-0-design.md §6.2

-- =============================================================================
-- orgs
-- =============================================================================
CREATE TABLE orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER orgs_updated_at BEFORE UPDATE ON orgs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- org_members
-- =============================================================================
CREATE TABLE org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id),
  CONSTRAINT org_members_role_valid CHECK (role IN ('admin', 'member'))
);

CREATE INDEX idx_org_members_user ON org_members(user_id);

-- =============================================================================
-- invitations
-- =============================================================================
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL,
  token text UNIQUE NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_role_valid CHECK (role IN ('admin', 'member'))
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- =============================================================================
-- org_universe_targets
-- =============================================================================
CREATE TABLE org_universe_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  version_int int NOT NULL,
  config jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deactivated_at timestamptz,
  is_active bool NOT NULL DEFAULT false,
  companies_count_snapshot int,
  UNIQUE (org_id, version_int)
);

CREATE UNIQUE INDEX idx_org_universe_one_active_per_org
  ON org_universe_targets (org_id)
  WHERE is_active = true;

-- =============================================================================
-- searches
-- =============================================================================
CREATE TABLE searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL,
  llm_filter_text text,
  min_combined_score numeric(5,3) NOT NULL DEFAULT 0.300,
  alert_enabled bool NOT NULL DEFAULT false,
  alert_email text,
  digest_mode text NOT NULL DEFAULT 'immediate',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT searches_digest_mode_valid CHECK (digest_mode IN ('immediate', 'daily'))
);

CREATE TRIGGER searches_updated_at BEFORE UPDATE ON searches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_searches_org_active ON searches(org_id) WHERE active = true;

-- =============================================================================
-- org_companies
-- =============================================================================
CREATE TABLE org_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_matched_at timestamptz NOT NULL DEFAULT now(),
  last_search_id uuid REFERENCES searches(id),
  last_fit_score numeric(5,3),
  last_intent_score numeric(8,3),
  last_combined_score numeric(8,3),
  last_llm_score numeric(5,2),
  last_llm_reasoning text,
  last_scored_at timestamptz,
  ai_brief text,
  ai_brief_generated_at timestamptz,
  status text NOT NULL DEFAULT 'new',
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, company_id),
  CONSTRAINT org_companies_status_valid CHECK (
    status IN ('new', 'reviewed', 'qualified', 'disqualified', 'in_pipeline')
  )
);

CREATE INDEX idx_org_companies_org ON org_companies(org_id);
CREATE INDEX idx_org_companies_score ON org_companies(org_id, last_combined_score DESC);
CREATE INDEX idx_org_companies_status ON org_companies(org_id, status);

-- =============================================================================
-- org_company_owners
-- =============================================================================
CREATE TABLE org_company_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE (org_company_id, user_id)
);

CREATE INDEX idx_org_company_owners_oc ON org_company_owners(org_company_id);

-- =============================================================================
-- org_company_notes
-- =============================================================================
CREATE TABLE org_company_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER org_company_notes_updated_at BEFORE UPDATE ON org_company_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_org_company_notes_oc ON org_company_notes(org_company_id, created_at DESC);

-- =============================================================================
-- org_company_status_history
-- =============================================================================
CREATE TABLE org_company_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason text,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_history_oc ON org_company_status_history(org_company_id, changed_at DESC);

-- =============================================================================
-- org_company_owner_history
-- =============================================================================
CREATE TABLE org_company_owner_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES org_companies(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES auth.users(id),
  to_user_id uuid REFERENCES auth.users(id),
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_owner_history_oc ON org_company_owner_history(org_company_id, changed_at DESC);

-- =============================================================================
-- alert_dispatches
-- =============================================================================
CREATE TABLE alert_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  search_id uuid NOT NULL REFERENCES searches(id),
  org_company_id uuid NOT NULL REFERENCES org_companies(id),
  channel text NOT NULL,
  recipient text NOT NULL,
  digest_mode text NOT NULL,
  resend_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent',
  CONSTRAINT alert_dispatches_status_valid CHECK (status IN ('sent', 'bounced', 'failed'))
);

CREATE INDEX idx_alert_dispatches_org ON alert_dispatches(org_id, sent_at DESC);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0002_org.sql
git commit -m "feat(supabase): add migration 0002 with per-org tables"
```

---

## Task 11: Supabase migrations — super_admins + RLS policies + seeds

**Files:**
- Create: `supabase/migrations/0003_super_admins.sql`
- Create: `supabase/migrations/0004_rls.sql`
- Create: `supabase/migrations/0005_signal_type_seed.sql`
- Create: `supabase/migrations/0006_universe_master_seed.sql`
- Create: `supabase/migrations/0007_apollo_budget_seed.sql`

- [ ] **Step 1: Create `supabase/migrations/0003_super_admins.sql`**

```sql
-- Migration 0003: super_admins + helper functions
-- Ver spec §6.4

CREATE TABLE super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

-- Helper functions

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.user_is_member_of(target_org_id uuid)
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = target_org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_admin_of(target_org_id uuid)
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = target_org_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;
```

- [ ] **Step 2: Create `supabase/migrations/0004_rls.sql`**

```sql
-- Migration 0004: Row Level Security policies
-- Ver spec §6.3

-- =============================================================================
-- Tablas globales: lectura para authenticated, escritura solo service_role
-- =============================================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_type_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE apollo_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE universe_master_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE universe_metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE apollo_budget_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE apollo_credit_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE apollo_budget_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- Read access para todos los autenticados
CREATE POLICY companies_read ON companies FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY company_contacts_read ON company_contacts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY signals_read ON signals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY signal_type_config_read ON signal_type_config FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY scrape_runs_read ON scrape_runs FOR SELECT USING (auth.role() = 'authenticated');

-- Super-admin only para budget y universe master
CREATE POLICY apollo_budget_config_admin ON apollo_budget_config FOR ALL USING (is_super_admin());
CREATE POLICY apollo_credit_usage_admin_read ON apollo_credit_usage_monthly FOR SELECT USING (is_super_admin());
CREATE POLICY apollo_sync_runs_admin_read ON apollo_sync_runs FOR SELECT USING (is_super_admin());
CREATE POLICY apollo_budget_alerts_admin_read ON apollo_budget_alerts FOR SELECT USING (is_super_admin());
CREATE POLICY universe_master_versions_admin ON universe_master_versions FOR ALL USING (is_super_admin());
CREATE POLICY universe_metrics_admin_read ON universe_metrics_snapshots FOR SELECT USING (is_super_admin());
CREATE POLICY candidate_companies_admin ON candidate_companies FOR ALL USING (is_super_admin());
CREATE POLICY super_admins_self ON super_admins FOR SELECT USING (user_id = auth.uid() OR is_super_admin());

-- =============================================================================
-- Tablas por-org: members ven su org, admins gestionan
-- =============================================================================
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_universe_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_company_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_company_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_company_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_company_owner_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_dispatches ENABLE ROW LEVEL SECURITY;

-- orgs: members ven su org; super-admin todas; crear solo super-admin
CREATE POLICY orgs_select ON orgs FOR SELECT
  USING (user_is_member_of(id) OR is_super_admin());
CREATE POLICY orgs_insert ON orgs FOR INSERT
  WITH CHECK (is_super_admin());
CREATE POLICY orgs_update ON orgs FOR UPDATE
  USING (user_is_admin_of(id) OR is_super_admin());
CREATE POLICY orgs_delete ON orgs FOR DELETE
  USING (is_super_admin());

-- org_members: members ven members de su org; admins agregan/sacan
CREATE POLICY org_members_select ON org_members FOR SELECT
  USING (user_is_member_of(org_id) OR is_super_admin());
CREATE POLICY org_members_insert ON org_members FOR INSERT
  WITH CHECK (user_is_admin_of(org_id) OR is_super_admin());
CREATE POLICY org_members_update ON org_members FOR UPDATE
  USING (user_is_admin_of(org_id) OR is_super_admin());
CREATE POLICY org_members_delete ON org_members FOR DELETE
  USING (user_is_admin_of(org_id) OR is_super_admin());

-- invitations: admins ven y crean
CREATE POLICY invitations_select ON invitations FOR SELECT
  USING (user_is_admin_of(org_id) OR is_super_admin());
CREATE POLICY invitations_insert ON invitations FOR INSERT
  WITH CHECK (user_is_admin_of(org_id) OR is_super_admin());
CREATE POLICY invitations_update ON invitations FOR UPDATE
  USING (user_is_admin_of(org_id) OR is_super_admin());
CREATE POLICY invitations_delete ON invitations FOR DELETE
  USING (user_is_admin_of(org_id) OR is_super_admin());

-- Pattern repetido para tablas con member access:
-- searches, org_universe_targets, org_companies, org_company_owners,
-- org_company_notes, org_company_status_history, org_company_owner_history,
-- alert_dispatches

-- searches
CREATE POLICY searches_select ON searches FOR SELECT USING (user_is_member_of(org_id));
CREATE POLICY searches_insert ON searches FOR INSERT WITH CHECK (user_is_member_of(org_id));
CREATE POLICY searches_update ON searches FOR UPDATE USING (user_is_member_of(org_id));
CREATE POLICY searches_delete ON searches FOR DELETE USING (user_is_admin_of(org_id));

-- org_universe_targets
CREATE POLICY org_universe_select ON org_universe_targets FOR SELECT USING (user_is_member_of(org_id));
CREATE POLICY org_universe_insert ON org_universe_targets FOR INSERT WITH CHECK (user_is_admin_of(org_id));
CREATE POLICY org_universe_update ON org_universe_targets FOR UPDATE USING (user_is_admin_of(org_id));

-- org_companies
CREATE POLICY org_companies_select ON org_companies FOR SELECT USING (user_is_member_of(org_id));
CREATE POLICY org_companies_insert ON org_companies FOR INSERT WITH CHECK (user_is_member_of(org_id));
CREATE POLICY org_companies_update ON org_companies FOR UPDATE USING (user_is_member_of(org_id));
CREATE POLICY org_companies_delete ON org_companies FOR DELETE USING (user_is_admin_of(org_id));

-- org_company_owners
CREATE POLICY org_company_owners_select ON org_company_owners FOR SELECT
  USING (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));
CREATE POLICY org_company_owners_insert ON org_company_owners FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));
CREATE POLICY org_company_owners_delete ON org_company_owners FOR DELETE
  USING (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));

-- org_company_notes
CREATE POLICY org_company_notes_select ON org_company_notes FOR SELECT
  USING (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));
CREATE POLICY org_company_notes_insert ON org_company_notes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));
CREATE POLICY org_company_notes_update ON org_company_notes FOR UPDATE
  USING (author_user_id = auth.uid());

-- status_history y owner_history: read-only para members, write solo trigger
CREATE POLICY status_history_select ON org_company_status_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));
CREATE POLICY owner_history_select ON org_company_owner_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM org_companies oc WHERE oc.id = org_company_id AND user_is_member_of(oc.org_id)));

-- alert_dispatches
CREATE POLICY alert_dispatches_select ON alert_dispatches FOR SELECT USING (user_is_member_of(org_id));
```

- [ ] **Step 3: Create `supabase/migrations/0005_signal_type_seed.sql`**

```sql
-- Migration 0005: seed de signal_type_config
-- Pesos default por tipo, ver spec §6.1 (sección signals)

INSERT INTO signal_type_config (type, variant, intent_weight, decay_half_life_days, match_rules) VALUES
  ('job_posting', 'tech', 30.0, 30,
   '{"title_keywords_any": ["data", "ml", "ai", "automation", "head of digital", "cto", "transformación digital"]}'::jsonb),
  ('job_posting', 'general', 10.0, 30, NULL),
  ('bo_act', 'ampliacion_capital', 20.0, 180, NULL),
  ('bo_act', 'fusion', 25.0, 180, NULL),
  ('bo_act', 'cambio_objeto', 15.0, 180, NULL),
  ('web_change', 'productos', 18.0, 60, NULL),
  ('web_change', 'equipo', 15.0, 60, NULL),
  ('web_change', 'blog_tech', 12.0, 60, NULL),
  ('apollo_hiring', NULL, 25.0, 45, NULL);
```

- [ ] **Step 4: Create `supabase/migrations/0006_universe_master_seed.sql`**

```sql
-- Migration 0006: seed inicial de universe_master_versions v1
-- NOTA: created_by debe apuntar a un user real. Se aplica manualmente
-- después de crear el super-admin en Week 2.
-- Este archivo queda como referencia; el seed real lo aplica un script.

-- Placeholder INSERT comentado — se ejecuta vía script en Week 2:
-- INSERT INTO universe_master_versions (version_int, config, created_by, activated_at, is_active)
-- VALUES (
--   1,
--   '{
--     "location_country": "AR",
--     "headcount_min": 10,
--     "headcount_max": 500,
--     "founded_year_min": 2005,
--     "founded_year_max": null,
--     "industries": [
--       "Information Technology and Services",
--       "Marketing and Advertising",
--       "Retail",
--       "Construction",
--       "Logistics and Supply Chain",
--       "Real Estate",
--       "Food and Beverages",
--       "Wholesale",
--       "Manufacturing",
--       "Professional Services"
--     ],
--     "exclude_industries": ["Defense", "Tobacco", "Gambling"],
--     "keywords_any": [],
--     "max_companies_target": 15000
--   }'::jsonb,
--   '<SUPER_ADMIN_USER_ID>',
--   now(),
--   true
-- );

SELECT 'universe_master seed placeholder applied' AS info;
```

- [ ] **Step 5: Create `supabase/migrations/0007_apollo_budget_seed.sql`**

```sql
-- Migration 0007: seed inicial de apollo_budget_config
-- Default basado en Apollo Basic ~$99/mes. Ajustar a creditos reales en Week 2.

INSERT INTO apollo_budget_config (
  monthly_budget_credits,
  alert_thresholds_pct,
  hard_stop_pct,
  alert_emails,
  apollo_plan_name,
  apollo_plan_monthly_usd
) VALUES (
  1500,                                 -- placeholder: actualizar con val real Apollo Basic
  ARRAY[70, 85, 95],
  100,
  ARRAY['marianonoceti@gmail.com'],
  'basic',
  99.00
);
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_super_admins.sql supabase/migrations/0004_rls.sql supabase/migrations/0005_signal_type_seed.sql supabase/migrations/0006_universe_master_seed.sql supabase/migrations/0007_apollo_budget_seed.sql
git commit -m "feat(supabase): add migrations for super_admins, RLS policies, and seeds"
```

---

## Task 12: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/apollo_sync.yml`
- Create: `.github/workflows/daily_scrape.yml`
- Create: `.github/workflows/web_changes.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  web:
    name: Web · lint + test + typecheck + build
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: web/.nvmrc
          cache: npm
          cache-dependency-path: web/package-lock.json

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-anon
          NEXT_PUBLIC_APP_URL: http://localhost:3000

  scrapers:
    name: Scrapers · lint + test + typecheck
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: scrapers
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
          cache-dependency-path: scrapers/pyproject.toml

      - name: Install
        run: pip install -e ".[dev]"

      - name: Lint
        run: ruff check src tests

      - name: Format check
        run: ruff format --check src tests

      - name: Typecheck
        run: mypy src

      - name: Test
        run: pytest
```

- [ ] **Step 2: Create `.github/workflows/apollo_sync.yml`** (stub)

```yaml
name: Apollo Sync (weekly)

on:
  schedule:
    # Lunes 7am UTC = 4am Argentina
    - cron: "0 7 * * 1"
  workflow_dispatch:
    inputs:
      mode:
        description: "Sync mode"
        required: true
        default: "delta"
        type: choice
        options: [initial, delta, targeted_contacts]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
          cache-dependency-path: scrapers/pyproject.toml

      - name: Install
        working-directory: scrapers
        run: pip install -e .

      - name: Run Apollo sync
        working-directory: scrapers
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          APOLLO_API_KEY: ${{ secrets.APOLLO_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
        run: python -m leads_scrapper.jobs.apollo_sync --mode ${{ inputs.mode || 'delta' }}
```

- [ ] **Step 3: Create `.github/workflows/daily_scrape.yml`** (stub)

```yaml
name: Daily Scrape

on:
  schedule:
    # Lunes a sábado 9am UTC = 6am Argentina
    - cron: "0 9 * * 1-6"
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
          cache-dependency-path: scrapers/pyproject.toml

      - name: Install
        working-directory: scrapers
        run: pip install -e .

      - name: Daily scrape (Week 3 implementación)
        working-directory: scrapers
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          echo "Stub - implementation in Week 3"
          exit 0
```

- [ ] **Step 4: Create `.github/workflows/web_changes.yml`** (stub)

```yaml
name: Web Changes (weekly)

on:
  schedule:
    # Lunes 8am UTC = 5am Argentina
    - cron: "0 8 * * 1"
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Web changes scrape (Week 3+)
        working-directory: scrapers
        run: |
          echo "Stub - implementation in Week 3+"
          exit 0
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/
git commit -m "ci: add github actions for tests + scheduled scrapers (stubs)"
```

---

## Task 13: Final smoke check + initial commit ready for push

**Files:** ninguno nuevo.

- [ ] **Step 1: Verify directory structure**

```bash
ls -la
ls -la web/ scrapers/ supabase/ .github/workflows/
```

- [ ] **Step 2: Run web tests one more time**

```bash
cd web && npm test && npm run typecheck && npm run build
```

Expected: all green.

- [ ] **Step 3: Run scrapers tests**

```bash
cd scrapers && pytest && ruff check src tests && mypy src
```

Expected: all green.

- [ ] **Step 4: Verify git log is coherent**

```bash
git log --oneline
```

Expected: 8-12 commits, each scoped (chore, feat, test, ci).

- [ ] **Step 5: Add remote and verify connectivity (no push)**

```bash
git remote add origin https://github.com/mariano-ia/leads-scrapper.git
git remote -v
```

Expected: origin listed with the URL.

- [ ] **Step 6: Final commit only if anything is uncommitted**

```bash
git status
# Si hay cambios sin commitear, agregarlos con un commit "chore: finalize week 1"
```

---

## Self-Review checklist (post-implementación)

Después de completar todas las tasks:

- [ ] **Spec coverage**: cada tabla del spec §6 tiene migration correspondiente. Cada cliente del spec §10 tiene stub. Cada job de §9 tiene workflow.
- [ ] **No placeholders en código**: search "TODO Week" en código — los stubs sí tienen "TODO Week N" intencionalmente, pero no hay TODOs huérfanos.
- [ ] **Tests pasan**: `npm test` en `web/`, `pytest` en `scrapers/`.
- [ ] **CI verde**: workflow `ci.yml` corre y pasa en GitHub.
- [ ] **Migrations aplicables localmente**: con `supabase start && supabase db reset` (validar en Week 2 cuando creemos el proyecto Supabase).

## Hand-off a Week 2

Al finalizar este plan, el repo está listo para Week 2 que implementa:
1. Crear proyecto Supabase real (`sa-east-1`, nombre `leads-scrapper`) — requiere confirmación de usuario.
2. Aplicar migrations 0001-0007.
3. Crear super-admin (Mariano).
4. Activar `universe_master_versions` v1.
5. Integración real con Apollo: implementar `ApolloClient.search_accounts()`, `search_people()`, `get_credit_balance()`.
6. Job `apollo_sync.py` que ejecuta sync inicial.
7. Budget guardrail con threshold checks.

El plan de Week 2 se escribirá al cerrar Week 1.
