# Setup checklist

Pasos para arrancar el proyecto desde cero. Las claves API se completan en `web/.env.local` y `scrapers/.env` (ambos archivos están en `.gitignore`).

## 1 · Supabase ✅ (ya hecho)

- Proyecto: `leads-scrapper` (region `sa-east-1`)
- ID: `cdklaxvxngmldpdiihgo`
- URL: `https://cdklaxvxngmldpdiihgo.supabase.co`
- Dashboard: https://supabase.com/dashboard/project/cdklaxvxngmldpdiihgo
- Costo: $10/mes (el 4to proyecto activo en org Yacaré; free tier cubre 2)

### Service role key (manual)

El service_role key no se puede recuperar via MCP por seguridad. Pegarlo a mano:

1. Ir a https://supabase.com/dashboard/project/cdklaxvxngmldpdiihgo/settings/api
2. Sección "Project API keys" → fila `service_role` (NO la anon) → revelar y copiar
3. Pegar en `web/.env.local` y `scrapers/.env` en la línea `SUPABASE_SERVICE_ROLE_KEY=`

⚠️ Nunca commitear esta key. Solo va en `.env.local` / `.env` (ambos gitignored).

## 2 · Apollo.io (necesario para Week 2)

- Plan recomendado: **Basic** (~$99/mes, ajustar después con datos reales)
- Necesario para: pull del universo de empresas argentinas + decision makers + emails verificados
- Tiempo de setup: 10 min

### Pasos

1. Ir a https://app.apollo.io/#/login y crear cuenta con email de Yacaré
2. Suscribirse al plan Basic (cuesta plata real — verificar antes)
3. Generar API key:
   - Settings → Integrations → API → "Create new key"
   - Copiar y pegar en `APOLLO_API_KEY=` (ambos env files)
4. Verificar créditos disponibles del mes:
   - Settings → Billing → ver "Credits remaining"
   - Actualizar el seed en Supabase si el número difiere de 1500:
     ```sql
     UPDATE apollo_budget_config SET monthly_budget_credits = <real_credits>;
     ```

## 3 · Anthropic API (necesario para Week 4)

- Necesario para: LLM filter semántico + AI briefs por empresa
- Modelo default: `claude-sonnet-4-6` (configurable via `ANTHROPIC_MODEL`)
- Costo estimado: ~$10/mes con caching agresivo

### Pasos

1. Ir a https://console.anthropic.com/ → crear cuenta o login
2. Settings → API Keys → "Create Key"
3. Pegar en `ANTHROPIC_API_KEY=`
4. (Opcional) Cargar saldo prepago en Billing si querés controlar el techo de gasto

## 4 · Resend (necesario para Week 7 — alertas)

- Necesario para: envío de emails transaccionales (alertas de leads nuevos, invitaciones)
- Costo: $0 hasta 3K emails/mes (free tier suficiente para F0)
- Estado: usuario ya tiene cuenta

### Pasos

1. Login en https://resend.com
2. **Verificar dominio** (a definir):
   - Sugerido: `leads.yacare.io` o `notifications.yacare.io`
   - Si no se quiere comprar dominio nuevo: usar subdominio de `yacare.io` (necesita acceso a DNS de Yacaré)
   - Resend te da registros DNS para agregar (SPF, DKIM, return-path)
3. Una vez verificado: Settings → API Keys → "Create API Key" (con permiso "Sending access")
4. Pegar en `RESEND_API_KEY=`
5. Actualizar `RESEND_FROM_EMAIL=leads@<dominio_verificado>` en ambos env files

## 5 · GitHub (necesario para CI + auto-deploy Vercel)

### Repo

- Ya creado: https://github.com/mariano-ia/leads-scrapper.git
- Estado: vacío en remote (no pusheado todavía por decisión del usuario)

### Cuando esté listo para push

```bash
git push -u origin main
```

### Secrets en GitHub Actions

Para que los workflows `apollo_sync.yml`, `daily_scrape.yml`, etc. funcionen:

1. Ir a https://github.com/mariano-ia/leads-scrapper/settings/secrets/actions
2. Agregar secrets:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APOLLO_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `RESEND_API_KEY`

## 6 · Vercel (necesario para deploy web)

- Estado: proyecto Vercel no existe aún (se crea cuando hagamos primer push)
- Auto-deploy desde GitHub: ya configurado en cuenta de usuario

### Cuando hagamos el primer push

1. Vía MCP yo creo el proyecto Vercel linkeado al repo mariano-ia/leads-scrapper
2. Vía MCP yo agrego los env vars (todos los del .env.local) al proyecto
3. El primer auto-deploy corre solo

## 7 · Local dev

### Web
```bash
cd web
nvm use  # Node 20
npm install
npm run dev
# abre http://localhost:3000
```

### Scrapers
```bash
cd scrapers
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest                 # tests
ruff check src tests   # lint
mypy src               # typecheck
```

### Migrar DB local (opcional, si querés desarrollar contra Supabase local)

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref cdklaxvxngmldpdiihgo
supabase db pull        # baja schema actual
```

## Orden recomendado para llenar keys

1. ✅ Supabase URL + anon (ya hecho)
2. ✅ Supabase service_role (manual — siguiente paso inmediato)
3. Apollo (cuando estés listo para pagar el plan Basic — gating de Week 2)
4. Anthropic (puede esperar hasta Week 4, pero es barato y rápido)
5. Resend (puede esperar hasta Week 7 — necesita dominio verificado)
6. GitHub secrets (cuando hagamos primer push)
7. Vercel env vars (cuando hagamos primer push, yo lo hago via MCP)

## Validación de env

Si ejecutás cualquiera de estos y falta una key requerida, vas a ver el error inmediato:

```bash
cd web && npm test          # falla si NEXT_PUBLIC_SUPABASE_URL falta
cd scrapers && pytest       # falla si NEXT_PUBLIC_SUPABASE_URL o SERVICE_ROLE_KEY faltan
```
