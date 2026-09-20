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
    getGestionName,
    getGestionToken,
    loginGestion,
    registerGestionCount,
    registerGestionProduction,
    registerGestionPurchase,
    registerGestionWaste,
    setGestionSession,
} from "@/helpers";
import type { IMovement, IProductStatus, ISupplyStatus, SupplyCategory } from "@/helpers";

import "./gestion.css";

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

const PIN_LENGTH = 6;

const useGestionHead = () => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Gestión · Chunky Bites";
        return () => {
            document.title = previousTitle;
        };
    }, []);
};

/* ============ Acceso con PIN ============ */

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

interface IGestionLoginProps {
    onLogin: (token: string, name: string) => void;
}

const GestionLogin = ({ onLogin }: IGestionLoginProps) => {
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = useCallback(
        async (candidate: string) => {
            setIsSending(true);
            setError("");

            try {
                const { token, collaborator } = await loginGestion(candidate);
                onLogin(token, collaborator.name);
            } catch (loginError) {
                setPin("");
                setIsSending(false);
                setError(
                    loginError instanceof HttpError && loginError.status < 500
                        ? loginError.message
                        : "No pudimos conectar. Revisa el Wi-Fi."
                );
            }
        },
        [onLogin]
    );

    // Con seis dígitos entra sola: no hace falta buscar el botón con las manos ocupadas
    const pressKey = (key: string) => {
        if (isSending) return;
        setError("");

        if (key === "⌫") {
            setPin((current) => current.slice(0, -1));
            return;
        }

        setPin((current) => {
            if (current.length >= PIN_LENGTH) return current;
            const next = current + key;
            if (next.length === PIN_LENGTH) void submit(next);
            return next;
        });
    };

    return (
        <div className="ges ges-gate">
            <div className="ges-gate__panel">
                <span className="ges-gate__mark script">Gestión</span>
                <h1>Entra con tu PIN</h1>
                <p>Es tuyo: lo que registres queda a tu nombre.</p>

                <div className="ges-dots" role="status" aria-label={`${pin.length} de ${PIN_LENGTH} dígitos`}>
                    {Array.from({ length: PIN_LENGTH }, (_value, index) => (
                        <span key={index} className={index < pin.length ? "is-on" : undefined} />
                    ))}
                </div>

                <p className="ges-gate__error" role="alert">{isSending ? "Entrando…" : error}</p>

                <div className="ges-keys">
                    {PIN_KEYS.map((key, index) =>
                        key ? (
                            <button
                                key={key}
                                type="button"
                                className={`ges-key${key === "⌫" ? " ges-key--soft" : ""}`}
                                onClick={() => pressKey(key)}
                                disabled={isSending}
                                aria-label={key === "⌫" ? "Borrar" : key}
                            >
                                {key}
                            </button>
                        ) : (
                            <span key={`vacio-${index}`} />
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

/* ============ Pantalla del colaborador ============ */

type PendingAction =
    | { kind: "purchase" | "count" | "waste"; supply: ISupplyStatus }
    | { kind: "production"; product: IProductStatus };

interface IGestionBoardProps {
    token: string;
    name: string;
    onRename: (name: string) => void;
    onLogout: () => void;
}

const GestionBoard = ({ token, name, onRename, onLogout }: IGestionBoardProps) => {
    const [supplies, setSupplies] = useState<ISupplyStatus[]>([]);
    const [products, setProducts] = useState<IProductStatus[]>([]);
    const [movements, setMovements] = useState<IMovement[]>([]);
    const [tab, setTab] = useState<Tab>("alimento");
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

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
                onRename(movementsData.collaborator.name);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onLogout();
                setError(
                    requestError instanceof HttpError ? requestError.message : "No pudimos cargar el inventario."
                );
            } finally {
                setIsLoading(false);
            }
        },
        [token, onRename, onLogout]
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

    return (
        <div className="ges">
            <header className="ges-bar">
                <div>
                    <div className="ges-bar__hi script">Hola, {name || "equipo"}</div>
                    <div className="ges-bar__sub">Registra compras, conteos y mermas</div>
                </div>
                <button type="button" className="ges-btn" onClick={onLogout}>Salir</button>
            </header>

            <div className="ges-tabs" role="tablist" aria-label="Qué vas a registrar">
                {TABS.map((option) => (
                    <button
                        key={option}
                        type="button"
                        role="tab"
                        className="ges-tab"
                        aria-selected={tab === option}
                        onClick={() => setTab(option)}
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
                    products.map((product) => (
                        <article className="ges-row" key={product.variantId}>
                            <div className="ges-row__top">
                                <div>
                                    <div className="ges-row__name">{product.name}</div>
                                    <div className="ges-row__meta">
                                        Producidos hoy: {formatQuantity(product.producedToday)}
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
                    visibleSupplies.map((supply) => {
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
            </main>

            <section className="ges-mine">
                <h2>Lo que registraste hoy</h2>
                {movements.length === 0 ? (
                    <p className="ges-empty">Nada todavía. Lo que cargues aparece aquí.</p>
                ) : (
                    <ul>
                        {movements.map((movement) => (
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
        </div>
    );
};

export const GestionView = () => {
    const [token, setToken] = useState<string | null>(() => getGestionToken());
    const [name, setName] = useState(() => getGestionName());
    useGestionHead();

    const login = useCallback((newToken: string, newName: string) => {
        setGestionSession(newToken, newName);
        setToken(newToken);
        setName(newName);
    }, []);

    const logout = useCallback(() => {
        setGestionSession(null);
        setToken(null);
        setName("");
    }, []);

    // El administrador puede renombrar a alguien: el saludo se corrige con lo que diga el API
    const rename = useCallback((newName: string) => {
        setName((current) => {
            if (current === newName) return current;
            setGestionSession(getGestionToken(), newName);
            return newName;
        });
    }, []);

    if (!token) return <GestionLogin onLogin={login} />;
    return <GestionBoard token={token} name={name} onRename={rename} onLogout={logout} />;
};
