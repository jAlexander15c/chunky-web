import { useCallback, useEffect, useMemo, useState } from "react";

import { AmountDialog } from "@/components";
import {
    HttpError,
    SUPPLY_CATEGORY_LABEL,
    fetchGestionMovements,
    fetchGestionProducts,
    fetchGestionSupplies,
    formatClock,
    formatCountAge,
    formatQuantity,
    registerGestionCount,
    registerGestionProduction,
    registerGestionPurchase,
    registerGestionWaste,
} from "@/helpers";
import type { IMovement, IProductStatus, ISupplyStatus, SupplyCategory } from "@/helpers";

import { GestionDisponibilidad } from "./disponibilidad";
import { GestionOpciones } from "./disponibilidad-opciones";
import { GestionPager } from "./pager";

/** Insumos y producción por un lado; prender o apagar productos del menú por otro. */
type View = "insumos" | "disponibilidad";

const VIEWS: View[] = ["insumos", "disponibilidad"];

const VIEW_LABEL: Record<View, string> = { insumos: "Insumos", disponibilidad: "Disponibilidad" };

/** Dentro de Disponibilidad: productos (en Loyverse) u opciones de modificador (en nuestra base). */
type AvailabilityView = "productos" | "opciones";

/** Las pestañas: las tres categorías de insumo más los productos terminados. */
type Tab = SupplyCategory | "productos";

const TABS: Tab[] = ["alimento", "limpieza", "mantenimiento", "productos"];

const TAB_LABEL: Record<Tab, string> = { ...SUPPLY_CATEGORY_LABEL, productos: "Productos" };

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

/** Pasado este plazo el conteo dejó de ser confiable. Mismo umbral que usa el API. */
const STALE_COUNT_DAYS = 7;

/** Listas cortas: en el teléfono se ve la página entera sin mucho scroll. */
const PAGE_SIZE = 10;

const getPageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

const getPageSlice = <T,>(items: T[], page: number) => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

type PendingAction =
    | { kind: "purchase" | "count" | "waste"; supply: ISupplyStatus }
    | { kind: "production"; product: IProductStatus };

interface IGestionInventarioProps {
    token: string;
    onSessionExpired: () => void;
}

