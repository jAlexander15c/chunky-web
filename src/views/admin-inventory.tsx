import { ProductLotDialog } from "./inventory-arrival-dialog";
import { ProductRecipeDialog } from "./inventory-product-dialog";
import { fetchInventoryReceiptFailures, availabilityLabel } from "@/helpers/inventory";
import type { InventoryReceiptFailure, ProductAvailability } from "@/helpers/inventory";
import { PurchaseDialog } from "./inventory-purchase-dialog";
import { InventoryBatchDialog } from "./inventory-batch-dialog";
import { SupplyToProductDialog } from "./supply-to-product-dialog";
import { WASTE_REASON_LABEL } from "@/helpers/product-waste";
import type { IWasteMovement } from "@/helpers/product-waste";
import { expirationLabel, isIntermediate } from "@/helpers/inventory";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AmountDialog, OpsEmpty, OpsSkeleton } from "@/components";
import {
    HttpError,
    SUPPLY_CATEGORY_LABEL,
    createSupply,
    fetchMovements,
    fetchProducts,
    fetchSupplies,
    formatClock,
    formatCountAge,
    formatDayClock,
    formatInPresentation,
    formatQuantity,
    changeSupplyUnit,
    getPresentation,
    getPageSlice,
    getSafePage,
    registerCount,
    registerProduction,
    registerWaste,
    updateSupply,
} from "@/helpers";
import type { IMovement, IProductStatus, ISupplyStatus, MovementType, ProductState, SupplyCategory, SupplyState } from "@/helpers";
import { AdminBuyNow } from "./admin-buy-now";
import { AdminPagination } from "./admin-pagination";
import { AdminWaste } from "./admin-waste";
import {
    REFRESH_MS,
    TABLE_PAGE_SIZE,
    MOVEMENTS_PAGE_SIZE,
    SEARCH_DEBOUNCE_MS,
    SUPPLY_CATEGORIES,
    SUPPLY_STATE_LABEL,
    SUPPLY_STATE_TONE,
    SUPPLY_STATE_ORDER,
    PRODUCT_STATE_LABEL,
    PRODUCT_STATE_TONE,
    PRODUCT_STATES,
    MOVEMENT_LABEL,
    MOVEMENT_TYPES,
    getMovementOrigin,
    SUPPLY_SORTS,
    getSortedSupplies,
    getSearchKey,
    useDebouncedValue,
} from "./admin/inventory-helpers";
import type { SupplySort } from "./admin/inventory-helpers";
import { CoverageBar, FilterChips, SearchInput } from "./admin/inventory-filters";
import { SupplyFormDialog } from "./admin/inventory-supply-form";

type PendingAction =
    | { kind: "purchase" | "count" | "waste" | "edit" | "batches" | "to-product"; supply: ISupplyStatus }
    | { kind: "production" | "arrival"; product: IProductStatus };

/* ============ Inventario ============ */

interface IAdminInventoryProps {
    token: string;
    onSessionExpired: () => void;
    /** Cambia cuando el tablero leyó recibos nuevos: hay que volver a cargar. */
    refreshKey: number;
    /** Período del encabezado: lo usa la merma. */
    from: string;
    to: string;
}

type SupplyCategoryFilter = SupplyCategory | "todos";
type SupplyStateFilter = SupplyState | "todos";
type ProductStateFilter = ProductState | "todos";
type MovementTypeFilter = MovementType | "todos";
type MovementKindFilter = "supply" | "product" | "todos";

