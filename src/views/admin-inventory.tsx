import {ProductLotDialog} from "./inventory-arrival-dialog";
import {ProductRecipeDialog} from "./inventory-product-dialog";
import {fetchInventoryReceiptFailures,availabilityLabel} from "@/helpers/inventory";
import type {InventoryReceiptFailure,ProductAvailability} from "@/helpers/inventory";
import {PurchaseDialog} from "./inventory-purchase-dialog";
import {InventoryBatchDialog} from "./inventory-batch-dialog";
import {compatibleUnits,expirationLabel} from "@/helpers/inventory";
import type {InventoryType} from "@/helpers/inventory";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { AmountDialog } from "@/components";
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
    formatQuantity,
    getPageSlice,
    getSafePage,
    registerCount,
    registerProduction,
    registerWaste,
    updateSupply,
} from "@/helpers";
import type {
    IMovement,
    IProductStatus,
    ISupplyInput,
    ISupplyStatus,
    MovementType,
    ProductState,
    SupplyCategory,
    SupplyState,
} from "@/helpers";

import { AdminBuyNow } from "./admin-buy-now";
import { AdminPagination } from "./admin-pagination";

/** La cocina carga producción mientras alguien mira: se refresca solo. */
const REFRESH_MS = 60000;
const TABLE_PAGE_SIZE = 8;
const MOVEMENTS_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

const SUPPLY_STATE_LABEL: Record<SupplyState, string> = {
    comprar: "Comprar",
    pedir: "Pedir pronto",
    contar: "Contar",
    bien: "Bien",
};

const SUPPLY_STATE_TONE: Record<SupplyState, string> = {
    comprar: "crit",
    pedir: "warn",
    contar: "warn",
    bien: "ok",
};

/** Lo urgente primero: así se leen en "Primero lo urgente". */
const SUPPLY_STATE_ORDER: SupplyState[] = ["comprar", "pedir", "contar", "bien"];

/** La barra de "Alcanza" se llena del todo con esta cantidad de días: más que eso ya no preocupa. */
const COVERAGE_FULL_DAYS = 14;

type CoverageTone = "crit" | "warn" | "ok";

/**
 * De qué color va la barra de "Alcanza" según los días que quedan al ritmo de consumo actual.
 * TODO(usuario): decidir los cortes. Dependen de cuánto tarda cada proveedor en entregar.
 */
const getCoverageTone = (daysLeft: number): CoverageTone => {
    if (daysLeft < 3) return "crit";
    if (daysLeft < 7) return "warn";
    return "ok";
};

/** Cuántos días alcanza el insumo, en número y en barra. Sin dos conteos no hay consumo y no se inventa un número. */
const CoverageBar = ({ daysLeft }: { daysLeft: number | null }) => {
    if (daysLeft === null) return <span className="adm-nodata">falta un 2.º conteo</span>;

    return (
        <span className={`adm-cover is-${getCoverageTone(daysLeft)}`}>
            <span className="adm-cover__track" aria-hidden="true">
                <i style={{ width: `${Math.min(100, Math.max(4, (daysLeft / COVERAGE_FULL_DAYS) * 100))}%` }} />
            </span>
            <b>{daysLeft} d</b>
        </span>
    );
};

const PRODUCT_STATE_LABEL: Record<ProductState, string> = {
    agotado: "Agotado",
    poco: "Queda poco",
    disponible: "A la venta",
    "sin-control": "Sin control",
};

const PRODUCT_STATE_TONE: Record<ProductState, string> = {
    agotado: "crit",
    poco: "warn",
    disponible: "ok",
    "sin-control": "idle",
};

const PRODUCT_STATES: ProductState[] = ["agotado", "poco", "disponible", "sin-control"];

const MOVEMENT_LABEL: Record<MovementType, string> = {
    compra: "Compra",
    conteo: "Conteo",
    produccion: "Producción",
    venta: "Venta",
    merma: "Merma",
    ajuste: "Ajuste",
    consumo:"Consumo de receta",vencimiento:"Vencimiento",faltante:"Faltante",
};

const MOVEMENT_TYPES: MovementType[] = ["compra", "conteo", "produccion", "venta", "merma", "ajuste","consumo","vencimiento","faltante"];

const getMovementOrigin = (movement: IMovement) => {
    const from = movement.source === "web" ? "web" : movement.source === "loyverse" ? "mostrador" : "local";
    return movement.reference ? `${movement.reference} · ${from}` : from;
};

type SupplySort = "urgente" | "nombre" | "dias" | "conteo";

const SUPPLY_SORTS: { id: SupplySort; label: string }[] = [
    { id: "urgente", label: "Primero lo urgente" },
    { id: "nombre", label: "Nombre A–Z" },
    { id: "dias", label: "Alcanza menos días" },
    { id: "conteo", label: "Conteo más viejo" },
];

