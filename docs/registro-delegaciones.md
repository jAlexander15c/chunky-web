# Registro de delegaciones

Una fila por delegación (subagente o worker). Modelo y esfuerzo **efectivos**. Duración y costo solo si
el runtime los da; si no, "n/d". Causa del reintento: razonamiento, contexto, especificación, herramientas o entorno.
Sirve para validar la política de `docs/orquestacion.md` (sección 8).

| Fecha | Tarea | Tipo | Agente | Modelo / esfuerzo | Comprobaciones | Reintentos (causa) | Resultado | Duración | Costo |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-04 | Prueba: ubicar `getHttp` (lectura) | Subagente | explorador | haiku / — (config anterior) | Registro de uso del modelo | 0 | Correcto | n/d | USD 0.035 (subagente, `claude -p`) |
| 2026-10-04 | Prueba: leer AGENTS.md y comando de pruebas (lectura) | Worker Orca | claude | sonnet / low | `git status` sin cambios | 0 | Correcto | 26 s | n/d |
| 2026-10-04 | Prueba: AGENTS.md cargado + ubicar `httpGet` (lectura) | Worker Orca | codex | gpt-6.1-sol / low | `git status` sin cambios; línea 106 confirmada | 0 | Correcto | 49 s | n/d |
