# Orquestación de agentes: Claude Code + Orca + Codex

Guía para el coordinador. Se consulta cuando una tarea no es pequeña.
Reglas del proyecto en `AGENTS.md`; reglas de Claude en `CLAUDE.md`.

Verificado el 2026-10-04 con Claude Code 2.1.289, Orca 1.4.219 y codex-cli 0.160.0. Si alguno se
actualiza, revisar `orca skills get orchestration --full`, `orca orchestration worker-start --help` y la
lista de modelos de Codex (sección 2) antes de confiar en esta guía.

## 1. Estructura

Una sola capa de coordinación: la sesión principal de Claude Code en **Opus 5.5**.

| Pieza | Qué es | Modelo y esfuerzo (mecanismo real) |
|---|---|---|
| Coordinador | Sesión principal | `opus` + `medium` en `.claude/settings.json`; `high` con la skill `decision-sensible` |
| `explorador` | Subagente, solo lectura y resúmenes | `sonnet` + `low` (frontmatter) |
| `implementador` | Subagente o perfil de worker; web o API | `sonnet` + `medium` (frontmatter); `model` por invocación |
| `revisor` | Subagente sin edición; perfil cuando Codex revisa | `opus` + `high` (frontmatter) |
| Worker Claude | Agente nuevo en Orca | `--agent claude --model sonnet\|opus --effort <nivel>` |
| Worker Codex | Agente nuevo en Orca | `--agent codex --model gpt-6.1-sol --effort medium\|high` |

**Subagente ≠ worker.** El subagente vive dentro de la sesión, hereda `CLAUDE.md` (y por import
`AGENTS.md`) y devuelve un resumen. El worker es una sesión nueva en una terminal de Orca: lee los
`CLAUDE.md`/`AGENTS.md` del worktree donde arranca y el spec, y nada más. Ni Claude ni Codex como
worker adoptan un perfil de `.claude/agents/` por sí solos: el spec les indica leer el archivo del rol.

## 2. Capacidades verificadas

| Runtime | Modelos | Esfuerzo |
|---|---|---|
| Claude Code | Alias `opus` → Opus 5.5 (`claude-opus-5-5`), `sonnet` → Sonnet 5.5, `haiku` → Haiku 4.5 | Opus/Sonnet 5.5: `low`, `medium`, `high`, `xhigh`, `max`. Haiku 4.5 no admite esfuerzo |
| Codex (cuenta del usuario, caché de modelos de Orca) | `gpt-6.1-sol` (caballo de batalla actual, el predeterminado), `gpt-6-astra` (frontera, más caro), `gpt-6-luna` (rápido y barato); `gpt-5.5` se retira el 2026-10-14 | `gpt-6.1-sol`/`gpt-6-astra`: `low`…`max` y `ultra`; `gpt-6-luna`: hasta `max` |
| Orca `worker-start` | `--model` opaco para `claude` y `codex` | `--effort` requiere `--model`; Orca devuelve `launch.requested` y `launch.effective` |

- Los niveles **no son equivalentes** entre Claude y Codex: `medium` de Codex no significa lo mismo que
  `medium` de Opus. Se calibra con el registro (sección 8), no por el nombre.
- No se fija una versión de Claude (se usa el alias); en Codex sí se nombra el modelo porque Orca lo exige
  para pasar esfuerzo. Si `gpt-6.1-sol` deja de estar en la lista, usar el que Codex marque como
  predeterminado y anotar el cambio aquí; no sustituir en silencio.
- Lista actual de modelos de Codex: `$ORCA_CODEX_HOME/models_cache.json` (solo lectura) o el selector de `/model` dentro de Codex.

## 3. Qué hace cada uno

### Decisiones de Opus (coordinador)
Entender el pedido y detectar huecos · analizar impacto · definir arquitectura, contratos y criterios ·
dividir y elegir implementador · resolver bloqueos y desacuerdos · revisar cambios relevantes · integrar.
Implementa directo cuando delegar cuesta más que hacerlo. Recibe evidencia (rutas, resúmenes, salidas de
pruebas) y no repite la exploración de otros.

