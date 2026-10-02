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
