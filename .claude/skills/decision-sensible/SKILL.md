---
name: decision-sensible
description: Sube el esfuerzo del coordinador a alto para decidir alcance, contratos, criterios de aceptación y reparto cuando hay incertidumbre significativa, lógica sensible (pagos, caja, inventario, acceso, datos de clientes), concurrencia, seguridad o un bug difícil de diagnosticar. No usar para cambios pequeños o rutinarios.
effort: high
---
# Decisión sensible

Este paso existe para que el coordinador (Opus) piense a fondo **una vez**, sobre evidencia ya reunida, antes de repartir trabajo. No repitas exploración que otro agente ya hizo: parte de su resumen, sus `ruta:línea` y las salidas de pruebas; abre solo lo que falte para decidir.

## Producir, en este orden
1. **Requisitos faltantes**: qué no está claro del pedido. Si cambia el diseño, pregunta al usuario antes de seguir.
2. **Impacto**: qué flujos existentes toca (caja, recibos de Loyverse, inventario, pagos, acceso) y qué podría romperse. Riesgos de concurrencia o doble descuento/cobro.
3. **Contrato**: rutas, cuerpos, respuestas, errores, tipos y tablas. Debe bastar para implementar sin conversar.
4. **Criterios de aceptación** verificables y las comprobaciones exactas.
5. **Reparto** según `docs/orquestacion.md` (sección 3): hacerlo directo, `implementador` (Sonnet) o worker Codex; quién revisa. Una sola revisión independiente salvo hallazgos nuevos.
6. **Hipótesis** (solo en diagnóstico): las candidatas, la evidencia que distingue entre ellas y la comprobación más barata para cada una.

Si después de esto la incertidumbre sigue alta, dilo y propone un escalamiento concreto (`xhigh`, o un worker `opus` + `high` dedicado al diagnóstico) con su motivo.