### Sonnet o Codex: cómo elegir
Elegir por incertidumbre, impacto, verificabilidad y resultados registrados, no por "frontend/backend".

| Señal | Sonnet (subagente o worker Claude) | Codex (worker) |
|---|---|---|
| Sigue un patrón visible en un archivo vecino | ✓ preferido | ✓ |
| UI que hay que mirar en el navegador | ✓ preferido (Playwright, maquetas) | posible si el spec trae capturas o criterios medibles |
| Formulario o endpoint acotado | ✓ preferido | ✓ |
| Varios archivos que deben cambiar de forma coherente | posible | ✓ candidato habitual |
| Refactor con alcance delimitado | posible | ✓ candidato habitual |
| Diagnóstico leyendo código y corriendo pruebas | posible | ✓ candidato habitual |
| Escribir pruebas y corregir los fallos | posible | ✓ candidato habitual |
| Segunda revisión de un cambio sensible hecho por Claude | — | ✓ |
| Revisión de un cambio sensible hecho por Codex | — | — (lo revisa Opus) |
| Exploración y resúmenes del repo | ✓ `explorador` | — |

Estas asignaciones son la **política inicial**: se ajustan con el registro de resultados del proyecto.

## 4. Política por situación

| Situación | Asignación inicial | Modelo y esfuerzo |
|---|---|---|
| Cambio pequeño y claro | El coordinador lo hace | Opus `medium` |
| Funcionalidad habitual | Opus define alcance → Sonnet o Codex implementa → Opus revisa la integración | Sonnet `medium` / Codex `gpt-6.1-sol` `medium` |
| Cambio transversal | Opus define contratos (`decision-sensible`) → hasta 2 workers en paralelo → Opus integra | Workers `medium`; `high` el que toque lógica sensible |
| Lógica sensible o bug difícil | Opus analiza con `decision-sensible` → Codex o Claude implementa según la evidencia | Implementador `high` (Codex `high`, o `implementador` con `model: opus`) |
| Revisión independiente de un cambio sensible | Codex revisa cambios de Claude; `revisor` (Opus) revisa cambios de Codex | Codex `high`; `revisor` `opus` + `high` |
| Problema excepcionalmente difícil | Escalamiento explícito con motivo escrito | Opus `xhigh` (pedir `/effort xhigh` al usuario) o worker `--model opus --effort xhigh`; Codex `gpt-6-astra` `high` |

No toda tarea pasa por todas las etapas. Una revisión independiente solo cuando el impacto lo pide, y
una sola: se repite únicamente si hay cambios o hallazgos nuevos.

## 5. Costo, reintentos y escalamiento

- Optimizar el costo de **terminar bien**, contando reintentos y retrabajo: un spec preciso es más barato que un modelo más caro.
- Máximo dos implementadores simultáneos; una capa de coordinación; los workers no lanzan workers.
- Sin ejecuciones competitivas sobre la misma tarea salvo pedido expreso.
- A cada worker solo el contexto necesario: rutas, contrato, criterios. No pegar la conversación.

Antes de reintentar o escalar, clasificar el fallo:

| Causa | Acción | ¿Escalar modelo/esfuerzo? |
|---|---|---|
| Razonamiento (entendió todo y aun así decidió mal) | Subir un escalón: esfuerzo, luego modelo | Sí |
| Contexto (le faltaba un archivo, una regla) | Agregarlo al spec | No |
| Especificación (contrato ambiguo o contradictorio) | Opus corrige el contrato | No |
| Herramientas o permisos | Arreglar o cambiar de agente | No |
| Entorno (puertos, base, dependencias) | Arreglar el recurso | No |

Un reintento por causa. Orca falla la tarea tras tres intentos; no se esquiva con un Run nuevo.

## 6. Contrato de cada tarea

