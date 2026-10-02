# Traspaso técnico — Inventario, recetas y disponibilidad — chunky-web

Documento para continuar el trabajo sin depender del historial de conversación. El repositorio del backend hermano es `../chunky-api`; allí existe otro `TRASPASO_INVENTARIO.md` con esquema, transacciones y contratos del servidor.

## Estado de publicación y alcance

Fecha de trabajo: 2026-10-02, zona America/Panama.

| Repositorio | Commit de implementación | Ramas remotas verificadas |
| --- | --- | --- |
| chunky-web | `689f38dead31cad9c6982f3635e2d90c7c01947c` | `origin/dev` y `origin/staging` |
| chunky-api | `42abbf2b3604b4372f15d2d48759bdd0ceba78dc` | `origin/dev` y `origin/staging` |

Ambos commits tienen el mensaje «Inventario: lotes, recetas, producción y disponibilidad automática». La promoción fue fast-forward, sin conflictos y sin force push. Se comprobaron las referencias mediante `git ls-remote --heads origin dev staging`. Los workspaces quedaron de nuevo en `dev`.

Al verificar el estado durante la creación de este documento, ambos workspaces estaban en `main`, siguiendo `origin/main`. Se conservó ese estado; no se cambiaron ramas en esta tarea de documentación. El retorno a `dev` descrito arriba corresponde al cierre de la publicación anterior.

Este archivo de traspaso se creó después de publicar esos commits; su creación no implica un commit ni un push adicional. No se verificó un despliegue remoto de Railway ni se ejecutó una migración contra la base productiva.

## Objetivo funcional implementado

Flujo: inventario → presentación de compra → lotes → recetas → producción → disponibilidad del menú.

- Se distinguen RAW_MATERIAL, PACKAGED_ITEM y PREPARED_PRODUCT.
- La unidad de consumo se conserva separada de la presentación de compra.
- Comprar 3 paquetes de 20 agrega 60 unidades de consumo; comprar 4 cajas de 946 ml agrega 3784 ml.
- Las conversiones compatibles son g/kg y ml/l. Rebanadas, unidades y porciones no se convierten entre sí.
- MADE_TO_ORDER depende de ingredientes utilizables y muestra capacidad e ingrediente limitante.
- BATCH depende únicamente de existencias fabricadas, nunca del potencial de producción.
- AUTOMATIC refleja inventario; MANUAL_OFF apaga; MANUAL_ON ofrece el producto y advierte si faltan existencias.
- La producción valida ingredientes, consume, registra movimientos y crea el lote en una transacción.
- El consumo FEFO usa primero el vencimiento más cercano. Sin vencimiento, se usa FIFO.
- Un lote con vencimiento menor o igual al instante de consulta no cuenta, aunque su estado almacenado siga ACTIVE.
- No se inventan vencimientos cuando faltan fecha explícita y vida útil.
- Se preservan compras, conteos, mermas, categorías, proveedores, mínimos y estadísticas anteriores.
- El nuevo control se configura por variante del menú de Loyverse; productos sin configuración conservan su comportamiento previo.

## Validación realizada en la sesión

| Verificación | Resultado observado |
| --- | --- |
| Suite completa backend: `npm test` en chunky-api | 203 tests aprobados, 0 fallos, 0 omitidos |
| Suite web: `npm test -- --run` en chunky-web | 34 tests aprobados en 5 archivos |
| Suite dedicada PostgreSQL real | 6 tests aprobados en una base local desechable |
| Backend: `npm run build` | `tsc` aprobó tipos y compilación |
| Web: `npm run build` | `tsc -b` y Vite aprobaron |
| Web: `npm run lint` | Sin errores |
| Backend lint | No existe script lint en package.json |
| Migración local: `npm run migrate:inventory` | Aprobada en DATABASE_URL=memory; 0 propietarios y 0 diferencias porque la base era efímera/vacía |
| Migración con datos anteriores en PostgreSQL real | Stock conservado, lote de apertura único, vencimiento null y reinicios idempotentes |
| Tests sobre las ramas staging integradas | 203 backend y 34 web aprobados antes del push |
| Verificación visual | Compra, inventario, lotes y producción en 1440 px y 390 px, con datos simulados y sin errores React |

La advertencia de Vite por algunos bundles mayores de 500 kB permanece; no impide el build. Los tests PostgreSQL no se incluyeron en el conteo 203: son una ejecución separada. Las pruebas web existentes se ejecutaron completas; no se añadieron archivos nuevos de tests web.