/** Sin dato se va al final: un insumo sin conteos no es el que menos dura. */
const compareNullable = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);

const getSortedSupplies = (supplies: ISupplyStatus[], sort: SupplySort) =>
    [...supplies].sort((a, b) => {
        if (sort === "nombre") return a.name.localeCompare(b.name, "es");
        if (sort === "dias") return compareNullable(a.daysLeft, b.daysLeft) || a.name.localeCompare(b.name, "es");
        // El conteo más viejo primero; nunca contado es lo más viejo que hay
        if (sort === "conteo") return (b.countAge ?? Infinity) - (a.countAge ?? Infinity) || a.name.localeCompare(b.name, "es");
        return (
            SUPPLY_STATE_ORDER.indexOf(a.state) - SUPPLY_STATE_ORDER.indexOf(b.state) ||
            compareNullable(a.daysLeft, b.daysLeft) ||
            a.name.localeCompare(b.name, "es")
        );
    });

/** Sin tildes ni mayúsculas: "azucar" encuentra "Azúcar". */
const getSearchKey = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();

const useDebouncedValue = (value: string, delay: number) => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);

    return debounced;
};

/* ============ Alta y edición de insumo ============ */

const SUPPLY_UNITS = [
    { value: "kg", label: "kilos (kg)" },
    { value: "g", label: "gramos (g)" },
    { value: "L", label: "litros (L)" },
    { value: "ml", label: "mililitros (ml)" },
    { value: "u", label: "unidades (u)" },
    {value:"slice",label:"rebanadas"},
    {value:"portion",label:"porciones"},
];

const SUPPLY_CATEGORIES: SupplyCategory[] = ["alimento", "limpieza", "mantenimiento"];

interface ISupplyFormProps {
    /** Con un insumo es edición: el formulario arranca con sus datos. */
    supply?: ISupplyStatus;
    onSave: (supply: ISupplyInput) => Promise<void>;
    onClose: () => void;
}