Todo spec es autosuficiente; Codex y Claude no ven la conversación. Plantilla:

```text
1. Objetivo y contexto: <qué y por qué; evidencia ya reunida con ruta:línea>
2. Rol: <implementador|revisor|explorador>. Lee y sigue el cuerpo de
   C:\Users\Milton\orca\chunky-web\.claude\agents\<rol>.md y C:\Users\Milton\orca\chunky-web\AGENTS.md.
3. Modelo y esfuerzo: <gpt-6.1-sol/medium> porque <motivo breve>.
4. Alcance: puedes escribir solo en <rutas>. Repo/worktree: <ruta>.
5. Dependencias y contratos: <endpoint, cuerpo, respuesta, errores, tipos; tareas previas>.
6. Fuera de alcance: <lo que no se toca>. Sin commit, push ni despliegue. Sin lanzar otros agentes.
7. Criterios de aceptación: <lista verificable>.
8. Comprobaciones: <comandos exactos>. Puertos asignados: API <p>, web <p>. DATABASE_URL=memory.
9. Entrega: cambios, archivos, comprobaciones con resultado real, pendientes.
10. Comunicación: dudas que cambian el resultado con `ask`; un único worker_done con --outcome.
```

Para un subagente, el punto 10 es "si te bloqueas, detente y explica qué falta".

## 7. Flujo con Orca

El coordinador corre dentro de una terminal de Orca; `orca` está en el PATH. Repos registrados:
`chunky-web` y `chunky-api`.

### 7.1 Run, tareas y lanzamiento

```bash
orca status --json
orca orchestration run-create --objective "<objetivo>" --json
orca orchestration task-create --task-title "API propinas" --spec "<contrato>" --json
orca orchestration task-create --task-title "UI propinas" --spec "<contrato>" --deps '["<task_id>"]' --json

# Codex implementa en un worktree nuevo de chunky-api
orca orchestration worker-start --task <task_id> --worktree new-top-level --repo name:chunky-api \
  --name propinas-api --base-branch dev --agent codex --model gpt-6.1-sol --effort medium --json

# Sonnet implementa en un worktree nuevo de chunky-web
orca orchestration worker-start --task <task_id> --worktree new-top-level --repo name:chunky-web \
  --name propinas-web --base-branch dev --agent claude --model sonnet --effort medium --json
```

- **Siempre `--model`**: un worker Claude sin `--model` toma el `opus` del `.claude/settings.json`; uno
  Codex, el predeterminado de su configuración.
- Confirmar `launch.effective` = `launch.requested` en la respuesta; anotar el efectivo, no el pedido.
- Codex lee `AGENTS.md` de la raíz del worktree (comprobado). **chunky-api no tiene `AGENTS.md`** y tiene su
  propio `.claude/CLAUDE.md`: el spec apunta con ruta absoluta a `AGENTS.md` y al rol.
- Los worktrees nuevos parten de la rama base y corren `npm install`: lo no commiteado no está ahí.
- Los worktrees aíslan archivos, no recursos: puertos propios por worker (API 3101, 3102…; web 5174, 5175…
  con `CORS_EXTRA_ORIGINS`), `DATABASE_URL=memory`, nunca staging ni producción.
- Si `worker-start` sale con error, no relanzar: leer `failedStage` y `residualResources`.

### 7.2 Preguntas, bloqueos y finalizaciones

```bash
orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json
orca orchestration reply --id <message_id> --body "<respuesta>" --json
orca orchestration send --to dispatch:<dispatch_id> --subject "Ajuste" --body "<indicación>" --json
orca orchestration check --ack <delivery_id> --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json
```

- `check` repite el mismo lote hasta el `--ack`; procesar cada mensaje antes. Si la salida no se puede
  parsear, `orca orchestration check --json` (sin `--wait`) vuelve a entregar el mismo lote.
- Timeout o lote vacío = punto de control. Tras tres esperas vacías:
  `orca orchestration worker-list --run <run_id> --json` y seguir `projection.nextAction`.
