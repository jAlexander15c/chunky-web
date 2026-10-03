import {ProductLotDialog} from "../inventory-arrival-dialog";
import {expirationLabel} from "@/helpers/inventory";
import {PurchaseDialog} from "../inventory-purchase-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { AmountDialog, FullSheet, SheetSelect } from "@/components";
import {
    HttpError,
    SUPPLY_CATEGORY_LABEL,
    fetchGestionMovements,
    fetchGestionProducts,
    fetchGestionSupplies,
    formatClock,
    formatCountAge,
    formatInPresentation,
    formatQuantity,
    getPresentation,
    registerGestionCount,
    registerGestionProduction,
    registerGestionWaste,
} from "@/helpers";
import type { IMovement, IProductStatus, ISupplyStatus, SupplyCategory } from "@/helpers";

import { GestionDisponibilidad } from "./disponibilidad";
import { GestionOpciones } from "./disponibilidad-opciones";
import { InventoryExitDialog } from "./inventory-exit-dialog";
import { GestionPager } from "./pager";
import { GestionRecetas } from "./recetas";

/** Productos (lotes y producción), insumos, prender o apagar del menú, y las recetas de lo que se prepara en el local. */
type View = "productos" | "insumos" | "disponibilidad" | "recetas";

const VIEWS: View[] = ["productos", "insumos", "disponibilidad", "recetas"];

const VIEW_LABEL: Record<View, string> = {
    productos: "Productos",
    insumos: "Insumos",
    disponibilidad: "Disponibilidad",
    recetas: "Recetas",
};

/** Dentro de Disponibilidad: productos (en Loyverse) u opciones de modificador (en nuestra base). */
type AvailabilityView = "productos" | "opciones";

const CATEGORIES: SupplyCategory[] = ["alimento", "limpieza", "mantenimiento"];

const STATE_LABEL: Record<ISupplyStatus["state"], string> = {
    comprar: "Comprar ya",
    pedir: "Pedir",
    contar: "Contar",
    bien: "Bien",
};

const STATE_TONE: Record<ISupplyStatus["state"], string> = {
    comprar: "crit",
    pedir: "warn",
    contar: "idle",
    bien: "ok",
};

const MOVEMENT_LABEL: Record<string, string> = {
    compra: "Compra",
    conteo: "Conteo",
    merma: "Merma",
    produccion: "Producción",
};

/** Lo que se registra sobre un insumo: desde su fila o desde "¿Qué pasó?" eligiéndolo primero. */
type SupplyAction = "purchase" | "count" | "waste";

const SUPPLY_ACTION_TITLE: Record<SupplyAction, string> = {
    purchase: "¿Qué compraste?",
    count: "¿Qué contaste?",
    waste: "¿Qué se dañó?",
};

/** Pasado este plazo el conteo dejó de ser confiable. Mismo umbral que usa el API. */
const STALE_COUNT_DAYS = 7;

/** Listas cortas: en el teléfono se ve la página entera sin mucho scroll. */
const PAGE_SIZE = 10;

const getPageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

const getPageSlice = <T,>(items: T[], page: number) => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

const matchesSearch = (name: string, query: string) => name.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es"));

type PendingAction =
    | { kind: SupplyAction; supply: ISupplyStatus }
    | { kind: "pick"; action: SupplyAction }
    | { kind: "production"; product: IProductStatus }
    // Sin producto: se elige del menú (el primer lote activa una galleta o un postre)
    | { kind: "arrival"; product?: IProductStatus }
    | { kind: "exit"; variantId?: string };

const QuickIcon = ({ children }: { children: ReactNode }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);