export const GestionInventario = ({ token, onSessionExpired }: IGestionInventarioProps) => {
    const [supplies, setSupplies] = useState<ISupplyStatus[]>([]);
    const [products, setProducts] = useState<IProductStatus[]>([]);
    const [movements, setMovements] = useState<IMovement[]>([]);
    const [view, setView] = useState<View>("insumos");
    const [availabilityView, setAvailabilityView] = useState<AvailabilityView>("productos");
    // Se muestra en la pestaña Opciones; se conoce recien al abrirla
    const [soldOutOptions, setSoldOutOptions] = useState<number | null>(null);
    const [tab, setTab] = useState<Tab>("alimento");
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

                setSupplies(suppliesData.supplies);
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

    // Se cuenta por pestaña para que se vea dónde hay trabajo sin entrar a cada una
    const counts = useMemo(() => {
        const byCategory = { alimento: 0, limpieza: 0, mantenimiento: 0 };
        supplies.forEach((supply) => {
            byCategory[supply.category] += 1;
        });
        return { ...byCategory, productos: products.length };
    }, [supplies, products]);

    const visibleSupplies = useMemo(
        () => (tab === "productos" ? [] : supplies.filter((supply) => supply.category === tab)),
        [supplies, tab]
    );

    const isEmpty = tab === "productos" ? products.length === 0 : visibleSupplies.length === 0;

    // Tras recargar la lista puede achicarse: la página actual no puede quedar fuera
    const pageCount = getPageCount(tab === "productos" ? products.length : visibleSupplies.length);
    const currentPage = Math.min(page, pageCount);
    const minePageCount = getPageCount(movements.length);
    const currentMinePage = Math.min(minePage, minePageCount);

    const openTab = (next: Tab) => {
        setTab(next);
        setPage(1);
    };

    const openView = (next: View) => {
        setView(next);
        setPage(1);
    };

    const viewSwitch = (
        <div className="ges-seg" role="tablist" aria-label="Qué vas a ver">
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

    if (view === "disponibilidad") {
        return (
            <>
                {viewSwitch}
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
    }

    return (
        <>
            {viewSwitch}

            <div className="ges-tabs" role="tablist" aria-label="Qué vas a registrar">
                {TABS.map((option) => (
                    <button
                        key={option}
                        type="button"
                        role="tab"
                        className="ges-tab"
                        aria-selected={tab === option}
                        onClick={() => openTab(option)}
                    >
                        {TAB_LABEL[option]}
                        <small>{counts[option]}</small>
                    </button>
                ))}
            </div>

            <main className="ges-main">
                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                {isLoading ? (
                    <p className="ges-empty">Cargando…</p>
                ) : isEmpty ? (
                    <p className="ges-empty">
                        {tab === "productos"
                            ? "Ningún producto está bajo control de stock todavía."
                            : `Todavía no hay insumos de ${TAB_LABEL[tab].toLowerCase()}. El administrador los da de alta desde el tablero.`}
                    </p>
                ) : tab === "productos" ? (
                    getPageSlice(products, currentPage).map((product) => (
                        <article className="ges-row" key={product.variantId}>
                            <div className="ges-row__top">
                                <div>
                                    <div className="ges-row__name">{product.name}</div>
                                    <div className="ges-row__meta">
                                        Producidos hoy: {formatQuantity(product.producedToday)}
                                    </div>
                                    <div className="ges-row__facts">
                                        Se mide en <b>unidades</b> · Mínimo <b>{formatQuantity(product.lowStock)} u</b>
                                    </div>
                                </div>
                                <div className="ges-qty">
                                    <b>{formatQuantity(product.stock)}</b>
                                    <span>u</span>
                                </div>
                            </div>
                            <div className="ges-acts ges-acts--one">
                                <button
                                    type="button"
                                    className="ges-btn ges-btn--solid"
                                    onClick={() => setPending({ kind: "production", product })}
                                >
                                    Cargar producción
                                </button>
                            </div>
                        </article>
                    ))
                ) : (
                    getPageSlice(visibleSupplies, currentPage).map((supply) => {
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
                    })
                )}

                {!isLoading && !isEmpty ? <GestionPager page={currentPage} pageCount={pageCount} onChange={setPage} /> : null}
            </main>

            <section className="ges-mine">
                <h2>Lo que registraste hoy</h2>
                {movements.length === 0 ? (
                    <p className="ges-empty">Nada todavía. Lo que cargues aparece aquí.</p>
                ) : (
                    <ul>
                        {getPageSlice(movements, currentMinePage).map((movement) => (
                            <li key={movement.id}>
                                <span>
                                    <b>{MOVEMENT_LABEL[movement.type] ?? movement.type}</b> · {movement.name}{" "}
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

            {pending?.kind === "purchase" ? (
                <AmountDialog
                    title={`Compra de ${pending.supply.name}`}
                    hint={`Cuánto entró, en ${pending.supply.unit}. Se suma a los ${formatQuantity(pending.supply.stock)} que hay.`}
                    unit={pending.supply.unit}
                    confirmLabel="Guardar compra"
                    buttonClass="ges-btn"
                    onConfirm={async (amount) => {
                        await registerGestionPurchase(token, pending.supply.id, amount);
                        await loadAll();
                    }}
                    onClose={() => setPending(null)}
                />
            ) : null}

            {pending?.kind === "count" ? (
                <AmountDialog
                    title={`Conteo de ${pending.supply.name}`}
                    hint={`Cuánto hay ahora mismo, en ${pending.supply.unit}. El sistema dice ${formatQuantity(pending.supply.stock)}.`}
                    unit={pending.supply.unit}
                    initial={formatQuantity(pending.supply.stock)}
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
                    hint={`Cuánto se perdió o se dañó, en ${pending.supply.unit}. Se resta de los ${formatQuantity(pending.supply.stock)} que hay.`}
                    unit={pending.supply.unit}
                    confirmLabel="Guardar merma"
                    buttonClass="ges-btn"
                    onConfirm={async (amount) => {
                        await registerGestionWaste(token, pending.supply.id, amount);
                        await loadAll();
                    }}
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
