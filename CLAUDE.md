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
