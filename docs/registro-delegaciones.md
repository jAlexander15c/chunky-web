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
