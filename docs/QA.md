# Rutina de QA

Esta rutina se ejecuta **antes de cualquier avance significativo**: cierre de week, cambio de fase, antes de pushear a GitHub, antes de aplicar migrations a producción, antes de un release. La regla está reflejada en `CLAUDE.md`.

## Gates obligatorios

### 1 · Tests automatizados

```bash
# Web
cd web
npm test                # vitest run
npm run typecheck       # tsc --noEmit
npm run lint            # next lint
npm run build           # next build production

# Scrapers
cd ../scrapers
source .venv/bin/activate
pytest                  # pytest -v
ruff check src tests
ruff format --check src tests
mypy src
```

**Gate**: 0 fallos, 0 errors. Warnings de lint OK si están justificados (anotar en commit).

### 2 · Seguridad: secretos no committeados

```bash
git ls-files | xargs grep -l "sb_secret\|sk_live\|eyJ" 2>/dev/null
git ls-files | grep -E "\.env(\.local|\.production)?$"
git log --all --full-history -p -- '*.env' '*.env.local' 2>/dev/null | head -50
```

**Gate**: ningún archivo `.env`, `.env.local`, ni secret literal committeado. Si aparece algo, rotar la key inmediatamente.

### 3 · Supabase advisors

Vía MCP:
```
get_advisors(project_id="cdklaxvxngmldpdiihgo", type="security")
get_advisors(project_id="cdklaxvxngmldpdiihgo", type="performance")
```

**Gate**: 0 errors. Warnings aceptables si están documentados con justificación (ej: `pg_trgm` en public schema → estándar Supabase; ver CHANGELOG y ADRs).

### 4 · Migrations alineadas con la DB

```
list_migrations(project_id="cdklaxvxngmldpdiihgo")
ls supabase/migrations/
```

**Gate**: cada `.sql` en `supabase/migrations/` aparece en la lista de migrations aplicadas (o está marcado como "pending: Week N"). Cada migration en DB tiene su `.sql` en el repo.

### 5 · Spec coverage

Para cada sección/requerimiento del spec activo (`docs/superpowers/specs/<active>.md`):
- ¿Hay una migration que la implementa? (schema, RLS)
- ¿Hay código que la implementa? (web/, scrapers/)
- ¿Hay tests que la cubren?

Marcar gaps en el plan correspondiente.

### 6 · Documentación al día

- `docs/CHANGELOG.md` actualizado con lo hecho desde el último gate.
- Si hubo decisiones de arquitectura nuevas: ADR en `docs/decisions/NNNN-titulo.md`.
- Si cambió el setup/env: `docs/SETUP.md` actualizado.
- Si cambió el spec: nueva versión o revisión documentada.

**Gate**: el changelog refleja el estado actual con commits que lo respaldan.

### 7 · Smoke run de entry points

Scrapers:
```bash
cd scrapers && python -m leads_scrapper.jobs.apollo_sync --mode delta
# debe imprimir log JSON y salir 0 (stub OK en Week 1; real en Week 2+)
```

Web:
```bash
cd web && npm run dev
# debe levantar en localhost:3000 sin errores
```

**Gate**: stubs corren sin error; pantallas existentes renderean sin crash.

### 8 · Git log limpio

```bash
git log --oneline -20
git status
```

**Gate**: no hay archivos sin trackear que deberían estar (verificar manualmente). Commit messages son descriptivos (no "wip", "fix", "stuff").

### 9 · Memoria y CLAUDE.md actualizados

- `~/.claude/projects/.../memory/project-leads-scrapper.md` refleja el estado actual.
- Si surgieron preferencias del usuario nuevas: archivo de feedback creado/actualizado.
- `CLAUDE.md` del proyecto sigue siendo válido (no referencia decisiones obsoletas).

## Cuándo correr esta rutina

| Trigger | QA gates a ejecutar |
|---|---|
| Cierre de week (Week N → Week N+1) | TODOS |
| Antes de `git push` | 1, 2, 3, 4, 7, 8 |
| Antes de aplicar migration a Supabase prod | 2, 3, 4, 5 |
| Antes de un release / deploy a Vercel | TODOS |
| Cambio significativo de arquitectura (ADR nuevo) | 5, 6, 9 |

## Output esperado de una QA pass

Al cerrar la rutina, dejar un bloque en `CHANGELOG.md` así:

```markdown
### QA pass — 2026-MM-DD
- Tests: web ✅ scrapers ✅
- Lint/typecheck: ✅
- Secrets: ✅ (no committeados)
- Supabase advisors: 0 errors, N warnings documentadas
- Migrations: aligned ✅
- Spec coverage: secciones X-Y cubiertas, sección Z pendiente Week N+1
- Smoke run: ✅
- Notas: <hallazgos relevantes>
```

## Anti-patterns

- ❌ "El test no es importante, después lo arreglo" → tests rotos bloquean el merge/push, sin excepción.
- ❌ Saltar QA porque "es un cambio chico" → cambios chicos son donde se cuelan bugs sutiles (sobre todo en RLS).
- ❌ Marcar gates como pasados sin ejecutarlos.
- ❌ Tests que solo testean el happy path en código de seguridad (RLS, auth, budget) — incluir casos negativos.