export const AdminInventory = ({ token, onSessionExpired, refreshKey, from, to }: IAdminInventoryProps) => {
    const [receiptFailures,setReceiptFailures]=useState<InventoryReceiptFailure[]>([]);
    const [supplies, setSupplies] = useState<ISupplyStatus[]>([]);
    const [products, setProducts] = useState<IProductStatus[]>([]);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [isCreatingSupply, setIsCreatingSupply] = useState(false);

    // Insumos
    const [supplySearch, setSupplySearch] = useState("");
    const [supplyCategory, setSupplyCategory] = useState<SupplyCategoryFilter>("todos");
    const [supplyState, setSupplyState] = useState<SupplyStateFilter>("todos");
    const [supplySort, setSupplySort] = useState<SupplySort>("urgente");
    const [supplyPage, setSupplyPage] = useState(1);

    // Productos
    const [productSearch, setProductSearch] = useState("");
    const [productState, setProductState] = useState<ProductStateFilter>("todos");
    const [productPage, setProductPage] = useState(1);

    // Movimientos: se filtran y paginan en el servidor
    const [movements, setMovements] = useState<IMovement[]>([]);
    const [movementsTotal, setMovementsTotal] = useState(0);
    const [movementSearch, setMovementSearch] = useState("");
    const [movementType, setMovementType] = useState<MovementTypeFilter>("todos");
    const [movementKind, setMovementKind] = useState<MovementKindFilter>("todos");
    const [movementPage, setMovementPage] = useState(1);
    const [movementsVersion, setMovementsVersion] = useState(0);
    const debouncedMovementSearch = useDebouncedValue(movementSearch.trim(), SEARCH_DEBOUNCE_MS);

    const handleError = useCallback(
        (requestError: unknown, fallback: string) => {
            if (requestError instanceof HttpError && requestError.status === 401) {
                onSessionExpired();
                return;
            }
            setError(requestError instanceof HttpError ? requestError.message : fallback);
        },
        [onSessionExpired]
    );

    const loadStock = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const [suppliesData, productsData, failureData] = await Promise.all([fetchSupplies(token, signal), fetchProducts(token, signal),fetchInventoryReceiptFailures(token,signal)]);
                setReceiptFailures(failureData.failures);
                // El inventario de un producto por lotes se ve en Productos, no como insumo (igual que en Gestión)
                setSupplies(suppliesData.supplies.filter((supply) => supply.inventoryType !== "PREPARED_PRODUCT"));
                setProducts(productsData.products);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                handleError(requestError, "No pudimos cargar el inventario.");
            } finally {
                if (!signal?.aborted) setIsLoading(false);
            }
        },
        [token, handleError]
    );

    useEffect(() => {
        const controller = new AbortController();
        void loadStock(controller.signal);

        const timer = window.setInterval(() => {
            void loadStock();
            setMovementsVersion((version) => version + 1);
        }, REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [loadStock, refreshKey]);

    useEffect(() => {
        const controller = new AbortController();

        fetchMovements(
            token,
            {
                limit: MOVEMENTS_PAGE_SIZE,
                offset: (movementPage - 1) * MOVEMENTS_PAGE_SIZE,
                type: movementType === "todos" ? undefined : movementType,
                kind: movementKind === "todos" ? undefined : movementKind,
                search: debouncedMovementSearch || undefined,
            },
            controller.signal
        )
            .then((data) => {
                setMovements(data.movements);
                setMovementsTotal(data.total);
                // Si entraron o salieron movimientos, la página pedida puede ya no existir
                setMovementPage((page) => getSafePage(page, data.total, MOVEMENTS_PAGE_SIZE));
            })
            .catch((requestError) => {
                if (controller.signal.aborted) return;
                handleError(requestError, "No pudimos cargar los movimientos.");
            });

        return () => controller.abort();
    }, [token, movementPage, movementType, movementKind, debouncedMovementSearch, movementsVersion, refreshKey, handleError]);

    /** Después de registrar algo cambian el stock y los movimientos. */
    const reloadAll = async () => {
        await loadStock();
        setMovementsVersion((version) => version + 1);
    };

    const toBuy = supplies.filter((supply) => supply.state === "comprar" && !isIntermediate(supply));

    const filteredSupplies = useMemo(() => {
        const search = getSearchKey(supplySearch);
        const matching = supplies.filter(
            (supply) =>
                (supplyCategory === "todos" || supply.category === supplyCategory) &&
                (supplyState === "todos" || supply.state === supplyState) &&
                (!search || getSearchKey(`${supply.name} ${supply.supplier ?? ""}`).includes(search))
        );
        return getSortedSupplies(matching, supplySort);
    }, [supplies, supplySearch, supplyCategory, supplyState, supplySort]);

    const filteredProducts = useMemo(() => {
        const search = getSearchKey(productSearch);
        return products.filter(
            (product) =>
                (productState === "todos" || product.state === productState) &&
                (!search || getSearchKey(product.name).includes(search))
        );
    }, [products, productSearch, productState]);

    const currentSupplyPage = getSafePage(supplyPage, filteredSupplies.length, TABLE_PAGE_SIZE);
    const currentProductPage = getSafePage(productPage, filteredProducts.length, TABLE_PAGE_SIZE);
    const hasSupplyFilters = supplySearch.trim() !== "" || supplyCategory !== "todos" || supplyState !== "todos";
    const hasMovementFilters = movementSearch.trim() !== "" || movementType !== "todos" || movementKind !== "todos";

    // Cada filtro vuelve a la primera página: la tercera de otro filtro no significa nada
    const changeSupplyFilter = <T,>(setter: (value: T) => void) => (value: T) => {
        setter(value);
        setSupplyPage(1);
    };
    const changeProductFilter = <T,>(setter: (value: T) => void) => (value: T) => {
        setter(value);
        setProductPage(1);
    };
    const changeMovementFilter = <T,>(setter: (value: T) => void) => (value: T) => {
        setter(value);
        setMovementPage(1);
    };

    const clearSupplyFilters = () => {
        setSupplySearch("");
        setSupplyCategory("todos");
        setSupplyState("todos");
        setSupplyPage(1);
    };

    const clearMovementFilters = () => {
        setMovementSearch("");
        setMovementType("todos");
        setMovementKind("todos");
        setMovementPage(1);
    };

    if (isLoading) return <OpsSkeleton label="Cargando el inventario…" />;

    return (
        <>
            {error ? <p className="adm-error">{error}</p> : null}

            {receiptFailures.length > 0 ? <div className="adm-error" role="alert"><strong>{receiptFailures.length} venta(s) pendientes de conciliar inventario.</strong><p>Revisa los lotes y registra el conteo físico necesario. Se reintentará al sincronizar ventas.</p>{receiptFailures.map(failure=><p key={failure.receiptNumber}>Recibo {failure.receiptNumber}: {failure.error}</p>)}</div> : null}
            {/* ===== Comprar ya ===== */}
            {toBuy.length > 0 ? <AdminBuyNow supplies={toBuy} /> : null}

            {/* ===== Insumos ===== */}
            <section className="adm-band">
                <div className="adm-band__head">
                    <h2 className="script">Insumos</h2>
                    <span className="adm-band__sub">Entran por compra, bajan por conteo</span>
                    <span className="adm-src is-own">Postgres</span>
                </div>

                <div className="adm-card">
                    <div className="adm-toolbar">
                        <SearchInput
                            id="adm-supply-search"
                            label="Buscar insumo"
                            value={supplySearch}
                            onChange={changeSupplyFilter(setSupplySearch)}
                            placeholder="Buscar por nombre o proveedor…"
                        />
                        <label htmlFor="adm-supply-sort" className="adm-sr-only">Ordenar insumos</label>
                        <select
                            id="adm-supply-sort"
                            className="adm-select"
                            value={supplySort}
                            onChange={(event) => changeSupplyFilter(setSupplySort)(event.target.value as SupplySort)}
                        >
                            {SUPPLY_SORTS.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                        </select>
                        <button type="button" className="adm-btn adm-btn--solid" onClick={() => setIsCreatingSupply(true)}>
                            Nuevo insumo
                        </button>
                    </div>

                    <div className="adm-filters">
                        <FilterChips<SupplyCategoryFilter>
                            label="Categoría"
                            value={supplyCategory}
                            onChange={changeSupplyFilter(setSupplyCategory)}
                            options={[
                                { id: "todos", label: "Todos", count: supplies.length },
                                ...SUPPLY_CATEGORIES.map((category) => ({
                                    id: category,
                                    label: SUPPLY_CATEGORY_LABEL[category],
                                    count: supplies.filter((supply) => supply.category === category).length,
                                })),
                            ]}
                        />
                        <FilterChips<SupplyStateFilter>
                            label="Estado"
                            value={supplyState}
                            onChange={changeSupplyFilter(setSupplyState)}
                            options={[
                                { id: "todos", label: "Todos" },
                                ...SUPPLY_STATE_ORDER.map((state) => ({
                                    id: state,
                                    label: SUPPLY_STATE_LABEL[state],
                                    count: supplies.filter((supply) => supply.state === state).length,
                                })),
                            ]}
                        />
                    </div>

                    {supplies.length === 0 ? (
                        <OpsEmpty title="Todavía no hay insumos cargados. Cuando agregues el primero y lo cuentes dos veces, aquí aparece cuánto se gasta por día y cuándo comprar." />
                    ) : filteredSupplies.length === 0 ? (
                        <p className="adm-empty">
                            Ningún insumo con esos filtros.{" "}
                            {hasSupplyFilters ? (
                                <button type="button" className="adm-link" onClick={clearSupplyFilters}>Quitar filtros</button>
                            ) : null}
                        </p>
                    ) : (
                        <>
                            <div className="adm-scroll">
                                <table className="adm-table adm-table--compact adm-table--cards">
                                    <thead>
                                        <tr>
                                            <th>Insumo</th>
                                            <th>Categoría</th>
                                            <th className="num">Quedan</th>
                                            <th className="num">Gasto diario</th>
                                            <th>Alcanza</th>
                                            <th className="num">Mínimo</th>
                                            <th>Último conteo</th><th>Próximo vencimiento</th>
                                            <th>Estado</th>
                                            <th aria-label="Acciones" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {getPageSlice(filteredSupplies, currentSupplyPage, TABLE_PAGE_SIZE).map((supply) => (
                                            <tr key={supply.id} className={supply.state === "comprar" ? "is-crit" : undefined}>
                                                <td className="adm-name">
                                                    {supply.name}
                                                    {isIntermediate(supply) ? <em>Elaborado en el local</em> : supply.supplier ? <em>{supply.supplier}</em> : null}
                                                </td>
                                                <td data-label="Categoría">{SUPPLY_CATEGORY_LABEL[supply.category]}</td>
                                                <td className="num adm-card-qty" data-label="Quedan">
                                                    {formatQuantity(supply.stock)} {supply.unit}
                                                    {getPresentation(supply) ? (
                                                        <small className="adm-qty-pres">{formatInPresentation(supply.stock, getPresentation(supply)!, supply.unit)}</small>
                                                    ) : null}
                                                </td>
                                                <td className="num" data-label="Gasto diario">
                                                    {supply.dailyUse !== null ? (
                                                        `${formatQuantity(supply.dailyUse)} ${supply.unit}`
                                                    ) : (
                                                        <span className="adm-nodata">sin datos</span>
                                                    )}
                                                </td>
                                                <td data-label="Alcanza">
                                                    <CoverageBar daysLeft={supply.daysLeft} />
                                                </td>
                                                <td className="num" data-label="Mínimo">{formatQuantity(supply.minStock)} {supply.unit}</td>
                                                <td data-label="Último conteo">
                                                    <span className={`adm-age${supply.countAge !== null && supply.countAge > 7 ? " is-stale" : ""}`}>
                                                        {formatCountAge(supply.countAge)}
                                                    </span>
                                                </td>
                                                <td data-label="Próximo vencimiento">{expirationLabel(supply.nextExpiration)}</td>
                                                <td className="adm-card-state">
                                                    {supply.stock<=0?<span className="adm-pill is-crit">Agotado</span>:supply.stock<=supply.minStock?<span className="adm-pill is-warn">Stock bajo</span>:null}
                                                    {Number(supply.expiredStock)>0?<span className="adm-pill is-crit">Stock vencido</span>:null}
                                                    {supply.nextExpiration?<span className="adm-pill is-warn">{expirationLabel(supply.nextExpiration)}</span>:null}
                                                    <span className={`adm-pill is-${SUPPLY_STATE_TONE[supply.state]}`}>
                                                        {isIntermediate(supply) && supply.state === "comprar" ? "Preparar" : SUPPLY_STATE_LABEL[supply.state]}
                                                    </span>
                                                </td>
                                                <td className="adm-actions"><button type="button" className="adm-btn adm-btn--sm" onClick={()=>setPending({kind:"batches",supply})}>Lotes</button>
                                                    {isIntermediate(supply) ? null : (
                                                        <button type="button" className="adm-btn adm-btn--sm" onClick={() => setPending({ kind: "purchase", supply })}>
                                                            Compra
                                                        </button>
                                                    )}
                                                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setPending({ kind: "count", supply })}>
                                                        Conteo
                                                    </button>
                                                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setPending({ kind: "waste", supply })}>
                                                        Merma
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="adm-btn adm-btn--sm"
                                                        aria-label={`Editar ${supply.name}`}
                                                        onClick={() => setPending({ kind: "edit", supply })}
                                                    >
                                                        Editar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <AdminPagination
                                page={currentSupplyPage}
                                pageSize={TABLE_PAGE_SIZE}
                                total={filteredSupplies.length}
                                onChange={setSupplyPage}
                            />
                        </>
                    )}
                </div>
            </section>

            {/* ===== Productos ===== */}
            <section className="adm-band">
                <div className="adm-band__head">
                    <h2 className="script">Productos terminados</h2>
                    <span className="adm-band__sub">La venta baja sola desde los recibos de los dos canales</span>
                    <span className="adm-src">Postgres + /receipts</span>
                </div>

                <div className="adm-card">
                    {products.length === 0 ? (
                        <OpsEmpty title="Ningún producto está bajo control de stock todavía. Al activarlos, cada venta los descuenta sola y al llegar a cero se apagan en Loyverse." />
                    ) : (
                        <>
                            <div className="adm-toolbar">
                                <SearchInput
                                    id="adm-product-search"
                                    label="Buscar producto"
                                    value={productSearch}
                                    onChange={changeProductFilter(setProductSearch)}
                                    placeholder="Buscar producto…"
                                />
                            </div>
                            <div className="adm-filters">
                                <FilterChips<ProductStateFilter>
                                    label="Estado"
                                    value={productState}
                                    onChange={changeProductFilter(setProductState)}
                                    options={[
                                        { id: "todos", label: "Todos", count: products.length },
                                        ...PRODUCT_STATES.map((state) => ({
                                            id: state,
                                            label: PRODUCT_STATE_LABEL[state],
                                            count: products.filter((product) => product.state === state).length,
                                        })),
                                    ]}
                                />
                            </div>

                            {filteredProducts.length === 0 ? (
                                <OpsEmpty title="Ningún producto con esos filtros." />
                            ) : (
                                <>
                                    <div className="adm-scroll">
                                        <table className="adm-table adm-table--compact adm-table--cards">
                                            <thead>
                                                <tr>
                                                    <th>Producto</th>
                                                    <th className="num">Hecho hoy</th>
                                                    <th className="num">Queda</th>
                                                    <th>Estado</th>
                                                    <th>Loyverse</th>
                                                    <th aria-label="Acciones" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {getPageSlice(filteredProducts, currentProductPage, TABLE_PAGE_SIZE).map((product) => (
                                                    <tr key={product.variantId} className={product.state === "agotado" ? "is-crit" : undefined}>
                                                        <td className="adm-name">
                                                            {product.name}
                                                            {product.productionMode ? <em>{product.productionMode==="BATCH"?"Stock: "+product.usableStock:"Se pueden preparar: "+product.maxProducible}{product.limitingIngredient?" · Limitado por: "+product.limitingIngredient:""}{product.nextExpiration?" · "+expirationLabel(product.nextExpiration):""}{product.warning?" · "+product.warning:""}</em> : null}
                                                            {product.soldOutAt ? <em>Se agotó a las {formatClock(product.soldOutAt)}</em> : null}
                                                        </td>
                                                        <td className="num" data-label="Hecho hoy">{formatQuantity(product.producedToday)}</td>
                                                        <td className="num adm-card-qty" data-label="Queda">{formatQuantity(product.stock)} <span className="adm-card-unit">u</span></td>
                                                        <td className="adm-card-state">
                                                            <span className={`adm-pill is-${PRODUCT_STATE_TONE[product.state]}`}>
                                                                {product.availabilityMode ? availabilityLabel(product as ProductAvailability) : PRODUCT_STATE_LABEL[product.state]}
                                                            </span>
                                                        </td>
                                                        <td data-label="Loyverse">
                                                            <span className={`adm-age${product.loyverseSynced ? "" : " is-stale"}`}>
                                                                {product.loyverseSynced ? (product.stock > 0 ? "a la venta" : "apagado ✓") : "sincronizando…"}
                                                            </span>
                                                        </td>
                                                        <td className="adm-actions">
                                                            {product.productionMode==="BATCH"?<button type="button" className="adm-btn adm-btn--sm" onClick={()=>setPending({kind:"arrival",product})}>Registrar lote</button>:null}
                                                            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setPending({ kind: "production", product })}>
                                                                Producción
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <AdminPagination
                                        page={currentProductPage}
                                        pageSize={TABLE_PAGE_SIZE}
                                        total={filteredProducts.length}
                                        onChange={setProductPage}
                                    />
                                </>
                            )}
                        </>
                    )}
                </div>
            </section>

            {/* ===== Merma de productos por lotes ===== */}
            <AdminWaste token={token} onSessionExpired={onSessionExpired} refreshKey={refreshKey} from={from} to={to} />

            {/* ===== Movimientos ===== */}
            <section className="adm-band">
                <div className="adm-band__head">
                    <h2 className="script">Movimientos</h2>
                    <span className="adm-band__sub">Todo lo que entró y salió, sin importar de dónde vino</span>
                    <span className="adm-src">Loyverse + Postgres</span>
                </div>

                <div className="adm-card">
                    <div className="adm-toolbar">
                        <SearchInput
                            id="adm-movement-search"
                            label="Buscar en movimientos"
                            value={movementSearch}
                            onChange={changeMovementFilter(setMovementSearch)}
                            placeholder="Buscar insumo o producto…"
                        />
                        <label htmlFor="adm-movement-kind" className="adm-sr-only">Qué mostrar</label>
                        <select
                            id="adm-movement-kind"
                            className="adm-select"
                            value={movementKind}
                            onChange={(event) => changeMovementFilter(setMovementKind)(event.target.value as MovementKindFilter)}
                        >
                            <option value="todos">Insumos y productos</option>
                            <option value="supply">Solo insumos</option>
                            <option value="product">Solo productos</option>
                        </select>
                    </div>
                    <div className="adm-filters">
                        <FilterChips<MovementTypeFilter>
                            label="Tipo"
                            value={movementType}
                            onChange={changeMovementFilter(setMovementType)}
                            options={[
                                { id: "todos", label: "Todos" },
                                ...MOVEMENT_TYPES.map((type) => ({ id: type, label: MOVEMENT_LABEL[type] })),
                            ]}
                        />
                    </div>

                    {movements.length === 0 ? (
                        <p className="adm-empty">
                            {hasMovementFilters ? (
                                <>
                                    Ningún movimiento con esos filtros.{" "}
                                    <button type="button" className="adm-link" onClick={clearMovementFilters}>Quitar filtros</button>
                                </>
                            ) : (
                                "Sin movimientos todavía."
                            )}
                        </p>
                    ) : (
                        <>
                            {movements.map((movement) => (
                                <div className="adm-mv" key={movement.id}>
                                    <span className="adm-mv__time">{formatDayClock(movement.createdAt)}</span>
                                    <span className={`adm-tag is-${movement.type}`}>{movement.referenceType==="PRODUCT_RECEIPT"?"Lote":movement.referenceType==="SUPPLY_PRODUCTION"&&movement.type==="produccion"?"Preparación":MOVEMENT_LABEL[movement.type]}</span>
                                    <span className="adm-mv__what">
                                        {movement.name}
                                        {(movement as IWasteMovement).wasteReason ? (
                                            <span className={`adm-tag is-waste-${(movement as IWasteMovement).wasteReason} adm-mv__reason`}>{WASTE_REASON_LABEL[(movement as IWasteMovement).wasteReason!]}</span>
                                        ) : null}
                                    </span>
                                    <span className={`adm-mv__qty${movement.quantity < 0 ? " is-neg" : " is-pos"}`}>
                                        {movement.quantity > 0 ? "+" : "−"}
                                        {formatQuantity(Math.abs(movement.quantity))} {movement.unit}
                                    </span>
                                    <span className="adm-mv__who">{movement.actorName ?? "—"}</span>
                                    <span className="adm-mv__from">{getMovementOrigin(movement)}</span>
                                </div>
                            ))}
                            <AdminPagination
                                page={movementPage}
                                pageSize={MOVEMENTS_PAGE_SIZE}
                                total={movementsTotal}
                                onChange={setMovementPage}
                            />
                        </>
                    )}
                </div>
            </section>

            {isCreatingSupply ? (
                <SupplyFormDialog
                    onSave={async (supply, conversion) => {
                        const created = await createSupply(token, supply);
                        if (conversion) await changeSupplyUnit(token, created.supply.id, conversion);
                        await reloadAll();
                    }}
                    onClose={() => setIsCreatingSupply(false)}
                />
            ) : null}

            {pending?.kind === "edit" ? (
                <SupplyFormDialog
                    supply={pending.supply}
                    onSave={async (supply, conversion) => {
                        await updateSupply(token, pending.supply.id, supply);
                        if (conversion) await changeSupplyUnit(token, pending.supply.id, conversion);
                        await reloadAll();
                    }}
                    onClose={() => setPending(null)}
                    onConvertToProduct={() => setPending({ kind: "to-product", supply: pending.supply })}
                />
            ) : null}

            {pending?.kind === "to-product" ? (
                <SupplyToProductDialog token={token} supply={pending.supply} onSaved={reloadAll} onClose={() => setPending(null)} />
            ) : null}

            {pending?.kind === "purchase" ? <PurchaseDialog token={token} supply={pending.supply} onSaved={reloadAll} onClose={()=>setPending(null)}/> : null}
            {pending?.kind === "batches" ? <InventoryBatchDialog token={token} supply={pending.supply} onChanged={reloadAll} onClose={()=>setPending(null)}/> : null}

            {pending?.kind === "count" ? (
                <AmountDialog
                    title={`Conteo de ${pending.supply.name}`}
                    hint={`El sistema dice ${getPresentation(pending.supply) ? formatInPresentation(pending.supply.stock, getPresentation(pending.supply)!, pending.supply.unit) : formatQuantity(pending.supply.stock) + " " + pending.supply.unit}. Cuenta solo stock utilizable; los vencidos se descartan en Lotes.`}
                    unit={pending.supply.unit}
                    initial={getPresentation(pending.supply) ? String(pending.supply.stock) : formatQuantity(pending.supply.stock)}
                    presentation={getPresentation(pending.supply)}
                    confirmLabel="Registrar conteo"
                    onConfirm={async (amount) => {
                        await registerCount(token, pending.supply.id, amount);
                        await reloadAll();
                    }}
                    onClose={() => setPending(null)}
                />
            ) : null}

            {pending?.kind === "waste" ? (
                <AmountDialog
                    title={`Merma de ${pending.supply.name}`}
                    hint={`Cuánto se perdió o se dañó. Se resta de los ${formatQuantity(pending.supply.stock)} ${pending.supply.unit} que hay.`}
                    unit={pending.supply.unit}
                    presentation={getPresentation(pending.supply)}
                    confirmLabel="Registrar merma"
                    onConfirm={async (amount) => {
                        await registerWaste(token, pending.supply.id, amount);
                        await reloadAll();
                    }}
                    onClose={() => setPending(null)}
                />
            ) : null}

            {pending?.kind==="arrival"?<ProductLotDialog token={token} product={pending.product} onSaved={reloadAll} onClose={()=>setPending(null)}/>:null}
            {pending?.kind === "production" && pending.product.productionMode ? <ProductRecipeDialog token={token} product={pending.product} onClose={()=>setPending(null)} onChanged={reloadAll}/> : pending?.kind === "production" ? (
                <AmountDialog
                    title={`Producción de ${pending.product.name}`}
                    hint="Cuántas unidades se hicieron. Si es la primera carga del día, reemplaza el saldo anterior."
                    unit="u"
                    confirmLabel="Cargar producción"
                    onConfirm={async (amount) => {
                        await registerProduction(token, pending.product.variantId, amount);
                        await reloadAll();
                    }}
                    onClose={() => setPending(null)}
                />
            ) : null}
        </>
    );
};