- Leer lo que hizo un worker: `orca orchestration worker-read --dispatch <id> --limit 50 --json`.
- Desacuerdo entre workers (por ejemplo, el contrato no alcanza): los dos se detienen con `ask`; Opus
  decide, actualiza el contrato y responde a ambos.

### 7.3 Reintentos sin mezclar intentos

```bash
orca orchestration worker-start --task <task_id> --retry-of <dispatch_id> --worktree <mismo destino> \
  --agent <agente> --model <modelo> --effort <nivel> --json
```

Solo con un intento comprobado como `failed` o `stopped`. La ubicación no se hereda. Con
`outcome_unknown`, inspeccionar y elegir `worker-stop` o `worker-abandon`; `unverifiable` no autoriza nada.
Respuesta perdida: `orca orchestration request-show --request <id> --json`. Detalle:
`orca skills get orchestration --reference references/recovery-and-cleanup.md`.

### 7.4 Liberar conservando resultados

```bash
orca orchestration worker-release --dispatch <dispatch_id> --json
orca orchestration worker-list --run <run_id> --terminal-state reclaimable --json   # debe quedar vacío
```

Liberar archiva la salida (sigue disponible con `worker-read`) y cierra solo esa terminal; no borra el
worktree ni los cambios. `worker-retain` solo si el usuario quiere la terminal viva.

### 7.5 Revisar e integrar cambios de distintos workers

1. Validar cada `worker_done`: que el Dispatch sea el esperado y que la evidencia exista. Opus relee el
   diff (`git -C <worktree> diff`) y vuelve a correr las comprobaciones clave; no basta el resumen.
2. Revisión independiente solo si el cambio es sensible: cambios de Claude → worker Codex revisor
   (`--effort high`, rol `revisor`); cambios de Codex → subagente `revisor`.
3. Los hallazgos los corrige el autor original (mismo worker si sigue disponible, o `--retry-of`), no el revisor.
4. Integrar en `dev`: primero el API, después la web. Commits solo si el usuario los pidió.
5. Correr las comprobaciones completas de ambos repos sobre el resultado integrado.
6. Anotar cada delegación en `docs/registro-delegaciones.md` e informar por tarea: resultado, evidencia y pendientes.

## 8. Registro y validación de la política

`docs/registro-delegaciones.md` guarda una fila por delegación: modelo y esfuerzo efectivos,
comprobaciones, reintentos (con su causa), resultado y duración. Costo solo si el runtime lo da (por ejemplo, `costUSD`
en `claude -p --output-format json`); si no, "n/d". Nunca estimar. Revisar el registro cada ~10 entradas
para mover tareas entre Sonnet y Codex o ajustar esfuerzos.

## 9. Ejemplo: Opus coordina, Codex implementa

Pedido: "Que el cierre de caja muestre las propinas por método de pago."

1. **Opus** clasifica: sensible (dinero). Pide al `explorador` ubicar el cierre; recibe
   `chunky-api/src/modules/caja/*` y `src/views/gestion/caja.tsx` con `ruta:línea`.
2. **Opus** invoca `decision-sensible`: decide que las propinas salen de los recibos de Loyverse ya
   procesados, fija el contrato (`GET .../cierre` agrega `tips: { cash, card, yappy }`) y criterios
   (suma = total de propinas del turno; sin recibos repetidos; prueba nueva en `test/caja.test.ts`).
3. **Codex** (`gpt-6.1-sol`, `high` por casos límite de dinero) implementa el API en un worktree de chunky-api.
   En paralelo, **Sonnet** (`implementador`, `medium`) muestra el dato en `caja.tsx` contra el contrato.
4. Opus responde un `ask` de Codex sobre reembolsos parciales, valida los dos `worker_done`, relee los
   diffs y corre `npm test` en ambos repos. Como el cambio de dinero lo hizo Codex, lo revisa el `revisor` (Opus).
5. Opus integra (API primero), anota las dos filas del registro y libera los workers.
