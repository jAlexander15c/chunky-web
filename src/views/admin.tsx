import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import {
    HttpError,
    fetchDashboard,
    fetchSupplies,
    formatMoney,
    getAdminToken,
    loadSettings,
    loginAdmin,
    setAdminToken,
    setPastaMode,
    syncReceiptsNow,
    useSettings,
} from "@/helpers";
import type { IDashboard, ISupplyStatus } from "@/helpers";

import { AdminCaja } from "./admin-caja";
import { AdminCollaborators } from "./admin-collaborators";
import { AdminFinance, StatTile } from "./admin-finance";
import { AdminIncidents } from "./admin-incidents";
import { AdminInventory } from "./admin-inventory";

import "./admin.css";

/** El tablero se refresca solo: la cocina carga producción mientras alguien mira las cifras. */
const REFRESH_MS = 60000;
/** "El día" solo necesita hoy; las finanzas piden su propio rango. */
const TODAY_SALES_DAYS = 1;

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

/* ============ Menú ============ */

type AdminSection = "tablero" | "inventario" | "caja" | "colaboradores";

const ADMIN_SECTIONS: { id: AdminSection; label: string; icon: ReactNode }[] = [
    {
        id: "tablero",
        label: "Tablero",
        icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    },
    {
        id: "inventario",
        label: "Inventario",
        icon: (
            <>
                <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
                <path d="M3 7l9 4 9-4M12 11v10" />
            </>
        ),
    },
    {
        id: "caja",
        label: "Caja",
        icon: (
            <>
                <rect x="2" y="7" width="20" height="13" rx="2" />
                <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M2 12h20" />
            </>
        ),
    },
    {
        id: "colaboradores",
        label: "Colaboradores",
        icon: (
            <>
                <circle cx="9" cy="8" r="3.5" />
                <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3.2 3.2 0 0 1 0 6M22 20c0-2.8-1.6-4.7-4-5.6" />
            </>
        ),
    },
];

/* ============ Tablero ============ */

const AdminDashboard = ({ token, onLogout }: { token: string; onLogout: () => void }) => {
    const [dashboard, setDashboard] = useState<IDashboard | null>(null);
    const [supplies, setSupplies] = useState<ISupplyStatus[]>([]);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [openIncidents, setOpenIncidents] = useState(0);
    const [section, setSection] = useState<AdminSection>("tablero");
    /** Sube al leer recibos a mano: la sección abierta vuelve a cargar. */
    const [refreshKey, setRefreshKey] = useState(0);

    const loadSummary = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const [dashboardData, suppliesData] = await Promise.all([
                    fetchDashboard(token, TODAY_SALES_DAYS, signal),
                    fetchSupplies(token, signal),
                ]);

                setDashboard(dashboardData);
                setSupplies(suppliesData.supplies);
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
        void loadSummary(controller.signal);

        const timer = window.setInterval(() => void loadSummary(), REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [loadSummary]);

    const runSync = async () => {
        setIsSyncing(true);
        try {
            await syncReceiptsNow(token);
            await loadSummary();
            setRefreshKey((key) => key + 1);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos leer los recibos.");
        } finally {
            setIsSyncing(false);
        }
    };

    const openSection = (next: AdminSection) => {
        setSection(next);
        window.scrollTo({ top: 0 });
    };

    const toBuy = supplies.filter((supply) => supply.state === "comprar");
    // Puede faltar si Loyverse no respondio; el resto del tablero se muestra igual
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
                    {openIncidents > 0 ? (
                        <a
                            className="adm-btn adm-btn--sm adm-btn--alert"
                            href="#descuadres"
                            onClick={(event) => {
                                if (section === "tablero") return;
                                // Los descuadres viven en el tablero: primero se abre y luego se baja hasta ellos
                                event.preventDefault();
                                setSection("tablero");
                                window.requestAnimationFrame(() => document.getElementById("descuadres")?.scrollIntoView());
                            }}
                        >
                            Descuadres <span className="adm-btn__count">{openIncidents}</span>
                        </a>
                    ) : null}
                    <button type="button" className="adm-btn adm-btn--sm" onClick={runSync} disabled={isSyncing}>
                        {isSyncing ? "Leyendo…" : "Leer recibos"}
                    </button>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={onLogout}>Salir</button>
                </div>
                <div className="awning" aria-hidden="true" />
            </header>

            <div className="adm-shell">
            <nav className="adm-menu" aria-label="Secciones del tablero">
                {ADMIN_SECTIONS.map((one) => (
                    <button
                        key={one.id}
                        type="button"
                        className="adm-menu__item"
                        aria-current={section === one.id}
                        onClick={() => openSection(one.id)}
                    >
                        <svg className="adm-menu__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {one.icon}
                        </svg>
                        {one.label}
                        {one.id === "inventario" && toBuy.length > 0 ? (
                            <span className="adm-menu__badge" aria-label={`${toBuy.length} insumos por comprar`}>{toBuy.length}</span>
                        ) : null}
                    </button>
                ))}
            </nav>

            {section === "caja" ? (
                <main className="adm-wrap">
                    <AdminCaja token={token} onSessionExpired={onLogout} />
                </main>
            ) : section === "colaboradores" ? (
                <main className="adm-wrap">
                    <AdminCollaborators token={token} onSessionExpired={onLogout} />
                </main>
            ) : section === "inventario" ? (
                <main className="adm-wrap">
                    <AdminInventory token={token} onSessionExpired={onLogout} refreshKey={refreshKey} />
                </main>
            ) : (
            <main className="adm-wrap">
                {error ? <p className="adm-error">{error}</p> : null}
                {dashboard?.salesError ? (
                    <p className="adm-warning">
                        {dashboard.salesError} Las finanzas y el inventario siguen al día: salen de nuestra base.
                    </p>
                ) : null}

                <PastaModePanel token={token} onSessionExpired={onLogout} />

                <AdminIncidents token={token} onSessionExpired={onLogout} onOpenCountChange={setOpenIncidents} />

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
                            action={{ label: "Ver inventario", onClick: () => openSection("inventario") }}
                        />
                        <StatTile
                            label="Productos agotados"
                            value={String(dashboard?.inventory.productsSoldOut ?? 0)}
                            detail={`${dashboard?.inventory.productsLow ?? 0} con poco stock`}
                            isAlert={(dashboard?.inventory.productsSoldOut ?? 0) > 0}
                            action={{ label: "Ver inventario", onClick: () => openSection("inventario") }}
                        />
                    </div>
                </section>

                <AdminFinance token={token} onSessionExpired={onLogout} refreshKey={refreshKey} />
            </main>
            )}
            </div>
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
