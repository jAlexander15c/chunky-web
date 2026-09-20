import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import {
    HttpError,
    createSupply,
    fetchDashboard,
    fetchMovements,
    fetchProducts,
    fetchSupplies,
    formatCountAge,
    formatClock,
    formatDayLabel,
    formatMoney,
    formatQuantity,
    getAdminToken,
    loadSettings,
    loginAdmin,
    registerCount,
    registerProduction,
    registerPurchase,
    setAdminToken,
    setPastaMode,
    syncReceiptsNow,
    useSettings,
} from "@/helpers";
import type { IDashboard, IDaySales, IMovement, IProductStatus, ISupplyStatus, MovementType, SupplyState } from "@/helpers";

import "./admin.css";

/** El tablero se refresca solo: la cocina carga producción mientras alguien mira las cifras. */
const REFRESH_MS = 60000;
const SALES_DAYS = 14;

const useAdminHead = () => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Tablero · Chunky Bites";
        return () => {
            document.title = previousTitle;
        };
    }, []);
};

/* ============ Acceso con PIN ============ */

interface IAdminLoginProps {
    onLogin: (token: string) => void;
}

const AdminLogin = ({ onLogin }: IAdminLoginProps) => {
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (isSending) return;

        setIsSending(true);
        setError("");

        try {
            const { token } = await loginAdmin(pin);
            setAdminToken(token);
            onLogin(token);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos entrar.");
            setPin("");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="adm-gate">
            <form className="adm-gate__panel" onSubmit={submit}>
                <span className="script adm-gate__mark">Chunky Bites</span>
                <h1>Tablero</h1>
                <p>Escribe el PIN de administración.</p>

                <label htmlFor="admin-pin" className="adm-sr-only">PIN</label>
                <input
                    id="admin-pin"
                    className="adm-gate__input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))}
                />

                {error ? <p className="adm-gate__error">{error}</p> : null}

                <button type="submit" className="adm-btn adm-btn--solid adm-btn--block" disabled={pin.length < 4 || isSending}>
                    {isSending ? "Entrando…" : "Entrar"}
                </button>
            </form>
        </div>
    );
};

/* ============ Piezas ============ */

interface IStatTileProps {
    label: string;
    value: string;
    detail?: string;
    isAlert?: boolean;
    split?: { left: number; right: number };
}

const StatTile = ({ label, value, detail, isAlert, split }: IStatTileProps) => (
    <div className="stamp-lift">
        <div className="stamp adm-tile">
            <span className="adm-tile__label">{label}</span>
            <span className={`adm-tile__value${isAlert ? " is-alert" : ""}`}>{value}</span>
            {detail ? <span className="adm-tile__detail">{detail}</span> : null}
            {split && split.left + split.right > 0 ? (
                <span className="adm-split" aria-hidden="true">
                    <i style={{ width: `${(split.left / (split.left + split.right)) * 100}%` }} className="is-local" />
                    <i style={{ width: `${(split.right / (split.left + split.right)) * 100}%` }} className="is-web" />
                </span>
            ) : null}
        </div>
    </div>
);

const SALES_CHART = { width: 720, height: 262, left: 46, right: 54, top: 14, bottom: 32 };

/**
 * Venta diaria de los dos canales. Un dia cerrado corta la linea en vez de
 * bajarla a cero, que se leeria como un dia malo.
 */
