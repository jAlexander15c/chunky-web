# Inventario, recetas, lotes y disponibilidad — 2026-10-02

## Arquitectura inspeccionada
La web usa React 19, TypeScript y Vite. El backend vive en el repositorio hermano `chunky-api` y usa Express, pg y PostgreSQL; no usa Prisma. Los modelos originales son `supplies`, `inventory_movements` y `product_stock`. El esquema se actualiza al iniciar en `ensureDbSchema`. El menú y sus variantes vienen de Loyverse.

El stock anterior era una columna escalar. Compras, conteos y mermas generaban movimientos en español; las estadísticas de consumo se calculaban entre conteos. La producción de productos sin receta reemplazaba la producción diaria. Las ventas se aplicaban al sincronizar recibos de Loyverse, después del pago. Se conserva este comportamiento para variantes aún no configuradas.

## Modelo y decisiones
- Se mantiene `supplies.unit` como unidad base para conservar endpoints y datos. La API también devuelve `baseUnit`. La presentación de compra y su contenido pueden usar una unidad compatible.
- Tipos RAW_MATERIAL, PACKAGED_ITEM y PREPARED_PRODUCT, perecibilidad y vida útil son metadatos de insumos.
- `inventory_batches` conserva entradas, producción, vencimientos y cantidades iniciales/restantes.
- Se amplía el movimiento existente con tipo normalizado, lote y referencia; no se elimina su historial.
- `product_inventory` configura cada variante del menú. `recipes` e `recipe_ingredients` contienen rendimiento e ingredientes.
- Un producto por lote genera un insumo preparado de salida, reutilizable como ingrediente de otra receta. No se construye una interfaz recursiva de subrecetas.
- Cantidades importantes se calculan como enteros BigInt de seis decimales y se guardan en NUMERIC(18,6). Los números de los endpoints anteriores son proyecciones para presentación.
- Cada mutación central usa BEGIN/COMMIT/ROLLBACK y un bloqueo PostgreSQL compartido `SELECT ... FOR UPDATE`. Serializa el inventario entre procesos y evita consumir el mismo stock dos veces.
- FEFO prioriza vencimientos; sin vencimiento se usa FIFO por fecha de entrada. Un lote con expiration_date <= now se excluye aunque siga ACTIVE.
- AUTOMATIC usa ingredientes en MADE_TO_ORDER y únicamente stock fabricado en BATCH. MANUAL_ON permite ofrecerlo con advertencia; MANUAL_OFF lo apaga.
- Disponibilidad se calcula después del caché del catálogo bruto. La caché del navegador se invalida al alcanzar el próximo vencimiento.
- Las referencias de venta son idempotentes. Se aceptan fracciones exactas de venta para preservar los recibos existentes de pagos mixtos; la producción del menú usa unidades enteras.
- Los recibos con consumo fallido se guardan para reintento persistente y se muestran en administración. Las devoluciones de alimentos configurados requieren conciliación física: no regeneran ingredientes ni vencimientos.

## Servicios y endpoints
`batch.service`, `supply.operations`, `recipe.service`, `production.service`, `availability.service` y `demand.service` centralizan las reglas. Los componentes solo editan formularios y muestran resultados.

Se conservan /supplies, /purchase, /count, /waste, /products y /production. Se agregan:
- /admin/supplies/:id/purchase-preview
- /admin/supplies/:id/batches y /:batchId/discard
- /admin/products/:variantId/recipe (GET, PUT, DELETE)
- /admin/products/:variantId/production-preview y /batches
- /admin/products/:variantId/availability-mode y /consume
- /admin/inventory-receipt-failures

Las rutas administrativas mantienen sus guardias de sesión. Gestión permite compra normalizada con su rol de inventario.

## Pantallas
Se amplían el formulario de insumo, compra, tabla de inventario, detalle de lotes y estados de productos. El menú ofrece el editor de receta y producción. Se reutilizan las clases, estilos y tipografías del proyecto y el scroll de tablas en móvil.

## Orden realizado
1. Modelo aditivo y estrategia de apertura por lotes.
2. Compras normalizadas, conteos, mermas, stock utilizable y FEFO.
3. Recetas, conversiones, rendimiento y limitante.
4. Producción transaccional y consumo de ventas.
5. Disponibilidad en API pública, pedidos, administración y Loyverse.
6. Formularios y detalles con diseño existente.
7. Ejecución y conciliación de migración en bases de prueba, verificaciones de regresión y PostgreSQL real.

## Migración y despliegue
La migración se ejecuta al iniciar el backend y también con `npm run migrate:inventory` desde chunky-api. Con DATABASE_URL=memory se inicializa una base efímera; no modifica una base productiva.

Antes del despliegue, respaldar PostgreSQL y ejecutar el comando con DATABASE_URL del entorno destino. El comando devuelve propietarios migrados y diferencias de proyección. No se incluyeron credenciales ni conexiones productivas en las verificaciones.

Cada stock previo positivo crea exactamente un lote MIGRATION_INITIAL_STOCK sin vencimiento y un movimiento de apertura. Se registran marcadores idempotentes. Existencias negativas requieren conciliación explícita. Si un insumo nuevo ya tiene lotes, reiniciar no duplica su saldo. Nombre, categorías, proveedores, mínimos, compras, conteos, mermas y estadísticas anteriores permanecen.

Las variantes sin receta conservan su disponibilidad anterior en Loyverse. Configurar una receta habilita el nuevo control automático; cambiar a modo manual es una acción explícita.

## Riesgos y límites
- El bloqueo global prioriza consistencia; con gran volumen conviene migrar a bloqueos por insumo en orden estable.
- El checkout valida la demanda agregada, pero no reserva stock durante sesiones de pago. El consumo continúa en la sincronización de recibos del flujo existente. Añadir reservas con vencimiento y reconciliación de pagos es una evolución separada.
- MANUAL_ON puede generar ventas sin inventario: quedan pendientes de conciliación en lugar de descontar parcialmente o inventar existencias.
- La API aplica vencimientos sin cron. La propagación al POS externo depende de la frecuencia de sincronización existente.
- La migración se ejecutó y verificó en PostgreSQL local desechable y en el entorno de memoria. El despliegue contra la base real permanece pendiente.
- La interfaz recursiva de subrecetas queda para una fase posterior; insumos preparados ya pueden ser ingredientes.
- Vite conserva una advertencia de tamaño de algunos bundles.

## Validación
Los diez casos solicitados están cubiertos. Se añadieron pruebas de conversiones, ventas fraccionadas y demanda compartida, autenticación y endpoints, migración idempotente, rollback después de consumir ingredientes, concurrencia real, idempotencia de ventas y recuperación persistente de recibos.
Se verificaron visualmente compra, inventario, lotes y producción en escritorio (1440 px) y móvil (390 px), con respuestas simuladas y sin llamadas de negocio a producción.

Verificación final: 203 tests de backend, 34 de web y 6 de PostgreSQL real pasaron. Typecheck/build de ambos repositorios y lint de la web pasaron. El backend no define un script lint.


## Ajuste posterior: registrar llegada de productos terminados (2026-10-02)

Este ajuste se realizó después de los commits publicados anteriormente y sigue como cambio local; no se publicó automáticamente a dev/staging ni se ejecutó un despliegue.

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