const SupplyFormDialog = ({ supply, onSave, onClose }: ISupplyFormProps) => {
    const isEditing = Boolean(supply);
    const [name, setName] = useState(supply?.name ?? "");
    const [unit, setUnit] = useState(supply?.unit ?? "kg");
    const [category, setCategory] = useState<SupplyCategory>(supply?.category ?? "alimento");
    const [minStock, setMinStock] = useState(supply ? formatQuantity(supply.minStock) : "");
    const [supplier, setSupplier] = useState(supply?.supplier ?? "");
    const [purchaseUnit, setPurchaseUnit] = useState(supply?.purchaseUnit ?? "");
    const [purchaseSize, setPurchaseSize] = useState(supply?.purchaseSize ? formatQuantity(supply.purchaseSize) : "");
    const [inventoryType,setInventoryType]=useState<InventoryType>(supply?.inventoryType ?? "RAW_MATERIAL");
    const [contentUnit,setContentUnit]=useState(supply?.contentUnit ?? supply?.unit ?? "kg");
    const [isPerishable,setIsPerishable]=useState(supply?.isPerishable ?? false);
    const [shelfLifeDays,setShelfLifeDays]=useState(supply?.shelfLifeDays ? String(supply.shelfLifeDays) : "");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const toNumber = (value: string) => Number(value.replace(",", "."));

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        const parsedMin = minStock.trim() ? toNumber(minStock) : 0;
        const parsedSize = purchaseSize.trim() ? toNumber(purchaseSize) : undefined;

        if (name.trim().length < 2) {
            setError("El nombre necesita al menos dos letras.");
            return;
        }
        if (!Number.isFinite(parsedMin) || parsedMin < 0) {
            setError("El mínimo tiene que ser un número.");
            return;
        }
        // El API rechaza un tamaño de compra en cero: o hay un número válido, o no se manda
        if (parsedSize !== undefined && (!Number.isFinite(parsedSize) || parsedSize <= 0)) {
            setError("El contenido por unidad de compra tiene que ser mayor que cero.");
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onSave({
                name: name.trim(),
                unit,
                category,
                minStock: parsedMin,
                supplier: supplier.trim() || undefined,
                purchaseUnit: purchaseUnit.trim() || undefined,
                purchaseSize: parsedSize,inventoryType,contentUnit,isPerishable,shelfLifeDays:isPerishable&&shelfLifeDays?Number(shelfLifeDays):null,
            });
            onClose();
        } catch (requestError) {
            setError(
                requestError instanceof HttpError
                    ? requestError.message
                    : isEditing
                      ? "No se pudo guardar el insumo."
                      : "No se pudo crear el insumo."
            );
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label={isEditing ? `Editar ${supply?.name}` : "Nuevo insumo"}>
            <form className="adm-modal__panel adm-modal__panel--wide" onSubmit={submit}>
                <h3 className="script">{isEditing ? "Editar insumo" : "Nuevo insumo"}</h3>
                <p className="adm-modal__hint">
                    {isEditing
                        ? "Aquí se cambian los datos, no el stock: eso va por compra, conteo o merma."
                        : "El stock arranca en cero: se carga con el primer conteo o con una compra."}
                </p>

                <div className="adm-form">
                    <label className="adm-form__row adm-form__row--full">
                        <span>Nombre</span>
                        <input
                            className="adm-form__input"
                            type="text"
                            autoFocus
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Harina panadera"
                        />
                    </label>

                    <label className="adm-form__row">
                        <span>Unidad de consumo</span>
                        <select className="adm-form__input" value={unit} disabled={isEditing} onChange={(event) => {setUnit(event.target.value);setContentUnit(event.target.value);}}>
                            {SUPPLY_UNITS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>

                    <label className="adm-form__row"><span>Tipo</span><select className="adm-form__input" value={inventoryType} onChange={e=>setInventoryType(e.target.value as InventoryType)}><option value="RAW_MATERIAL">Materia prima</option><option value="PACKAGED_ITEM">Producto empacado</option><option value="PREPARED_PRODUCT">Producto preparado</option></select></label>
                    <label className="adm-form__row"><span>¿Es perecedero?</span><select className="adm-form__input" value={String(isPerishable)} onChange={e=>setIsPerishable(e.target.value==="true")}><option value="false">No</option><option value="true">Sí</option></select></label>
                    <label className="adm-form__row"><span>Vida útil predeterminada (días)</span><input className="adm-form__input" type="number" min={1} max={3650} disabled={!isPerishable} value={shelfLifeDays} onChange={e=>setShelfLifeDays(e.target.value)}/></label>
                    <label className="adm-form__row">
                        <span>Categoría</span>
                        <select
                            className="adm-form__input"
                            value={category}
                            onChange={(event) => setCategory(event.target.value as SupplyCategory)}
                        >
                            {SUPPLY_CATEGORIES.map((option) => (
                                <option key={option} value={option}>{SUPPLY_CATEGORY_LABEL[option]}</option>
                            ))}
                        </select>
                    </label>

                    <label className="adm-form__row">
                        <span>Mínimo antes de avisar</span>
                        <input
                            className="adm-form__input"
                            type="text"
                            inputMode="decimal"
                            value={minStock}
                            onChange={(event) => setMinStock(event.target.value)}
                            placeholder="15"
                        />
                    </label>

                    <label className="adm-form__row adm-form__row--full">
                        <span>Proveedor <em>opcional</em></span>
                        <input
                            className="adm-form__input"
                            type="text"
                            value={supplier}
                            onChange={(event) => setSupplier(event.target.value)}
                            placeholder="Molinos Modernos"
                        />
                    </label>

                    <label className="adm-form__row">
                        <span>Presentación de compra <em>opcional</em></span>
                        <input
                            className="adm-form__input"
                            type="text"
                            value={purchaseUnit}
                            onChange={(event) => setPurchaseUnit(event.target.value)}
                            placeholder="saco"
                        />
                    </label>

                    <label className="adm-form__row">
                        <span>Contenido por presentación</span>
                        <input
                            className="adm-form__input"
                            type="text"
                            inputMode="decimal"
                            value={purchaseSize}
                            onChange={(event) => setPurchaseSize(event.target.value)}
                            placeholder="25"
                        />
                    </label>
                    <label className="adm-form__row"><span>Unidad del contenido</span><select className="adm-form__input" value={contentUnit} onChange={e=>setContentUnit(e.target.value)}>{compatibleUnits(unit).map(u=><option key={u}>{u}</option>)}</select></label>
                </div>

                <p className="adm-form__note">
                    {purchaseUnit&&purchaseSize ? <>1 {purchaseUnit} contiene {purchaseSize} {contentUnit}. Las compras se convertirán a {unit} antes de agregarse al inventario.</> : "Configura la presentación y su contenido para comprar en paquetes, cajas o sacos."}
                </p>

                {error ? <p className="adm-gate__error">{error}</p> : null}

                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending}>
                        {isEditing ? (isSending ? "Guardando…" : "Guardar cambios") : isSending ? "Creando…" : "Crear insumo"}
                    </button>
                </div>
            </form>
        </div>
    );
};

type PendingAction =
    | { kind: "purchase" | "count" | "waste" | "edit" | "batches"; supply: ISupplyStatus }
    | { kind: "production" | "arrival"; product: IProductStatus };

/* ============ Piezas de filtro ============ */

interface IFilterChipsProps<T extends string> {
    label: string;
    options: { id: T; label: string; count?: number }[];
    value: T;
    onChange: (value: T) => void;
}

