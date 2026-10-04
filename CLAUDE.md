@AGENTS.md

# Instrucciones específicas de Claude

## Coordinador (Opus 5.5)
La sesión principal corre en Opus 5.5 con esfuerzo medio (`.claude/settings.json`). Le corresponde:
entender el pedido y detectar requisitos incompletos, analizar el impacto, definir contratos y criterios de aceptación,
dividir y elegir implementador, resolver bloqueos o desacuerdos entre workers, revisar los cambios relevantes e integrar.

- **Directo** cuando delegar cuesta más que hacerlo: cambios pequeños y claros, o ajustes que tocan lo que ya tienes en contexto.
- **Esfuerzo alto**: invoca la skill `decision-sensible` (sube a `high` mientras está activa) ante incertidumbre significativa, pagos, caja, inventario, acceso, concurrencia, seguridad o bugs difíciles. `xhigh`/`max` solo con motivo concreto, pidiéndole al usuario `/effort`.
- No repitas exploración ajena: trabaja sobre el resumen, las rutas y las pruebas que te entregan; abre solo lo que falte para decidir.

## A quién delegar
- Subagentes (`.claude/agents/`): `explorador` (Sonnet, lectura y resúmenes), `implementador` (Sonnet, cambios acotados con patrón claro), `revisor` (Opus, revisión con contexto limpio de cambios de Codex).
- Workers de Orca (`claude` o `codex`) para implementaciones independientes, largas o en paralelo. Antes de lanzar uno, lee `docs/orquestacion.md`. Un worker no hereda tu conversación, modelo, esfuerzo ni perfil: todo va en el contrato de la tarea, y siempre con `--model` explícito.
- Sonnet o Codex se eligen por incertidumbre, impacto, verificabilidad y resultados registrados, no por la etiqueta frontend/backend (tabla en `docs/orquestacion.md`).
- Máximo dos implementadores simultáneos, una sola capa de coordinación, un responsable por área de escritura, sin ejecuciones competitivas.
- Activa solo las etapas que aportan: no toda tarea necesita explorar, implementar y revisar.

## Modelo y esfuerzo reales
Se fijan con parámetros, no con texto en el prompt: `model`/`effort` del frontmatter, `model` al invocar un subagente, `--model`/`--effort` en `orca orchestration worker-start` (confirmar `launch.effective`). Antes de escalar, diagnostica si el fallo viene de razonamiento, contexto, especificación, herramientas o entorno. Anota cada delegación en `docs/registro-delegaciones.md`.

## Plugins
- No usar plugins instalados (sus skills, agentes ni servidores MCP) a menos que los use una skill propia del usuario o que el usuario pida su uso explícitamente.
- Por defecto se trabaja con las herramientas base: leer, editar y buscar archivos, la terminal, los agentes Explore y Plan, los subagentes y skills del proyecto, Artifact y la CLI `orca`.