/** Antes de una compra, un conteo o una merma desde "¿Qué pasó?": cuál insumo. */
const SupplyPicker = ({
    supplies,
    action,
    onPick,
    onClose,
}: {
    supplies: ISupplyStatus[];
    action: SupplyAction;
    onPick: (supply: ISupplyStatus) => void;
    onClose: () => void;
}) => {
    const [search, setSearch] = useState("");
    const matches = supplies.filter((supply) => matchesSearch(supply.name, search));

    return (
        <FullSheet title={SUPPLY_ACTION_TITLE[action]} onClose={onClose}>
            {(close) => (
                <div className="ges-pick">
                    <input
                        className="ges-search"
                        type="search"
                        placeholder="Buscar insumo"
                        aria-label="Buscar insumo"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className="fsheet__choices">
                        {matches.length === 0 ? <p className="ges-empty">Ningún insumo coincide.</p> : null}
                        {matches.map((supply) => (
                            <button key={supply.id} type="button" className="fsheet__choice" onClick={() => close(() => onPick(supply))}>
                                <span>{supply.name}</span>
                                <small>
                                    {formatQuantity(supply.stock)} {supply.unit}
                                </small>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </FullSheet>
    );
};

interface IGestionInventarioProps {
    token: string;
    onSessionExpired: () => void;
}

export const GestionInventario = ({ token, onSessionExpired }: IGestionInventarioProps) => {
    const [supplies, setSupplies] = useState<ISupplyStatus[]>([]);
    const [products, setProducts] = useState<IProductStatus[]>([]);
    const [movements, setMovements] = useState<IMovement[]>([]);
    const [view, setView] = useState<View>("productos");
    const [availabilityView, setAvailabilityView] = useState<AvailabilityView>("productos");
    // Se muestra en la pestaña Opciones; se conoce recien al abrirla
    const [soldOutOptions, setSoldOutOptions] = useState<number | null>(null);
    const [category, setCategory] = useState<SupplyCategory>("alimento");
    const [search, setSearch] = useState("");
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [minePage, setMinePage] = useState(1);

    const loadAll = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const [suppliesData, productsData, movementsData] = await Promise.all([
                    fetchGestionSupplies(token, signal),
                    fetchGestionProducts(token, signal),
                    fetchGestionMovements(token, signal),
                ]);

                // Las galletas y postres por lotes se manejan en Productos, no como insumos
                setSupplies(suppliesData.supplies.filter((supply) => supply.inventoryType !== "PREPARED_PRODUCT"));
                setProducts(productsData.products);
                setMovements(movementsData.movements);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(
                    requestError instanceof HttpError ? requestError.message : "No pudimos cargar el inventario."
                );
            } finally {
                setIsLoading(false);
            }
        },
        [token, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        void loadAll(controller.signal);
        return () => controller.abort();
    }, [loadAll]);

    // Se cuenta por categoría para que se vea dónde hay trabajo sin entrar a cada una
    const counts = useMemo(() => {
        const byCategory: Record<SupplyCategory, number> = { alimento: 0, limpieza: 0, mantenimiento: 0 };
        supplies.forEach((supply) => {
            byCategory[supply.category] += 1;
        });
        return byCategory;
    }, [supplies]);

    const visibleSupplies = useMemo(
        () => supplies.filter((supply) => supply.category === category && matchesSearch(supply.name, search)),
        [supplies, category, search]
    );

    const visibleProducts = useMemo(() => products.filter((product) => matchesSearch(product.name, search)), [products, search]);

    const listLength = view === "productos" ? visibleProducts.length : visibleSupplies.length;

    // Tras recargar la lista puede achicarse: la página actual no puede quedar fuera
    const pageCount = getPageCount(listLength);
    const currentPage = Math.min(page, pageCount);
    const minePageCount = getPageCount(movements.length);
    const currentMinePage = Math.min(minePage, minePageCount);

    const openCategory = (next: SupplyCategory) => {
        setCategory(next);
        setPage(1);
    };

    const openView = (next: View) => {
        setView(next);
        setSearch("");
        setPage(1);
    };

    const closePending = useCallback(() => setPending(null), []);

    // Lo que pasó va primero: no hay que saber en qué lista vive cada cosa
    const quickActions = (
        <section className="ges-happened" aria-labelledby="ges-happened-title">
            <h2 id="ges-happened-title">¿Qué pasó?</h2>
            <div className="ges-happened__grid">
                <button type="button" className="ges-happened__btn is-main" onClick={() => setPending({ kind: "arrival" })}>
                    <QuickIcon>
                        <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
                        <path d="M3 7l9 4 9-4M12 11v10" />
                    </QuickIcon>
                    <span>
                        <b>Llegó un lote</b>
                        <small>Galletas, postres o lo que llega listo</small>
                    </span>
                </button>
                <button type="button" className="ges-happened__btn" onClick={() => setPending({ kind: "pick", action: "purchase" })}>
                    <QuickIcon>
                        <path d="M6 6h15l-1.5 9h-12z" />
                        <path d="M6 6L5 3H2" />
                        <circle cx="9" cy="20" r="1.4" />
                        <circle cx="18" cy="20" r="1.4" />
                    </QuickIcon>
                    <span>
                        <b>Compré insumos</b>
                        <small>Leche, café, vasos…</small>
                    </span>
                </button>
                <button type="button" className="ges-happened__btn" onClick={() => setPending({ kind: "pick", action: "count" })}>
                    <QuickIcon>
                        <path d="M9 11l3 3 8-8" />
                        <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
                    </QuickIcon>
                    <span>
                        <b>Conté</b>
                        <small>Lo que hay ahora</small>
                    </span>
                </button>
                <button type="button" className="ges-happened__btn" onClick={() => setPending({ kind: "pick", action: "waste" })}>
                    <QuickIcon>
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />
                    </QuickIcon>
                    <span>
                        <b>Se dañó</b>
                        <small>Merma, se botó</small>
                    </span>
                </button>
                <button type="button" className="ges-happened__btn is-exit" onClick={() => setPending({ kind: "exit" })}>
                    <QuickIcon>
                        <path d="M20 12v9H4v-9" />
                        <path d="M2 7h20v5H2zM12 21V7" />
                        <path d="M12 7H8a2.5 2.5 0 0 1 0-5c3 0 4 5 4 5zM12 7h4a2.5 2.5 0 0 0 0-5c-3 0-4 5-4 5z" />
                    </QuickIcon>
                    <span>
                        <b>Salida sin venta</b>
                        <small>Pruebas, Marketing, PedidosYa</small>
                    </span>
                </button>
            </div>
        </section>
    );

    const viewSwitch = (
        <div className="ges-seg ges-seg--four" role="tablist" aria-label="Qué vas a ver">
            {VIEWS.map((option) => (
                <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={view === option}
                    onClick={() => openView(option)}
                >
                    {VIEW_LABEL[option]}
                </button>
            ))}
        </div>
    );

    const renderProduct = (product: IProductStatus) => {
        const isBatch = product.productionMode === "BATCH";
        const isMadeToOrder = product.productionMode === "MADE_TO_ORDER";

        return (
            <article className="ges-row" key={product.variantId}>
                <div className="ges-row__top">
                    <div>
                        <div className="ges-row__name">{product.name}</div>
                        <div className="ges-row__meta">
                            {isBatch
                                ? "Por lotes · " + (product.nextExpiration ? expirationLabel(product.nextExpiration) : "sin vencimiento") + (product.shelfLifeDays ? " · dura " + product.shelfLifeDays + " días" : "")
                                : isMadeToOrder
                                  ? "Se prepara al momento · descuenta su receta"
                                  : "Producidos hoy: " + formatQuantity(product.producedToday)}
                        </div>
                        {!isMadeToOrder && product.stock <= product.lowStock ? (
                            <span className="ges-pill is-warn">Quedan pocos</span>
                        ) : null}
                    </div>
                    <div className="ges-qty">
                        <b>{formatQuantity(product.stock)}</b>
                        <span>{isMadeToOrder ? "alcanzan" : "quedan"}</span>
                    </div>
                </div>
                {!isMadeToOrder ? (
                    <div className="ges-acts ges-acts--two">
                        <button
                            type="button"
                            className="ges-btn ges-btn--solid"
                            onClick={() => setPending({ kind: isBatch ? "arrival" : "production", product })}
                        >
                            {isBatch ? "+ Lote" : "Cargar producción"}
                        </button>
                        <button type="button" className="ges-btn" onClick={() => setPending({ kind: "exit", variantId: product.variantId })}>
                            Salida
                        </button>
                    </div>
                ) : null}
            </article>
        );
    };

    const renderSupply = (supply: ISupplyStatus) => {
        const isStale = supply.countAge !== null && supply.countAge > STALE_COUNT_DAYS;

        return (
            <article className="ges-row" key={supply.id}>
                <div className="ges-row__top">
                    <div>
                        <div className="ges-row__name">{supply.name}</div>
                        <div className={`ges-row__meta${isStale ? " is-stale" : ""}`}>
                            {supply.countAge === null
                                ? "Nunca se ha contado"
                                : `Contado ${formatCountAge(supply.countAge)}${isStale ? " · toca contar" : ""}`}
                        </div>
                        <div className="ges-row__facts">
                            Se mide en <b>{supply.unit}</b> · Mínimo{" "}
                            <b>{formatQuantity(supply.minStock)} {supply.unit}</b>
                        </div>
                        <span className={`ges-pill is-${STATE_TONE[supply.state]}`}>
                            {STATE_LABEL[supply.state]}
                        </span>
                    </div>
                    <div className="ges-qty">
                        <b>{formatQuantity(supply.stock)}</b>
                        <span>{supply.unit}</span>
                        {getPresentation(supply) ? (
                            <small className="ges-qty__pres">
                                {formatInPresentation(supply.stock, getPresentation(supply)!, supply.unit)}
                            </small>
                        ) : null}
                    </div>
                </div>
                <div className="ges-acts">
                    <button type="button" className="ges-btn" onClick={() => setPending({ kind: "purchase", supply })}>
                        Compra
                    </button>
                    <button type="button" className="ges-btn" onClick={() => setPending({ kind: "count", supply })}>
                        Conteo
                    </button>
                    <button type="button" className="ges-btn" onClick={() => setPending({ kind: "waste", supply })}>
                        Merma
                    </button>
                </div>
            </article>
        );
    };

    let content: ReactNode;

    if (view === "recetas") {
        content = <GestionRecetas token={token} onSessionExpired={onSessionExpired} />;
    } else if (view === "disponibilidad") {
        content = (
            <>
                <div className="ges-tabs ges-avail-kind" role="tablist" aria-label="Qué vas a prender o apagar">
                    <button
                        type="button"
                        role="tab"
                        className="ges-tab"
                        aria-selected={availabilityView === "productos"}
                        onClick={() => setAvailabilityView("productos")}
                    >
                        Productos
                    </button>
                    <button
                        type="button"
                        role="tab"
                        className="ges-tab"
                        aria-selected={availabilityView === "opciones"}
                        onClick={() => setAvailabilityView("opciones")}
                    >
                        Opciones
                        {soldOutOptions ? <small className="ges-avail-kind__count">{soldOutOptions} agotada{soldOutOptions === 1 ? "" : "s"}</small> : null}
                    </button>
                </div>
                {availabilityView === "opciones" ? (
                    <GestionOpciones token={token} onSessionExpired={onSessionExpired} onSoldOutCountChange={setSoldOutOptions} />
                ) : (
                    <GestionDisponibilidad token={token} onSessionExpired={onSessionExpired} />
                )}
            </>
        );
    } else {
        const isProducts = view === "productos";

        content = (
            <>
                {!isProducts ? (
                    <>
                        <SheetSelect<SupplyCategory>
                            label="Qué insumos"
                            className="ges-select"
                            value={category}
                            options={CATEGORIES.map((option) => ({ id: option, label: SUPPLY_CATEGORY_LABEL[option], count: counts[option] }))}
                            onChange={openCategory}
                        />

                        <div className="ges-tabs ges-tabs--inv fsheet-wide" role="tablist" aria-label="Qué insumos">
                            {CATEGORIES.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    role="tab"
                                    className="ges-tab"
                                    aria-selected={category === option}
                                    onClick={() => openCategory(option)}
                                >
                                    {SUPPLY_CATEGORY_LABEL[option]}
                                    <small>{counts[option]}</small>
                                </button>
                            ))}
                        </div>
                    </>
                ) : null}

                <main className="ges-main ges-main--inv">
                    <input
                        className="ges-search ges-list-search"
                        type="search"
                        placeholder={isProducts ? "Buscar producto" : "Buscar insumo"}
                        aria-label={isProducts ? "Buscar producto" : "Buscar insumo"}
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                    />

                    {error ? <p className="ges-error" role="alert">{error}</p> : null}

                    {isLoading ? (
                        <p className="ges-empty">Cargando…</p>
                    ) : listLength === 0 ? (
                        <p className="ges-empty">
                            {search.trim()
                                ? "Nada coincide con la búsqueda."
                                : isProducts
                                  ? "Ningún producto lleva stock todavía. Toca «Llegó un lote» para registrar el primero."
                                  : `Todavía no hay insumos de ${SUPPLY_CATEGORY_LABEL[category].toLowerCase()}. El administrador los da de alta desde el tablero.`}
                        </p>
                    ) : isProducts ? (
                        getPageSlice(visibleProducts, currentPage).map(renderProduct)
                    ) : (
                        getPageSlice(visibleSupplies, currentPage).map(renderSupply)
                    )}

                    {!isLoading && listLength > 0 ? <GestionPager page={currentPage} pageCount={pageCount} onChange={setPage} /> : null}
                </main>
            </>
        );
    }

    return (
        <>
            {quickActions}
            {viewSwitch}
            {content}

            <section className="ges-mine">
                <h2>Lo que registraste hoy</h2>
                {movements.length === 0 ? (
                    <p className="ges-empty">Nada todavía. Lo que cargues aparece aquí.</p>
                ) : (
                    <ul>
                        {getPageSlice(movements, currentMinePage).map((movement) => (
                            <li key={movement.id}>
                                <span>
                                    <b>
                                        {movement.referenceType === "PRODUCT_RECEIPT"
                                            ? "Lote"
                                            : movement.referenceType === "INVENTORY_EXIT"
                                              ? `Salida${movement.reference ? ` · ${movement.reference}` : ""}`
                                              : MOVEMENT_LABEL[movement.type] ?? movement.type}
                                    </b>{" "}
                                    · {movement.name}{" "}
                                    <em>
                                        {/* En un conteo importa lo que se contó, no la diferencia que corrigió */}
                                        {movement.type === "conteo"
                                            ? `${formatQuantity(movement.balance ?? 0)} ${movement.unit}`
                                            : `${movement.quantity < 0 ? "−" : "+"}${formatQuantity(Math.abs(movement.quantity))} ${movement.unit}`}
                                    </em>
                                </span>
                                <time dateTime={movement.createdAt}>{formatClock(movement.createdAt)}</time>
                            </li>
                        ))}
                    </ul>
                )}
                <GestionPager page={currentMinePage} pageCount={minePageCount} onChange={setMinePage} />
            </section>

            {pending?.kind === "pick" ? (
                <SupplyPicker
                    supplies={supplies}
                    action={pending.action}
                    onPick={(supply) => setPending({ kind: pending.action, supply })}
                    onClose={closePending}
                />
            ) : null}

            {pending?.kind === "exit" ? (
                <InventoryExitDialog
                    token={token}
                    initialVariantId={pending.variantId}
                    onSessionExpired={onSessionExpired}
                    onClose={() => {
                        setPending(null);
                        void loadAll();
                    }}
                />
            ) : null}

            {pending?.kind==="purchase"?<PurchaseDialog token={token} scope="gestion" supply={pending.supply} onSaved={loadAll} onClose={()=>setPending(null)}/>:null}

            {pending?.kind === "count" ? (
                <AmountDialog
                    title={`Conteo de ${pending.supply.name}`}
                    hint={getPresentation(pending.supply)
                        ? `Cuenta los enteros y lo que queda abierto. El sistema dice ${formatInPresentation(pending.supply.stock, getPresentation(pending.supply)!, pending.supply.unit)}.`
                        : `Cuánto hay ahora mismo, en ${pending.supply.unit}. El sistema dice ${formatQuantity(pending.supply.stock)}.`}
                    unit={pending.supply.unit}
                    initial={getPresentation(pending.supply) ? String(pending.supply.stock) : formatQuantity(pending.supply.stock)}
                    presentation={getPresentation(pending.supply)}
                    confirmLabel="Guardar conteo"
                    buttonClass="ges-btn"
                    onConfirm={async (amount) => {
                        await registerGestionCount(token, pending.supply.id, amount);
                        await loadAll();
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
                    confirmLabel="Guardar merma"
                    buttonClass="ges-btn"
                    onConfirm={async (amount) => {
                        await registerGestionWaste(token, pending.supply.id, amount);
                        await loadAll();
                    }}
                    onClose={() => setPending(null)}
                />
            ) : null}

            {pending?.kind === "arrival" ? (
                <ProductLotDialog
                    token={token}
                    scope="gestion"
                    product={pending.product}
                    onSaved={loadAll}
                    onClose={() => setPending(null)}
                />
            ) : null}

            {pending?.kind === "production" ? (
                <AmountDialog
                    title={`Producción de ${pending.product.name}`}
                    hint="Cuántas unidades se hicieron. Si es la primera carga del día, reemplaza el saldo anterior."
                    unit="u"
                    confirmLabel="Guardar producción"
                    buttonClass="ges-btn"
                    onConfirm={async (amount) => {
                        await registerGestionProduction(token, pending.product.variantId, amount);
                        await loadAll();
                    }}
                    onClose={() => setPending(null)}
                />
            ) : null}
        </>
    );
};