const SalesChart = ({ days }: { days: IDaySales[] }) => {
    const { paths, marks, gridLines, labels, yMax } = useMemo(() => {
        const highest = Math.max(100, ...days.map((day) => Math.max(day.mostrador, day.web)));
        const step = Math.max(50, Math.ceil(highest / 4 / 50) * 50);
        const top = step * 4;

        const getX = (index: number) =>
            SALES_CHART.left + (index * (SALES_CHART.width - SALES_CHART.left - SALES_CHART.right)) / Math.max(1, days.length - 1);
        const getY = (value: number) =>
            SALES_CHART.top + (1 - value / top) * (SALES_CHART.height - SALES_CHART.top - SALES_CHART.bottom);

        // Un dia sin ventas en ningun canal es un dia cerrado: parte la linea
        const isClosed = (day: IDaySales) => day.total === 0 && day.tickets === 0;

        const buildPath = (key: "mostrador" | "web") => {
            const segments: string[] = [];
            let current: string[] = [];

            days.forEach((day, index) => {
                if (isClosed(day)) {
                    if (current.length) segments.push(current.join(" "));
                    current = [];
                    return;
                }
                current.push(`${current.length ? "L" : "M"}${getX(index).toFixed(1)},${getY(day[key]).toFixed(1)}`);
            });

            if (current.length) segments.push(current.join(" "));
            return segments;
        };

        const lastOpen = [...days].reverse().find((day) => !isClosed(day));
        const lastIndex = lastOpen ? days.lastIndexOf(lastOpen) : -1;

        return {
            yMax: top,
            paths: { mostrador: buildPath("mostrador"), web: buildPath("web") },
            marks:
                lastIndex >= 0
                    ? (["mostrador", "web"] as const).map((key) => ({
                          key,
                          x: getX(lastIndex),
                          y: getY(days[lastIndex][key]),
                          value: Math.round(days[lastIndex][key]),
                      }))
                    : [],
            gridLines: Array.from({ length: 5 }, (_, index) => ({ value: index * step, y: getY(index * step) })),
            labels: days
                .map((day, index) => ({ label: formatDayLabel(day.date), x: getX(index), index }))
                .filter((entry) => entry.index % 2 === 0),
        };
    }, [days]);

    return (
        <svg className="adm-chart" viewBox={`0 0 ${SALES_CHART.width} ${SALES_CHART.height}`} role="img" aria-label="Venta diaria de mostrador y web">
            {gridLines.map((line) => (
                <g key={line.value}>
                    <line x1={SALES_CHART.left} y1={line.y} x2={SALES_CHART.width - SALES_CHART.right} y2={line.y} className="adm-chart__grid" />
                    <text x={SALES_CHART.left - 9} y={line.y + 4} textAnchor="end" className="adm-chart__axis">{line.value}</text>
                </g>
            ))}

            {paths.mostrador.map((path, index) => (
                <path key={`m${index}`} d={path} className="adm-chart__line is-local" />
            ))}
            {paths.web.map((path, index) => (
                <path key={`w${index}`} d={path} className="adm-chart__line is-web" />
            ))}

            {marks.map((mark) => (
                <g key={mark.key}>
                    <circle cx={mark.x} cy={mark.y} r={5} className={`adm-chart__dot is-${mark.key === "mostrador" ? "local" : "web"}`} />
                    <text x={mark.x + 10} y={mark.y + 4} className={`adm-chart__mark is-${mark.key === "mostrador" ? "local" : "web"}`}>
                        {mark.value}
                    </text>
                </g>
            ))}

            {labels.map((entry) => (
                <text key={entry.label} x={entry.x} y={SALES_CHART.height - 10} textAnchor="middle" className="adm-chart__axis">
                    {entry.label}
                </text>
            ))}
            <title>{`Escala hasta B/. ${yMax}`}</title>
        </svg>
    );
};

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

const MOVEMENT_LABEL: Record<MovementType, string> = {
    compra: "Compra",
    conteo: "Conteo",
    produccion: "Producción",
    venta: "Venta",
    merma: "Merma",
    ajuste: "Ajuste",
};

const getMovementOrigin = (movement: IMovement) => {
    const from = movement.source === "web" ? "web" : movement.source === "loyverse" ? "mostrador" : "local";
    return movement.reference ? `${movement.reference} · ${from}` : from;
};

/* ============ Dialogo de cantidad ============ */

interface IAmountDialogProps {
    title: string;
    hint: string;
    unit: string;
    initial?: string;
    confirmLabel: string;
    onConfirm: (amount: number) => Promise<void>;
    onClose: () => void;
}

const AmountDialog = ({ title, hint, unit, initial = "", confirmLabel, onConfirm, onClose }: IAmountDialogProps) => {
    const [amount, setAmount] = useState(initial);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const parsed = Number(amount.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0) {
            setError("Escribe una cantidad válida.");
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onConfirm(parsed);
            onClose();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo guardar.");
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label={title}>
            <form className="adm-modal__panel" onSubmit={submit}>
                <h3 className="script">{title}</h3>
                <p className="adm-modal__hint">{hint}</p>

                <div className="adm-modal__field">
                    <input
                        className="adm-modal__input"
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        aria-label={`Cantidad en ${unit}`}
                    />
                    <span className="adm-modal__unit">{unit}</span>
                </div>

                {error ? <p className="adm-gate__error">{error}</p> : null}

                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending}>
                        {isSending ? "Guardando…" : confirmLabel}
                    </button>
                </div>
            </form>
        </div>
    );
};

