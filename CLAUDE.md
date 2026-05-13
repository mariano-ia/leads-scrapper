# Leads scrapper

## Idioma
Responder siempre en español.

## Invocación de skills al inicio

Al comenzar cualquier conversación nueva en este proyecto, **invocar inmediatamente la skill `using-superpowers`** vía la herramienta Skill antes de cualquier otra respuesta. Esta skill orienta sobre el sistema de skills disponibles y la metodología de trabajo (superpowers + awesome-claude-skills, ~42 skills totales instaladas en `~/.claude/skills/`).

Reglas que se desprenden de eso:
- Antes de cualquier acción o respuesta sustantiva, considerar si alguna skill aplica al pedido del usuario. Si la duda es ≥1%, invocarla.
- Skills de proceso primero (brainstorming, systematic-debugging, test-driven-development), skills de implementación después.
- Si el usuario pide "construyamos X" → `brainstorming` primero.
- Si pide "arreglemos este bug" → `systematic-debugging` primero.

## Estilo de trabajo
- Sesgo a la acción: si el usuario pide instalar/configurar algo, intentar hacerlo directamente. Si un slash command no está disponible en este entorno (VSCode extension), buscar la ruta manual equivalente (editar archivos, clonar repos, etc.) antes de devolverle el problema al usuario.
- No pedir confirmación para cada decisión menor durante la ejecución; sí consultar cuando haya una decisión estratégica real.

## Disciplina de documentación

Mantener memoria de TODO lo construido y decidido. Esto NO es opcional:

- **`docs/CHANGELOG.md`**: agregar entrada por cada sesión productiva con fecha + qué se hizo + decisiones + pendiente. Antes de terminar la sesión, actualizar.
- **`docs/decisions/NNNN-titulo.md`**: ADR para cada decisión de arquitectura importante (modelo de datos, integraciones externas, multi-tenancy, budgeting). Formato: contexto + decisión + consecuencias + alternativas.
- **`docs/SETUP.md`**: mantener al día. Cuando se agrega una dependencia externa nueva, sumarla con instrucciones.
- **`docs/superpowers/specs/`** y **`docs/superpowers/plans/`**: si cambia el spec o el plan vigente, dejar la versión vieja accesible (no sobrescribir silenciosamente).
- **Memoria persistente** (`~/.claude/projects/.../memory/`): actualizar `project-leads-scrapper.md` cuando cambie el estado material del proyecto (proyecto Supabase creado, primer push, integración externa activa, etc.).

Si dudás si vale la pena documentar algo: documentalo. La memoria del proyecto vale más que la velocidad de escritura.

## Rutina de QA antes de avanzar

Antes de cualquier avance significativo (cierre de week, cambio de fase, antes de push, antes de aplicar migration a prod, antes de release), ejecutar la rutina definida en `docs/QA.md`. Mínimo: tests + lint + typecheck + supabase advisors + check de secretos + smoke run.

No avanzar si hay tests rotos, errors de tipo, secrets committeados, o errors (no warnings) en Supabase advisor. Dejar QA pass blockear es la default — solo el usuario puede pedir explícitamente que se saltee.