### Diez casos funcionales solicitados

| Caso | Evidencia |
| --- | --- |
| 1. Compra 3 × 20 | Stock agregado 60 |
| 2. Receta necesita 3, stock 12 | maxProducible 4 |
| 3. Lotes con 5 vencidas y 8 válidas | Stock utilizable 8 |
| 4. AUTOMATIC al momento sin ingredientes | No disponible |
| 5. MANUAL_OFF con inventario | No disponible |
| 6. MANUAL_ON sin inventario | Disponible con advertencia |
| 7. BATCH de 10, venta 3 | Stock 7 |
| 8. FEFO | Se consume primero el lote que vence mañana |
| 9. Producción de 20 sin un ingrediente | Sin producción ni consumo parcial; prueba adicional de rollback real tras un fallo posterior al consumo |
| 10. Potencial 100, fabricadas 6 | Menú informa stock 6 |

## Límites y pendientes que debe conocer otro agente

1. **No hay reserva de inventario durante el pago.** El checkout valida demanda agregada, pero el consumo sigue conectado a la sincronización posterior de recibos existente. Dos sesiones de pago pueden superar esa comprobación antes de la venta. Implementar reservas requiere estados, vencimiento, liberación e idempotencia de pagos; no se construyó esa ampliación.
2. **MANUAL_ON no autoriza inventario negativo.** Permite ofrecerlo; si la venta pagada no puede consumirse, el recibo queda pendiente de conciliación persistente, visible en administración, y se reintenta.
3. **Devoluciones configuradas requieren conciliación física.** No se regeneran ingredientes ni lotes con vencimientos inventados. El comportamiento previo de devoluciones de productos no configurados permanece.
4. **El POS externo depende de la sincronización.** La API excluye vencidos sin cron; Loyverse recibe los cambios mediante la sincronización existente, no de forma instantánea al reloj.
5. **Bloqueo global deliberado.** Garantiza consistencia entre procesos a costa de serializar operaciones. Si crece el volumen, evaluar bloqueos por insumo en orden determinista.
6. **Despliegue/migración real pendiente de comprobación.** Publicar staging no demuestra que Railway desplegó ni que el esquema productivo se migró. El backend actualiza esquema al arrancar.
7. **Subrecetas:** un insumo PREPARED_PRODUCT puede ser ingrediente; no existe un editor recursivo completo. El producto de salida de una receta del menú se maneja en unidades.
8. **Proyecciones antiguas:** columnas escalares se mantienen para compatibilidad; el stock válido debe leerse a través de servicios de lotes, especialmente al vencer sin una nueva mutación.
9. No volver a colocar cálculos de disponibilidad, consumo o conversiones de persistencia en componentes React ni modificar directamente stock como operación nueva.


## Arquitectura de esta web

React 19, TypeScript y Vite. Se conservaron las clases `adm-*` y `ges-*`, la tipografía y los patrones responsive existentes. Las nuevas pantallas son ampliaciones de administración y gestión, no un reemplazo visual.

El menú sigue usando productos y variantes de Loyverse. Los datos calculados de inventario llegan desde el backend. `getHttp.ts` continúa siendo el transporte HTTP compartido, con la API configurada por VITE_API_BASE_URL y la llave existente. Las sesiones utilizan x-admin-token o x-gestion-token según el contexto.

### Recorrido funcional

1. Administración → Inventario → Nuevo insumo/Editar: tipo, unidad de consumo, presentación, cantidad y unidad del contenido, perecibilidad, vida útil y mínimo.
2. Acción Compra: cantidad de presentaciones o cantidad base; el servidor devuelve una vista previa normalizada antes de guardar.
3. Acción Lotes: existencias válidas, vencidas y descartadas, próximo vencimiento y listado de lotes. Permite descartar un lote activo/vencido.
4. Administración → Menú → Receta / Producir lote: elegir variante, buscar ingredientes, editar cantidades/unidades compatibles y rendimiento.
5. Elegir «Al momento» o «Por lotes». En BATCH se crea/enlaza el insumo preparado de salida y se configura vida útil.
6. Guardar receta; después elegir AUTOMATIC, MANUAL_ON o MANUAL_OFF.
7. En BATCH, ingresar cantidad/fecha, pedir ingredientes necesarios y confirmar solo si el servidor indica suficiencia. El servidor revalida al confirmar.
8. Gestión conserva compra, conteo y merma, y muestra estados de disponibilidad más descriptivos.
9. Si hay recibos cuyo consumo falló, administración muestra una alerta con el número de recibo y el motivo. La sincronización posterior los reintenta.