/* ============ Modo pasta ============ */

/** Interruptor del dia de pasta. Cambiarlo pide confirmacion: afecta el menu de todos los clientes. */
const PastaModePanel = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const { settings, isReady } = useSettings();
    const [isConfirming, setIsConfirming] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const isOn = settings.pastaMode;

    const change = async (enabled: boolean) => {
        setIsSaving(true);
        setError("");

        try {
            await setPastaMode(token, enabled);
            // Los clientes con la pagina abierta lo leen en menos de un minuto; aqui se ve al instante
            await loadSettings();
            setIsConfirming(false);
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cambiar el modo pasta.");
        } finally {
            setIsSaving(false);
        }
    };

    // Apagar no necesita confirmacion (vuelve el menu completo); encender si
    const toggle = () => (isOn ? void change(false) : setIsConfirming(true));

    return (
        <section className="adm-band adm-pasta">
            <div className="adm-band__head">
                <h2 className="script">Modo pasta</h2>
                <span className="adm-band__sub">Un día de pasta: solo pasta y bebidas, todo con entrega</span>
            </div>

            <div className="adm-pasta__row">
                <label className="adm-switch">
                    <input type="checkbox" checked={isOn} onChange={toggle} disabled={!isReady || isSaving} />
                    <span className="adm-switch__track" aria-hidden />
                    <span className="adm-switch__label">Modo pasta</span>
                </label>
                <span className={`adm-pasta__state ${isOn ? "adm-pasta__state--on" : ""}`} role="status">
                    {isReady ? (isOn ? "Activo" : "Apagado") : "Leyendo…"}
                </span>
            </div>

            <p className="adm-pasta__desc">
                {isOn
                    ? "Ahora el menú muestra solo la pasta armable y las bebidas, y los pedidos son con entrega a domicilio."
                    : "Ahora el menú se ve completo y los pedidos son para retirar."}
            </p>

            {isOn && !settings.pasta ? (
                <p className="adm-warning">
                    La pasta no aparece en el menú: revisa que el item esté activo en Loyverse y que LOYVERSE_PASTA_ITEM_ID sea el correcto.
                </p>
            ) : null}
            {error ? <p className="adm-error">{error}</p> : null}

            {isConfirming ? (
                <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Activar el modo pasta">
                    <div className="adm-modal__panel">
                        <h3 className="script">¿Activar el modo pasta?</h3>
                        <ul className="adm-pasta__list">
                            <li>El menú mostrará solo la pasta armable y las bebidas.</li>
                            <li>Todo pedido nuevo será delivery y pedirá dirección.</li>
                            <li>Los pedidos ya creados no cambian.</li>
                        </ul>
                        <div className="adm-modal__actions">
                            <button type="button" className="adm-btn" onClick={() => setIsConfirming(false)} disabled={isSaving}>Cancelar</button>
                            <button type="button" className="adm-btn adm-btn--solid" onClick={() => void change(true)} disabled={isSaving}>
                                {isSaving ? "Activando…" : "Activar modo pasta"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
};

/* ============ Alta de insumo ============ */

const SUPPLY_UNITS = [
    { value: "kg", label: "kilos (kg)" },
    { value: "g", label: "gramos (g)" },
    { value: "L", label: "litros (L)" },
    { value: "ml", label: "mililitros (ml)" },
    { value: "u", label: "unidades (u)" },
];

interface ISupplyFormProps {
    onCreate: (supply: {
        name: string;
        unit: string;
        minStock: number;
        supplier?: string;
        purchaseUnit?: string;
        purchaseSize?: number;
    }) => Promise<void>;
    onClose: () => void;
}

const SupplyFormDialog = ({ onCreate, onClose }: ISupplyFormProps) => {
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("kg");
    const [minStock, setMinStock] = useState("");
    const [supplier, setSupplier] = useState("");
    const [purchaseUnit, setPurchaseUnit] = useState("");
    const [purchaseSize, setPurchaseSize] = useState("");
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
            await onCreate({
                name: name.trim(),
                unit,
                minStock: parsedMin,
                supplier: supplier.trim() || undefined,
                purchaseUnit: purchaseUnit.trim() || undefined,
                purchaseSize: parsedSize,
            });
            onClose();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo crear el insumo.");
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Nuevo insumo">
            <form className="adm-modal__panel adm-modal__panel--wide" onSubmit={submit}>
                <h3 className="script">Nuevo insumo</h3>
                <p className="adm-modal__hint">
                    El stock arranca en cero: se carga con el primer conteo o con una compra.
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
                        <span>Se mide en</span>
                        <select className="adm-form__input" value={unit} onChange={(event) => setUnit(event.target.value)}>
                            {SUPPLY_UNITS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
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
                        <span>Cómo lo venden <em>opcional</em></span>
                        <input
                            className="adm-form__input"
                            type="text"
                            value={purchaseUnit}
                            onChange={(event) => setPurchaseUnit(event.target.value)}
                            placeholder="saco"
                        />
                    </label>

                    <label className="adm-form__row">
                        <span>Cuánto trae cada uno</span>
                        <input
                            className="adm-form__input"
                            type="text"
                            inputMode="decimal"
                            value={purchaseSize}
                            onChange={(event) => setPurchaseSize(event.target.value)}
                            placeholder="25"
                        />
                    </label>
                </div>

                <p className="adm-form__note">
                    Con esos dos últimos datos la sugerencia de compra sale en sacos o cajas, que es
                    como se le pide al proveedor, en vez de en {unit}.
                </p>

                {error ? <p className="adm-gate__error">{error}</p> : null}

                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending}>
                        {isSending ? "Creando…" : "Crear insumo"}
                    </button>
                </div>
            </form>
        </div>
    );
};

type PendingAction =
    | { kind: "purchase"; supply: ISupplyStatus }
    | { kind: "count"; supply: ISupplyStatus }
    | { kind: "production"; product: IProductStatus };

/* ============ Tablero ============ */

const AdminDashboard = ({ token, onLogout }: { token: string; onLogout: () => void }) => {
    const [dashboard, setDashboard] = useState<IDashboard | null>(null);
    const [supplies, setSupplies] = useState<ISupplyStatus[]>([]);
    const [products, setProducts] = useState<IProductStatus[]>([]);
    const [movements, setMovements] = useState<IMovement[]>([]);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [isCreatingSupply, setIsCreatingSupply] = useState(false);

    const loadAll = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const [dashboardData, suppliesData, productsData, movementsData] = await Promise.all([
                    fetchDashboard(token, SALES_DAYS, signal),
                    fetchSupplies(token, signal),
                    fetchProducts(token, signal),
                    fetchMovements(token, 40, signal),
                ]);

                setDashboard(dashboardData);
                setSupplies(suppliesData.supplies);
                setProducts(productsData.products);
                setMovements(movementsData.movements);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) {
                    onLogout();
                    return;
                }
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar el tablero.");
            } finally {
                if (!signal?.aborted) setIsLoading(false);
            }
        },
        [token, onLogout]
    );

    useEffect(() => {
        const controller = new AbortController();
        void loadAll(controller.signal);

        const timer = window.setInterval(() => void loadAll(), REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [loadAll]);

    const runSync = async () => {
        setIsSyncing(true);
        try {
            await syncReceiptsNow(token);
            await loadAll();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos leer los recibos.");
        } finally {
            setIsSyncing(false);
        }
    };

    const toBuy = supplies.filter((supply) => supply.state === "comprar");
    // Puede faltar si Loyverse no respondio; el inventario se muestra igual
    const sales = dashboard?.sales ?? null;

    if (isLoading) {
        return (
            <div className="adm-gate">
                <p className="adm-gate__loading script">Cargando el tablero…</p>
            </div>
        );
    }

    return (
        <div className="adm">
            <header className="adm-bar">
                <div className="adm-bar__in">
                    <span className="script adm-bar__mark">Chunky Bites</span>
                    <span className="adm-bar__where">
                        Tablero · {dashboard ? new Date(dashboard.serverTime).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" }) : ""}
                    </span>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={runSync} disabled={isSyncing}>
                        {isSyncing ? "Leyendo…" : "Leer recibos"}
                    </button>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={onLogout}>Salir</button>
                </div>
                <div className="awning" aria-hidden="true" />
            </header>

            <main className="adm-wrap">
                {error ? <p className="adm-error">{error}</p> : null}
                {dashboard?.salesError ? (
                    <p className="adm-warning">
                        {dashboard.salesError} El inventario sigue actualizado: podés comprar y cargar producción igual.
                    </p>
                ) : null}

                <PastaModePanel token={token} onSessionExpired={onLogout} />

                {/* ===== El día ===== */}
                <section className="adm-band">
                    <div className="adm-band__head">
                        <h2 className="script">El día</h2>
                        <span className="adm-band__sub">Mostrador y web juntos</span>
                        <span className="adm-src">Loyverse + Postgres</span>
                    </div>

                    <div className="adm-tiles">
                        <StatTile
                            label="Venta del día"
                            value={`B/. ${formatMoney(sales?.today.total ?? 0)}`}
                            detail={`mostrador B/. ${formatMoney(sales?.today.mostrador ?? 0)} · web B/. ${formatMoney(sales?.today.web ?? 0)}`}
                            split={{ left: sales?.today.mostrador ?? 0, right: sales?.today.web ?? 0 }}
                        />
                        <StatTile
                            label="Tickets"
                            value={String(sales?.today.tickets ?? 0)}
                            detail={`ticket promedio B/. ${formatMoney(sales?.today.averageTicket ?? 0)}`}
                        />
                        <StatTile
                            label="Insumos por comprar"
                            value={String(dashboard?.inventory.suppliesToBuy ?? 0)}
                            detail={toBuy.length ? toBuy.slice(0, 3).map((supply) => supply.name.toLowerCase()).join(", ") : "nada urgente"}
                            isAlert={(dashboard?.inventory.suppliesToBuy ?? 0) > 0}
                        />
                        <StatTile
                            label="Productos agotados"
                            value={String(dashboard?.inventory.productsSoldOut ?? 0)}
                            detail={`${dashboard?.inventory.productsLow ?? 0} con poco stock`}
                            isAlert={(dashboard?.inventory.productsSoldOut ?? 0) > 0}
                        />
                    </div>
                </section>

                {/* ===== Comprar ya ===== */}
                {toBuy.length > 0 ? (
                    <section className="adm-band">
                        <div className="adm-band__head">
                            <h2 className="script">Comprar ya</h2>
                            <span className="adm-band__sub">Bajo el mínimo o se acaba en menos de 2 días</span>
                            <span className="adm-src is-own">Postgres</span>
                        </div>

                        <div className="adm-card adm-card--alert">
                            {toBuy.map((supply) => (
                                <div className="adm-buy" key={supply.id}>
                                    <div>
                                        <div className="adm-buy__name">{supply.name}</div>
                                        <div className="adm-buy__why">
                                            Quedan <b>{formatQuantity(supply.stock)} {supply.unit}</b>
                                            {supply.dailyUse
                                                ? ` · se gastan ${formatQuantity(supply.dailyUse)} ${supply.unit} por día · alcanza para ${supply.daysLeft} días`
                                                : " · sin dos conteos no sabemos cuánto dura"}
                                        </div>
                                    </div>
                                    <div className="adm-buy__ask">
                                        {supply.suggestedPurchase ? (
                                            <>
                                                <span className="adm-buy__qty">{supply.suggestedPurchase}</span>
                                                <span className="adm-buy__unit">
                                                    {supply.purchaseUnit ? `${supply.purchaseUnit}s` : supply.unit}
                                                    {supply.purchaseSize ? ` de ${formatQuantity(supply.purchaseSize)} ${supply.unit}` : ""}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="adm-buy__unit">falta un conteo</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                {/* ===== Insumos ===== */}
                <section className="adm-band">
                    <div className="adm-band__head">
                        <h2 className="script">Insumos</h2>
                        <span className="adm-band__sub">Entran por compra, bajan por conteo</span>
                        <span className="adm-src is-own">Postgres</span>
                    </div>

                    <div className="adm-card">
                        <div className="adm-card-head">
                            <div className="grow">
                                <h3 className="script">Todo lo que hay en despensa</h3>
                                <p className="adm-note">Loyverse no sabe nada de esto: es nuestro.</p>
                            </div>
                            <button type="button" className="adm-btn adm-btn--solid" onClick={() => setIsCreatingSupply(true)}>
                                Nuevo insumo
                            </button>
                        </div>

                        {supplies.length === 0 ? (
                            <p className="adm-empty">
                                Todavía no hay insumos cargados. Cuando agregues el primero y lo cuentes dos veces,
                                aquí aparece cuánto se gasta por día y cuándo comprar.
                            </p>
                        ) : (
                            <div className="adm-scroll">
                                <table className="adm-table">
                                    <thead>
                                        <tr>
                                            <th>Insumo</th>
                                            <th className="num">Quedan</th>
                                            <th className="num">Gasto diario</th>
                                            <th className="num">Alcanza</th>
                                            <th className="num">Mínimo</th>
                                            <th>Último conteo</th>
                                            <th>Estado</th>
                                            <th aria-label="Acciones" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {supplies.map((supply) => (
                                            <tr key={supply.id} className={supply.state === "comprar" ? "is-crit" : undefined}>
                                                <td className="adm-name">
                                                    {supply.name}
                                                    {supply.supplier ? <em>{supply.supplier}</em> : null}
                                                </td>
                                                <td className="num">{formatQuantity(supply.stock)} {supply.unit}</td>
                                                <td className="num">{supply.dailyUse ? `${formatQuantity(supply.dailyUse)} ${supply.unit}` : "—"}</td>
                                                <td className="num">{supply.daysLeft !== null ? `${supply.daysLeft} d` : "—"}</td>
                                                <td className="num">{formatQuantity(supply.minStock)} {supply.unit}</td>
                                                <td>
                                                    <span className={`adm-age${supply.countAge !== null && supply.countAge > 7 ? " is-stale" : ""}`}>
                                                        {formatCountAge(supply.countAge)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`adm-pill is-${SUPPLY_STATE_TONE[supply.state]}`}>
                                                        {SUPPLY_STATE_LABEL[supply.state]}
                                                    </span>
                                                </td>
                                                <td className="adm-actions">
                                                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setPending({ kind: "purchase", supply })}>
                                                        Compra
                                                    </button>
                                                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setPending({ kind: "count", supply })}>
                                                        Conteo
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
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
                            <div className="adm-scroll">
                                <table className="adm-table">
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
                                        {products.map((product) => (
                                            <tr key={product.variantId} className={product.state === "agotado" ? "is-crit" : undefined}>
                                                <td className="adm-name">
                                                    {product.name}
                                                    {product.soldOutAt ? <em>Se agotó a las {formatClock(product.soldOutAt)}</em> : null}
                                                </td>
                                                <td className="num">{formatQuantity(product.producedToday)}</td>
                                                <td className="num">{formatQuantity(product.stock)}</td>
                                                <td>
                                                    <span className={`adm-pill is-${product.state === "agotado" ? "crit" : product.state === "poco" ? "warn" : product.state === "disponible" ? "ok" : "idle"}`}>
                                                        {product.state === "agotado"
                                                            ? "Agotado"
                                                            : product.state === "poco"
                                                              ? "Queda poco"
                                                              : product.state === "disponible"
                                                                ? "A la venta"
                                                                : "Sin control"}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`adm-age${product.loyverseSynced ? "" : " is-stale"}`}>
                                                        {product.loyverseSynced ? (product.stock > 0 ? "a la venta" : "apagado ✓") : "sincronizando…"}
                                                    </span>
                                                </td>
                                                <td className="adm-actions">
                                                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setPending({ kind: "production", product })}>
                                                        Producción
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </section>

                {/* ===== Ventas ===== */}
                <section className="adm-band">
                    <div className="adm-band__head">
                        <h2 className="script">Ventas</h2>
                        <span className="adm-band__sub">Partidas por canal con el campo source del recibo</span>
                        <span className="adm-src">Loyverse /receipts</span>
                    </div>

                    <div className="adm-grid">
                        <div className="adm-card">
                            <h3 className="script">Últimos {SALES_DAYS} días</h3>
                            <p className="adm-note">Balboas por día. Un día cerrado corta la línea.</p>
                            {sales ? (
                                <>
                                    <div className="adm-legend">
                                        <span><i className="is-local" />Mostrador</span>
                                        <span><i className="is-web" />Web</span>
                                    </div>
                                    <SalesChart days={sales.days} />
                                </>
                            ) : (
                                <p className="adm-empty">Sin datos de venta: Loyverse no respondió en esta carga.</p>
                            )}
                        </div>

                        <div className="adm-card">
                            <h3 className="script">Lo que más se vende</h3>
                            <p className="adm-note">Unidades de los dos canales.</p>
                            {sales && sales.topProducts.length > 0 ? (
                                <div className="adm-bars">
                                    {sales.topProducts.map((product) => {
                                        const top = sales.topProducts[0].units || 1;
                                        return (
                                            <div className="adm-bar" key={product.name}>
                                                <div className="adm-bar__top">
                                                    <span>{product.name}</span>
                                                    <span className="adm-bar__val">{product.units} <em>· {product.webShare} % web</em></span>
                                                </div>
                                                <div className="adm-bar__track" style={{ width: `${(product.units / top) * 100}%` }}>
                                                    <i className="is-local" style={{ width: `${100 - product.webShare}%` }} />
                                                    <i className="is-web" style={{ width: `${product.webShare}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="adm-empty">Todavía no hay ventas en este rango.</p>
                            )}

                            {sales && sales.range.total > 0 ? (
                                <p className="adm-callout">
                                    La web aporta <b>{sales.range.webShare} %</b> de la venta de estos {SALES_DAYS} días
                                    (B/. {formatMoney(sales.range.web)} de B/. {formatMoney(sales.range.total)}).
                                </p>
                            ) : null}
                        </div>
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
                        {movements.length === 0 ? (
                            <p className="adm-empty">Sin movimientos todavía.</p>
                        ) : (
                            movements.map((movement) => (
                                <div className="adm-mv" key={movement.id}>
                                    <span className="adm-mv__time">{formatClock(movement.createdAt)}</span>
                                    <span className={`adm-tag is-${movement.type}`}>{MOVEMENT_LABEL[movement.type]}</span>
                                    <span className="adm-mv__what">{movement.name}</span>
                                    <span className={`adm-mv__qty${movement.quantity < 0 ? " is-neg" : " is-pos"}`}>
                                        {movement.quantity > 0 ? "+" : "−"}
                                        {formatQuantity(Math.abs(movement.quantity))} {movement.unit}
                                    </span>
                                    <span className="adm-mv__from">{getMovementOrigin(movement)}</span>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </main>

            {isCreatingSupply ? (
                <SupplyFormDialog
                    onCreate={async (supply) => {
                        await createSupply(token, supply);
                        await loadAll();
                    }}
                    onClose={() => setIsCreatingSupply(false)}
                />
            ) : null}

            {pending?.kind === "purchase" ? (
                <AmountDialog
                    title={`Compra de ${pending.supply.name}`}
                    hint={`Cuánto entró, en ${pending.supply.unit}. Quedan ${formatQuantity(pending.supply.stock)}.`}
                    unit={pending.supply.unit}
                    confirmLabel="Registrar compra"
                    onConfirm={async (amount) => {
                        await registerPurchase(token, pending.supply.id, amount);
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
                    confirmLabel="Registrar conteo"
                    onConfirm={async (amount) => {
                        await registerCount(token, pending.supply.id, amount);
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
                    confirmLabel="Cargar producción"
                    onConfirm={async (amount) => {
                        await registerProduction(token, pending.product.variantId, amount);
                        await loadAll();
                    }}
                    onClose={() => setPending(null)}
                />
            ) : null}
        </div>
    );
};

export const AdminView = () => {
    const [token, setToken] = useState<string | null>(() => getAdminToken());
    useAdminHead();

    const logout = useCallback(() => {
        setAdminToken(null);
        setToken(null);
    }, []);

    if (!token) return <AdminLogin onLogin={setToken} />;
    return <AdminDashboard token={token} onLogout={logout} />;
};
