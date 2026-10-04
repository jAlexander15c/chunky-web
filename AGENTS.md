# Chunky Bites — instrucciones compartidas para agentes

Fuente única de instrucciones del proyecto para cualquier agente (Claude Code, Codex u otro worker de Orca).
Lo específico de Claude está en `CLAUDE.md`; el flujo multiagente (Opus coordina; Sonnet, Codex o Claude implementan), en `docs/orquestacion.md`.

## Arquitectura

Dos repositorios hermanos, ambos registrados en Orca:

| Repo | Ruta | Qué es |
|---|---|---|
| `chunky-web` (este) | `C:\Users\Milton\orca\chunky-web` | React 19 + Vite + Chakra UI v3 + react-router 7. Menú, carrito y pago, cotizador de cakes, `/pedido/:id`, tablero `/admin` y gestión del equipo `/gestion` (caja, cocina, inventario, recetas). |
| `chunky-api` | `C:\Users\Milton\orca\chunky-api` | Node + Express + TypeScript. Módulos en `src/modules/*` (orders, payments, inventory, caja, quotes, staff…), integra Loyverse (POS), Yappy y PagueloFacil, Postgres. |

- La web habla con el API vía `src/helpers/getHttp.ts`; los tipos compartidos se duplican a mano en ambos repos (`src/interfaces`, helpers). Si cambia un contrato, se cambian los dos lados.
- Loyverse es la fuente del menú, los recibos y los modificadores; nuestra base guarda inventario, agotados, recetas, cotizaciones, clientes y finanzas.
- Variables `VITE_*` son públicas (van dentro del JS). Ningún secreto en la web; los secretos viven solo en el API.

## Convenciones de código

- Funciones siempre como **funciones flecha** (`const nombre = (...) => { ... }`), nunca `function nombre() {}`.
- Nombres en camelCase con verbo de acción, como en el código existente: `get...`, `fetch...`, `use...`, `is...`, `has...`, `should...` (`getItems`, `fetchCategoriesCached`, `useCategories`, `isWithinOperatingHours`, `hasItemAvailableForSale`, `shouldDisplayCategory`).
- Imitar el archivo vecino: misma densidad de comentarios, mismos patrones de estado y estilos (CSS por vista, componentes de `src/components`).
- Los archivos usan CRLF; no reformatear archivos enteros ni mezclar finales de línea.
- Textos de interfaz en español de Panamá, tono cercano.

## Comandos

| Repo | Comando | Uso |
|---|---|---|
| web | `npm run lint` | ESLint |
| web | `npm test` | Vitest (`src/**/*.test.ts`) |
| web | `npx tsc -b` | Tipos. **No** usar `tsc --noEmit`: el tsconfig raíz es de referencias y no revisa nada |
| web | `npm run build` | tsc + build de Vite |
| api | `npm test` | `node --test` con la lista de `package.json` (agregar ahí cada prueba nueva) |
| api | `npx tsc --noEmit` | Tipos |

Probar web + API en local sin servicios reales: API con `DATABASE_URL=memory`, `LOYVERSE_RECEIPTS_ENABLED=false`, `INVENTORY_SYNC_ENABLED=false` y Loyverse/Yappy simulados; web con `VITE_API_BASE_URL=http://localhost:<puerto>`. Los puertos 3100 (API) y 5173 (web) suelen estar ocupados por el usuario: usar otros y `CORS_EXTRA_ORIGINS`.

## Reglas de negocio sensibles

Tratar como impacto alto (ver la política de complejidad en `docs/orquestacion.md`):

- **Pagos** (Yappy, PagueloFacil, cobro en caja, reembolsos vía Loyverse) y **finanzas** (cierre de caja, fondo, créditos).
- **Inventario**: insumos, presentaciones (ml/g), recetas con modificadores, insumos elaborados, lotes. El descuento por venta sale de los recibos de Loyverse; nunca descontar dos veces el mismo recibo.
- **Acceso del equipo**: PIN, passkeys/Face ID, roles (admin, pastelera, colaborador).
- **Datos de clientes** (Ley 81 de Panamá): solo se registran desde la web con el aviso aceptado.
- La caja de staging usa el mismo Loyverse que producción: no cobrar desde staging.

## Interfaz

- En rediseños o UI nueva: primero maqueta y aprobación del usuario, después código.
- En el teléfono (~390 px) nada se desliza de lado: filas que no caben van en `SheetSelect`/`FullSheet` (`src/components/full-sheet.tsx`); tablas pasan a tarjetas.

## Ramas y despliegue

- `dev` → `staging` → `main`. Todo trabajo nuevo entra en `dev`; `staging` prueba; `main` es producción.
- Nunca pasar de `dev` directo a `main`, ni subir a `main` sin que el usuario apruebe las pruebas en `staging`.
- Si un cambio toca API y web, se despliega **primero el API**.
- Sin push, despliegue ni publicación salvo pedido explícito del usuario.

## Validación antes de entregar

1. Web: `npm run lint`, `npm test`, `npx tsc -b`. API: `npm test`, `npx tsc --noEmit`.
2. Cambios de UI: revisarlos en el navegador, también a 390 px.
3. Informar qué se corrió y su resultado real; si algo no se pudo comprobar, decirlo.

## Límites de trabajo

- Hacer solo lo pedido; no ampliar alcance ni refactorizar de paso.
- No tocar credenciales, `.env*`, configuración global ni permisos.
- No leer ni escribir en la base de producción.
- `docs/` está ignorado por git salvo `docs/orquestacion.md` y `docs/registro-delegaciones.md`: las notas locales (`CONTEXTO-*.md`) no llegan a otros worktrees.

## Si trabajas como worker de Orca (Claude o Codex)

- No recibes la conversación del coordinador: tu tarea es el spec. Si tu rol trae un archivo (`.claude/agents/<rol>.md`), sigue su cuerpo aunque no seas Claude.
- Haz solo la tarea, dentro de las rutas asignadas. No lances otros workers ni subagentes salvo autorización en el spec.
- Ante una duda que cambia el resultado (contrato, alcance, archivo fuera de tu área), usa el comando `ask` de tu preámbulo y espera; no adivines.
- Revisa los mensajes del coordinador con `check` antes de empezar cada archivo y antes de terminar.
- Cierra con un único `worker_done` y `--outcome succeeded` o `failed` (nunca escondas un fallo en el texto). En el cuerpo: qué cambiaste, archivos, comprobaciones con su resultado real y pendientes.