## Archivos creados en el commit 689f38d

| Archivo | Responsabilidad |
| --- | --- |
| [INVENTARIO_IMPLEMENTACION.md](INVENTARIO_IMPLEMENTACION.md) | Resumen inicial de arquitectura, decisiones, migración, validación y límites. |
| [src/helpers/inventory.ts](src/helpers/inventory.ts) | Tipos InventoryType, ProductionMode, AvailabilityMode, Recipe, ProductAvailability, InventoryBatch, BatchDetail, ProductionPreview, PurchaseInput e InventoryReceiptFailure; clientes HTTP nuevos y funciones de presentación. |
| [src/views/inventory-purchase-dialog.tsx](src/views/inventory-purchase-dialog.tsx) | Compra normalizada con preview del servidor, modo BASE/PURCHASE, contenido compatible, fechas y referencia. Reutilizable por administración y gestión. |
| [src/views/inventory-batch-dialog.tsx](src/views/inventory-batch-dialog.tsx) | Detalle de lotes, desglose de stock, consumo/cobertura y acción de descarte. |
| [src/views/inventory-recipe-dialog.tsx](src/views/inventory-recipe-dialog.tsx) | Editor por variante, ingredientes, rendimiento, preparación, insumo de salida, modos de disponibilidad, preview y confirmación de producción. |
| [src/views/inventory-product-dialog.tsx](src/views/inventory-product-dialog.tsx) | Adaptador de IProductStatus a IMenuItem para abrir el mismo editor desde inventario. |

Este archivo `TRASPASO_INVENTARIO.md` es una creación posterior de documentación, fuera del commit anterior.

## Archivos modificados en el commit 689f38d

