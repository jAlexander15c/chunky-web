# Registro de delegaciones

Una fila por delegación (subagente o worker). Modelo y esfuerzo **efectivos**. Duración y costo solo si
el runtime los da; si no, "n/d". Causa del reintento: razonamiento, contexto, especificación, herramientas o entorno.
Sirve para validar la política de `docs/orquestacion.md` (sección 8).

| Fecha | Tarea | Tipo | Agente | Modelo / esfuerzo | Comprobaciones | Reintentos (causa) | Resultado | Duración | Costo |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-04 | Prueba: ubicar `getHttp` (lectura) | Subagente | explorador | haiku / — (config anterior) | Registro de uso del modelo | 0 | Correcto | n/d | USD 0.035 (subagente, `claude -p`) |
| 2026-10-04 | Prueba: leer AGENTS.md y comando de pruebas (lectura) | Worker Orca | claude | sonnet / low | `git status` sin cambios | 0 | Correcto | 26 s | n/d |
| 2026-10-04 | Prueba: AGENTS.md cargado + ubicar `httpGet` (lectura) | Worker Orca | codex | gpt-6.1-sol / low | `git status` sin cambios; línea 106 confirmada | 0 | Correcto | 49 s | n/d |
| 2026-10-04 | Revisión UX carrito: mapa del flujo de compra (lectura) | Subagente | Explore | opus (heredado) / medio | Rutas y archivos verificados después al implementar | 0 | Correcto | 164 s | n/d |
| 2026-10-04 | Revisión UX carrito: crítica de diseño en el sitio real a 390 px (impeccable, evaluación A) | Subagente | general-purpose | opus (heredado) / medio | 15 capturas; sin pedidos ni pagos | 0 | Correcto | 382 s | n/d |
| 2026-10-04 | Revisión UX carrito: detector y barrido de accesibilidad (impeccable, evaluación B) | Subagente | general-purpose | opus (heredado) / medio | Detector con 0 hallazgos; barrido manual con archivo:línea | 0 | Correcto; un dato contradijo al mapa (espacio bajo el botón del carrito) | 180 s | n/d |
| 2026-10-05 | Merma: mapa de lotes, salidas y movimientos (lectura) | Subagente | Explore | opus (heredado) / medio | Rutas verificadas al escribir el spec | 0 | Correcto; detectó que los movimientos de lotes van con kind=supply | 159 s | n/d |
| 2026-10-05 | Merma: API (esquema, servicio, rutas, reporte, 9 pruebas) | Worker Orca | codex | gpt-6.1-sol / high | npm test 277/277; tsc --noEmit | 0 (una pregunta de esquema respondida) | Correcto; 3 ajustes menores del revisor aplicados por el coordinador | ~18 min | n/d |
| 2026-10-05 | Merma: revisión del API de Codex | Subagente | revisor | opus / high | npm test 277/277; tsc | 0 | Aprobado sin bloqueantes; 6 observaciones bajas | 285 s | n/d |
| 2026-10-05 | Merma: web (aviso, Se dañó producto, costo por lote, bloque /admin) | Subagente | implementador | sonnet / medium | lint; tsc -b; vitest 70/70 | 0 | Correcto; coordinador conectó el período compartido, B/. y dos detalles de 390 px | 455 s | n/d |