const FilterChips = <T extends string>({ label, options, value, onChange }: IFilterChipsProps<T>) => (
    <div className="adm-filter" role="group" aria-label={label}>
        <span className="adm-filter__label">{label}</span>
        {options.map((option) => (
            <button
                key={option.id}
                type="button"
                className="adm-chip"
                aria-pressed={value === option.id}
                onClick={() => onChange(option.id)}
            >
                {option.label}
                {option.count !== undefined ? <span className="adm-chip__count">{option.count}</span> : null}
            </button>
        ))}
    </div>
);

const SearchInput = ({ id, label, value, onChange, placeholder }: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}) => (
    <>
        <label htmlFor={id} className="adm-sr-only">{label}</label>
        <input
            id={id}
            className="adm-search"
            type="search"
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(event) => onChange(event.target.value)}
        />
    </>
);

/* ============ Inventario ============ */

interface IAdminInventoryProps {
    token: string;
    onSessionExpired: () => void;
    /** Cambia cuando el tablero leyó recibos nuevos: hay que volver a cargar. */
    refreshKey: number;
}

type SupplyCategoryFilter = SupplyCategory | "todos";
type SupplyStateFilter = SupplyState | "todos";
type ProductStateFilter = ProductState | "todos";
type MovementTypeFilter = MovementType | "todos";
type MovementKindFilter = "supply" | "product" | "todos";

export const AdminInventory = ({ token, onSessionExpired, refreshKey }: IAdminInventoryProps) => {
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
                setSupplies(suppliesData.supplies);
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

    const toBuy = supplies.filter((supply) => supply.state === "comprar");

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

    if (isLoading) return <p className="adm-gate__loading script adm-loading">Cargando el inventario…</p>;

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
                        <p className="adm-empty">
                            Todavía no hay insumos cargados. Cuando agregues el primero y lo cuentes dos veces,
                            aquí aparece cuánto se gasta por día y cuándo comprar.
                        </p>
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
                                                    {supply.supplier ? <em>{supply.supplier}</em> : null}
                                                </td>
                                                <td data-label="Categoría">{SUPPLY_CATEGORY_LABEL[supply.category]}</td>
                                                <td className="num adm-card-qty" data-label="Quedan">{formatQuantity(supply.stock)} {supply.unit}</td>
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
                                                        {SUPPLY_STATE_LABEL[supply.state]}
                                                    </span>
                                                </td>
                                                <td className="adm-actions"><button type="button" className="adm-btn adm-btn--sm" onClick={()=>setPending({kind:"batches",supply})}>Lotes</button>
                                                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setPending({ kind: "purchase", supply })}>
                                                        Compra
                                                    </button>
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
                        <p className="adm-empty">
                            Ningún producto está bajo control de stock todavía. Al activarlos, cada venta los
                            descuenta sola y al llegar a cero se apagan en Loyverse.
                        </p>
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
                                <p className="adm-empty">Ningún producto con esos filtros.</p>
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
                                    <span className={`adm-tag is-${movement.type}`}>{movement.referenceType==="PRODUCT_RECEIPT"?"Lote":MOVEMENT_LABEL[movement.type]}</span>
                                    <span className="adm-mv__what">{movement.name}</span>
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
                    onSave={async (supply) => {
                        await createSupply(token, supply);
                        await reloadAll();
                    }}
                    onClose={() => setIsCreatingSupply(false)}
                />
            ) : null}

            {pending?.kind === "edit" ? (
                <SupplyFormDialog
                    supply={pending.supply}
                    onSave={async (supply) => {
                        await updateSupply(token, pending.supply.id, supply);
                        await reloadAll();
                    }}
                    onClose={() => setPending(null)}
                />
            ) : null}

            {pending?.kind === "purchase" ? <PurchaseDialog token={token} supply={pending.supply} onSaved={reloadAll} onClose={()=>setPending(null)}/> : null}
            {pending?.kind === "batches" ? <InventoryBatchDialog token={token} supply={pending.supply} onChanged={reloadAll} onClose={()=>setPending(null)}/> : null}

            {pending?.kind === "count" ? (
                <AmountDialog
                    title={`Conteo de ${pending.supply.name}`}
                    hint={`Cuánto hay ahora mismo, en ${pending.supply.unit}. El sistema dice ${formatQuantity(pending.supply.stock)}. Cuenta solo stock utilizable; los vencidos se descartan en Lotes.`}
                    unit={pending.supply.unit}
                    initial={formatQuantity(pending.supply.stock)}
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
                    hint={`Cuánto se perdió o se dañó, en ${pending.supply.unit}. Se resta de los ${formatQuantity(pending.supply.stock)} que hay.`}
                    unit={pending.supply.unit}
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