| Archivo | Cambio realizado |
| --- | --- |
| [eslint.config.js](eslint.config.js) | Ignora .remember/tmp/**, donde existía un archivo temporal ajeno a esta implementación que provocaba errores de lint. |
| [src/helpers/admin.ts](src/helpers/admin.ts) | Amplía insumos, estados de producto, entradas de formulario y menú con metadatos de inventario, variantes y disponibilidad. Agrega tipos de movimiento consumo/vencimiento. |
| [src/helpers/catalog.ts](src/helpers/catalog.ts) | Invalida caché de productos al vencer el próximo lote/ingrediente; temporizador de refetch al vencimiento y refresh periódico para variantes con control de inventario. Conserva caché por categoría y modo normal/pasta. |
| [src/helpers/gestion.ts](src/helpers/gestion.ts) | ISaleAvailability incorpora el estado calculado de inventario, con compatibilidad para productos sin configuración. |
| [src/interfaces/items.ts](src/interfaces/items.ts) | IItemVariant admite inventoryAvailability opcional. |
| [src/views/admin-inventory.tsx](src/views/admin-inventory.tsx) | Amplía formulario de insumo, columnas/indicadores de vencimiento y stock; conecta compra/lotes/receta; conserva conteos, mermas, filtros, paginación y producción previa para productos no configurados. Muestra fallos persistentes de recibos. |
| [src/views/admin-menu.tsx](src/views/admin-menu.tsx) | Acción de receta/producción por variante, estados calculados y refresco del menú cada 60 segundos. |
| [src/views/admin.css](src/views/admin.css) | Permite reutilizar variables de estilo en .inventory-dialog, conservando las dimensiones/fondo de la página .adm separados del modal. |
| [src/views/gestion.tsx](src/views/gestion.tsx) | Importa estilos administrativos necesarios para el modal compartido de compra. |
| [src/views/gestion/disponibilidad.tsx](src/views/gestion/disponibilidad.tsx) | Muestra capacidad/stock, limitante, advertencias, próximo vencimiento y estados manuales. La acción previa de disponibilidad mantiene compatibilidad y refleja su modo manual. |
| [src/views/gestion/inventario.tsx](src/views/gestion/inventario.tsx) | Sustituye el registro simple de compra por PurchaseDialog; mantiene conteos y mermas existentes. |

El commit contiene 17 archivos: 6 nuevos y 11 modificados. Las notas `AUDITORIA_REPO.md` y `BITACORA_AUDITORIA.md` ya existían sin seguimiento; no se tocaron ni se incluyeron en los commits.

## Contratos de frontend que conviene preservar

### Cantidades y unidades

- PurchaseInput.quantity, Recipe.yieldQuantity e ingredientes usan strings decimales para no perder precisión en la solicitud.
- El formulario convierte coma decimal a punto; el backend valida y calcula.
- `compatibleUnits` limita opciones de edición; el backend vuelve a validar compatibilidad.
- Se mantienen los códigos anteriores u y L donde corresponden. No reinterpretar la unidad base de un insumo con historial.
- `panamaDateTime` convierte una fecha del formulario a medianoche con offset -05:00; vencimiento es un instante, no un texto de día completo.
- El importe de «Se agregarán» viene de /purchase-preview. No duplicar esa multiplicación como fuente de verdad en React.
- La suficiencia de producción viene de /production-preview y la mutación final puede rechazar por cambios concurrentes.

### Disponibilidad

`ProductAvailability` trae availabilityMode, productionMode, isAvailable, usableStock, maxProducible, limitingIngredient, nextExpiration y warning.

- En BATCH, mostrar usableStock; maxProducible es una ayuda de producción y no stock de venta.
- En MADE_TO_ORDER, mostrar maxProducible y limitante.
- Los campos son opcionales en los tipos heredados para no romper variantes no configuradas.
- `availabilityLabel` expresa Disponible, Agotado automáticamente, Disponible manualmente o Apagado manualmente.
- `expirationLabel` es presentación del vencimiento; la exclusión real del stock la decide la API.
- Después de editar la receta, el estado saved se invalida. Hay que guardar antes de cambiar disponibilidad o producir.
- El diálogo pide la variante si el producto tiene varias; no reducir el control a itemId.

### Caché y refresco

El catálogo conserva su caché normal de cinco minutos. Si hay nextExpiration ya alcanzado, la entrada no se reutiliza. Un temporizador pide estado nuevo al vencimiento más próximo, y las variantes configuradas activan el refresh existente cada 30 segundos con la pestaña visible y al recuperar foco. La API calcula disponibilidad después del caché de Loyverse, por lo que la respuesta nueva no depende de un cron.

No usar la caché de frontend para aceptar una venta: el checkout y el consumo validan en el servidor.

## Pruebas visuales y herramientas utilizadas

Se usó Chromium/Playwright con una vista de prueba temporal que importaba los componentes reales y las hojas de estilo. Se interceptaron las solicitudes externas para devolver datos de prueba.

Se comprobaron:
- Inventario con un insumo bajo mínimo, vencimiento próximo y stock vencido simultáneos.
- Compra de Jamón de Pavo: 3 paquetes de 20 → preview 60 y botón habilitado.
- Detalle de lotes con estados ACTIVE y EXPIRED.
- Receta BATCH, stock fabricado 6 y potencial 100.
- Producción de 20 con necesidad 60 y disponible 36: confirmación deshabilitada.
- Escritorio 1440 × 1000 y móvil 390 × 844.
- Sin errores pageerror/React durante el recorrido.

Los archivos temporales `__inventory_preview.html` y `src/__inventory_preview.jsx` se eliminaron después de verificar. Playwright/Prettier de apoyo se instalaron en Temp; no se agregaron dependencias al repositorio. Las capturas de apoyo quedaron en Temp, no en Git.

## Cómo retomar y verificar

1. Leer este documento y el del backend.
2. Revisar `git status` y los commits publicados; no incluir accidentalmente notas locales.
3. Para pruebas reales de la web, usar una API local/staging que tenga el esquema y las rutas nuevas. La URL por defecto del helper HTTP apunta al servicio productivo existente: configurar el entorno de desarrollo antes de hacer mutaciones de prueba.
4. Ejecutar:

```powershell
npm test -- --run
npm run lint
npm run build
```

5. Probar una compra por presentación, una receta al momento, producción por lote, modos manuales y vencimiento.
6. Los cambios posteriores a este documento necesitan su propia validación; los resultados anteriores son evidencia de la sesión, no garantía de futuros cambios.


## Ajuste posterior: registrar llegada de productos terminados (2026-10-02)

Este ajuste se realizó después de los commits publicados anteriormente. El usuario autorizó el 2026-10-02 su publicación en dev y promoción a staging y main en ambos repositorios. Consultar git log y las ramas remotas para identificar el commit publicado.

### Flujo aprobado por la solicitud
Una persona con rol inventario entra a Gestión → Insumos → Productos, elige Registrar llegada e indica solamente la cantidad recibida. El servidor registra el instante de llegada y calcula el vencimiento con la vida útil previamente configurada en el insumo preparado de salida.

Ejemplo: llegaron 7 galletas, vida útil 5 días → lote nuevo de 7, fecha de llegada del servidor, vencimiento llegada + 5 días y disponibilidad automática basada en esas 7 unidades. Otra llegada de 2 crea otro lote y lleva el stock a 9; no reemplaza el saldo diario.

La llegada no consume ingredientes ni incrementa producedToday: los productos ya llegaron terminados. La producción interna con receta continúa como operación distinta. Los productos no configurados mantienen su flujo anterior y los MADE_TO_ORDER no muestran una acción de llegada.

### Backend
- Nuevo: src/modules/inventory/product-receipt.service.ts.
- Modificados: inventory-batches.controller.ts, availability.service.ts, admin.routes.ts, gestion.routes.ts, test/inventory-batches.test.ts, test/gestion.test.ts y test/inventory-postgres.test.ts.
- POST /gestion/products/:variantId/receive requiere sesión y rol inventario.
- POST /admin/products/:variantId/receive requiere sesión administrativa.
- Payload: quantity decimal entero positivo en string y requestId UUID opcional. No acepta receivedAt ni expirationDate del cliente.
- El servicio exige configuración BATCH y salida preparada activa. Usa inventoryTransaction, crea lote origin=PRODUCT_RECEIPT, movimiento PURCHASE con referenceType=PRODUCT_RECEIPT, actor y referenceId, y actualiza las proyecciones.
- La fecha se genera en el servidor después de tomar el bloqueo. El vencimiento se calcula desde supplies.is_perishable y supplies.shelf_life_days, que también llegan a la UI en ProductAvailability.
- Sin datos suficientes de vida útil se registra expirationDate=null; no se inventa una fecha.
- El requestId estable del diálogo evita duplicación si se perdió la respuesta POST. Bajo bloqueo, el servicio recupera el movimiento/lote anterior y sus fechas. Reutilizarlo para otro producto o cantidad se rechaza.
- Se reutilizan las tablas/columnas existentes; no se agregó una migración de esquema.

### Web
- Nuevo: src/views/inventory-arrival-dialog.tsx.
- Modificados: src/helpers/inventory.ts, src/helpers/admin.ts, src/views/gestion/inventario.tsx, src/views/admin-inventory.tsx y src/components/amount-dialog.css.
- ProductArrivalDialog reutiliza AmountDialog: un único input de cantidad, explicación de fecha/vida útil y botón Registrar llegada.
- El requestId se crea una vez al montar el diálogo y se conserva para reintentos; no se muestra al usuario.
- Gestión reemplaza la acción Cargar producción por Registrar llegada para BATCH y muestra el próximo vencimiento. Administración también ofrece llegada, conservando producción interna.
- El historial de Gestión presenta esos movimientos como Llegada mediante referenceType.
- Ajuste mínimo responsive del diálogo compartido: box-sizing, min-width y columna grid limitada al ancho de pantalla. Se detectó y corrigió un desbordamiento en 390 px.

### Validación adicional
- TDD: los tests iniciales fallaron por endpoint inexistente y servicio ausente antes de implementar.
- Siete unidades, cinco días, fecha del servidor, ingredientes sin stock y sin consumo.
- Llegada posterior suma otro lote.
- Cantidades fraccionadas y productos MADE_TO_ORDER rechazados.
- Sin vida útil no inventa vencimiento.
- Permisos: inventario permitido, caja rechazado, sesión ausente rechazada.
- Payload con fechas alteradas rechazado.
- Reintento con mismo requestId no duplica; cantidad diferente con esa referencia rechazada.
- PostgreSQL real: fallo al insertar movimiento revierte el lote; reintentos concurrentes agregan una sola entrada; reiniciar migración no duplica el saldo.
- Suite backend: 207 aprobados. PostgreSQL separado: 7 aprobados.
- Verificación visual con componentes/proveedor/estilos reales, datos simulados, escritorio 1440 px y móvil 390 px. Un solo input, vencimiento por vida útil, guardado de 7 y pérdida simulada de respuesta seguida de reintento sin duplicación.
- Las vistas temporales de verificación se retiraron. No se añadieron dependencias al repositorio.
