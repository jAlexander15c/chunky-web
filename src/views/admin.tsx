import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";

import {
    HttpError,
    fetchDashboard,
    getSelectionRange,
    readStoredSelection,
    storeSelection,
    fetchSupplies,
    formatMoney,
    getAdminToken,
    loadSettings,
    loginAdmin,
    logoutAdmin,
    setAdminToken,
    setClientUpdateNotice,
    setCardPayments,
    setDeliveryMode,
    setPastaMode,
    syncReceiptsNow,
    useSettings,
} from "@/helpers";
import type { IDashboard, ISupplyStatus, PeriodSelection } from "@/helpers";

import { AdminCaja } from "./admin-caja";
import { AdminCollaborators } from "./admin-collaborators";
import { AdminFinance } from "./admin-finance";
import { AdminHours } from "./admin-hours";
import { AdminIncidents } from "./admin-incidents";
import { AdminInventory } from "./admin-inventory";
import { AdminMenu } from "./admin-menu";
import { AdminWeb } from "./admin-web";
import { AdminCustomers } from "./admin-customers";
import { AdminOverview } from "./admin-overview";
import { PeriodPicker } from "./admin-period";
import { ADMIN_GROUPS, ADMIN_SECTIONS, getSectionFromParam } from "./admin-sections";
import type { AdminSection } from "./admin-sections";

import "./admin.css";

/** El tablero se refresca solo: la cocina carga producción mientras alguien mira las cifras. */
const REFRESH_MS = 60000;
/** Hoy y los siete días anteriores: el resumen compara con el mismo día de la semana pasada. */
const SUMMARY_SALES_DAYS = 8;
/** El logo azul de los correos: pesa poco y se lee sobre el crema. */
const LOGO_SRC = "/correo/logo.png";

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

/* ============ Delivery ============ */

/** Interruptor del delivery de la web. No pide confirmacion: no cambia el menu ni los pedidos ya hechos. */
const DeliveryModePanel = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const { settings, isReady } = useSettings();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const isOn = settings.deliveryMode;

    const toggle = async () => {
        setIsSaving(true);
        setError("");

        try {
            await setDeliveryMode(token, !isOn);
            await loadSettings();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cambiar el delivery.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="adm-band adm-pasta">
            <div className="adm-band__head">
                <h2 className="script">Delivery</h2>
                <span className="adm-band__sub">Entrega a domicilio en los pedidos de la web</span>
            </div>

            <div className="adm-pasta__row">
                <label className="adm-switch">
                    <input type="checkbox" checked={isOn} onChange={() => void toggle()} disabled={!isReady || isSaving} />
                    <span className="adm-switch__track" aria-hidden />
                    <span className="adm-switch__label">Delivery</span>
                </label>
                <span className={`adm-pasta__state ${isOn ? "adm-pasta__state--on" : ""}`} role="status">
                    {isReady ? (isOn ? "Activo" : "Apagado") : "Leyendo…"}
                </span>
            </div>

            <p className="adm-pasta__desc">
                {isOn
                    ? "El cliente elige en el carrito entre retirar en el local o delivery con envío gratis."
                    : "Los pedidos de la web son solo para retirar en el local."}
            </p>

            {settings.pastaMode ? <p className="adm-warning">Hoy es día de pasta: todo pedido es delivery igual.</p> : null}
            {error ? <p className="adm-error">{error}</p> : null}
        </section>
    );
};

/* ============ Pago con tarjeta ============ */

/** Interruptor del pago con tarjeta en la web. Los pedidos ya pagados con tarjeta siguen su curso al apagarlo. */
const CardPaymentsPanel = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const { settings, isReady } = useSettings();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const isOn = Boolean(settings.cardPayments);
    const fee = settings.cardServiceFee ?? 0;

    const toggle = async () => {
        setIsSaving(true);
        setError("");

        try {
            await setCardPayments(token, !isOn);
            await loadSettings();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cambiar el pago con tarjeta.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="adm-band adm-pasta">
            <div className="adm-band__head">
                <h2 className="script">Tarjeta</h2>
                <span className="adm-band__sub">Pago con Visa o Mastercard por PagueloFacil</span>
            </div>

            <div className="adm-pasta__row">
                <label className="adm-switch">
                    <input type="checkbox" checked={isOn} onChange={() => void toggle()} disabled={!isReady || isSaving} />
                    <span className="adm-switch__track" aria-hidden />
                    <span className="adm-switch__label">Pago con tarjeta</span>
                </label>
                <span className={`adm-pasta__state ${isOn ? "adm-pasta__state--on" : ""}`} role="status">
                    {isReady ? (isOn ? "Activo" : "Apagado") : "Leyendo…"}
                </span>
            </div>

            <p className="adm-pasta__desc">
                {isOn
                    ? `El carrito ofrece pagar con tarjeta, con $${formatMoney(fee)} de servicio web.`
                    : "El carrito solo ofrece Yappy y coordinar por WhatsApp."}
            </p>

            {error ? <p className="adm-error">{error}</p> : null}
        </section>
    );
};

/* ============ Aviso de version nueva ============ */

/** Interruptor del aviso "Hay una version nueva" en el sitio publico. En /admin y /gestion el aviso sale siempre. */
const ClientUpdateNoticePanel = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const { settings, isReady } = useSettings();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const isOn = settings.clientUpdateNotice;

    const toggle = async () => {
        setIsSaving(true);
        setError("");

        try {
            await setClientUpdateNotice(token, !isOn);
            await loadSettings();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cambiar el aviso de versión.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="adm-band adm-pasta">
            <div className="adm-band__head">
                <h2 className="script">Versión nueva</h2>
                <span className="adm-band__sub">Aviso al cliente cuando se publica un cambio en la web</span>
            </div>

            <div className="adm-pasta__row">
                <label className="adm-switch">
                    <input type="checkbox" checked={isOn} onChange={() => void toggle()} disabled={!isReady || isSaving} />
                    <span className="adm-switch__track" aria-hidden />
                    <span className="adm-switch__label">Avisar al cliente</span>
                </label>
                <span className={`adm-pasta__state ${isOn ? "adm-pasta__state--on" : ""}`} role="status">
                    {isReady ? (isOn ? "Activo" : "Apagado") : "Leyendo…"}
                </span>
            </div>

            <p className="adm-pasta__desc">
                {isOn
                    ? "El cliente ve \"Hay una versión nueva\" con un botón para actualizar. Igual se actualiza sola al cambiar de página."
                    : "El cliente no ve ningún aviso: la web se actualiza sola al cambiar de página, sin tocar el carrito."}
            </p>

            {error ? <p className="adm-error">{error}</p> : null}
        </section>
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
                    : "Ahora el menú se ve completo y la entrega sigue lo que diga el panel de Delivery."}
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

/** Las secciones que usan el período del encabezado. */
const PERIOD_SECTIONS: AdminSection[] = ["ventas", "web"];
const SECTION_PARAM = "s";

/* ============ Tablero ============ */

const AdminDashboard = ({ token, onLogout }: { token: string; onLogout: () => void }) => {
    const [dashboard, setDashboard] = useState<IDashboard | null>(null);
    const [supplies, setSupplies] = useState<ISupplyStatus[]>([]);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [openIncidents, setOpenIncidents] = useState(0);
    const [period, setPeriod] = useState<PeriodSelection>(readStoredSelection);
    /** Sube al leer recibos a mano: la sección abierta vuelve a cargar. */
    const [refreshKey, setRefreshKey] = useState(0);

    // La sección va en la dirección: al recargar o compartir el enlace se abre la misma
    const [searchParams, setSearchParams] = useSearchParams();
    const section = getSectionFromParam(searchParams.get(SECTION_PARAM));
    const sectionInfo = ADMIN_SECTIONS.find((one) => one.id === section) ?? ADMIN_SECTIONS[0];

    const loadSummary = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const [dashboardData, suppliesData] = await Promise.all([
                    fetchDashboard(token, SUMMARY_SALES_DAYS, signal),
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

    /** Abre una sección. Con anchor, además baja hasta ese bloque (los descuadres viven en el resumen). */
    const openSection = (next: AdminSection, anchor?: string) => {
        if (next !== section) {
            // Cada sección nueva entra al historial: el botón atrás vuelve a la anterior
            setSearchParams(next === "resumen" ? {} : { [SECTION_PARAM]: next });
        }
        window.requestAnimationFrame(() => {
            if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
            else window.scrollTo({ top: 0 });
        });
    };

    const changePeriod = (next: PeriodSelection) => {
        setPeriod(next);
        storeSelection(next);
    };

    const range = getSelectionRange(period);

    const toBuy = supplies.filter((supply) => supply.state === "comprar");
    const today = dashboard
        ? new Date(dashboard.serverTime).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" })
        : "";

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
                    <img className="adm-bar__logo" src={LOGO_SRC} alt="Chunky Bites Bakery" width={140} height={42} />
                    <span className="adm-bar__where">{today}</span>
                    {openIncidents > 0 ? (
                        <button
                            type="button"
                            className="adm-btn adm-btn--sm adm-btn--alert"
                            aria-label={`${openIncidents} descuadres sin resolver`}
                            onClick={() => openSection("resumen", "descuadres")}
                        >
                            <span className="adm-btn__text">Descuadres</span> <span className="adm-btn__count">{openIncidents}</span>
                        </button>
                    ) : null}
                    <button type="button" className="adm-btn adm-btn--sm" onClick={runSync} disabled={isSyncing} title="Trae los recibos nuevos de Loyverse">
                        {isSyncing ? "Leyendo…" : "Leer recibos"}
                    </button>
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" onClick={onLogout}>Salir</button>
                </div>
                <div className="awning" aria-hidden="true" />
            </header>

            <div className="adm-shell">
                <nav className="adm-menu" aria-label="Secciones del tablero">
                    {ADMIN_GROUPS.map((group) => (
                        <div className="adm-menu__group" role="group" aria-labelledby={`adm-menu-${group.label}`} key={group.label}>
                            <span className="adm-menu__label" id={`adm-menu-${group.label}`}>{group.label}</span>
                            {group.sections.map((one) => (
                                <button
                                    key={one.id}
                                    type="button"
                                    className="adm-menu__item"
                                    aria-current={section === one.id}
                                    onClick={() => openSection(one.id)}
                                >
                                    <svg
                                        className="adm-menu__ico"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                    >
                                        {one.icon}
                                    </svg>
                                    {one.label}
                                    {one.id === "inventario" && toBuy.length > 0 ? (
                                        <span className="adm-menu__badge" aria-label={`${toBuy.length} insumos por comprar`}>{toBuy.length}</span>
                                    ) : null}
                                    {one.id === "resumen" && openIncidents > 0 ? (
                                        <span className="adm-menu__badge is-alert" aria-label={`${openIncidents} descuadres sin resolver`}>
                                            {openIncidents}
                                        </span>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>

                <main className="adm-wrap" key={section}>
                    <div className="adm-head">
                        <div className="adm-head__text">
                            <h1 className="script">{sectionInfo.label}</h1>
                            <p>
                                {sectionInfo.subtitle}
                                {sectionInfo.source ? <span className={`adm-src${sectionInfo.source === "Loyverse" ? "" : " is-own"}`}>{sectionInfo.source}</span> : null}
                            </p>
                        </div>
                        {PERIOD_SECTIONS.includes(section) ? <PeriodPicker selection={period} onChange={changePeriod} /> : null}
                    </div>

                    {section === "resumen" ? (
                        <>
                            {error ? <p className="adm-error">{error}</p> : null}
                            {dashboard?.salesError ? (
                                <p className="adm-warning">
                                    {dashboard.salesError} Las finanzas y el inventario siguen al día: salen de nuestra base.
                                </p>
                            ) : null}

                            <AdminOverview
                                token={token}
                                onSessionExpired={onLogout}
                                refreshKey={refreshKey}
                                dashboard={dashboard}
                                supplies={supplies}
                                openIncidents={openIncidents}
                                onOpen={openSection}
                            />
                        </>
                    ) : section === "ventas" ? (
                        <AdminFinance token={token} onSessionExpired={onLogout} refreshKey={refreshKey} from={range.from} to={range.to} />
                    ) : section === "web" ? (
                        <AdminWeb token={token} onSessionExpired={onLogout} refreshKey={refreshKey} from={range.from} to={range.to} />
                    ) : section === "clientes" ? (
                        <AdminCustomers token={token} onSessionExpired={onLogout} refreshKey={refreshKey} />
                    ) : section === "inventario" ? (
                        <AdminInventory token={token} onSessionExpired={onLogout} refreshKey={refreshKey} />
                    ) : section === "menu" ? (
                        <AdminMenu token={token} onSessionExpired={onLogout} />
                    ) : section === "caja" ? (
                        <AdminCaja token={token} onSessionExpired={onLogout} />
                    ) : section === "local" ? (
                        <>
                            <AdminHours token={token} onSessionExpired={onLogout} />
                            <DeliveryModePanel token={token} onSessionExpired={onLogout} />
                            <CardPaymentsPanel token={token} onSessionExpired={onLogout} />
                            <PastaModePanel token={token} onSessionExpired={onLogout} />
                            <ClientUpdateNoticePanel token={token} onSessionExpired={onLogout} />
                        </>
                    ) : (
                        <AdminCollaborators token={token} onSessionExpired={onLogout} />
                    )}

                    {/* Los descuadres se cuentan en todas las secciones (el aviso del encabezado), pero se muestran en el resumen */}
                    <div hidden={section !== "resumen"}>
                        <AdminIncidents token={token} onSessionExpired={onLogout} onOpenCountChange={setOpenIncidents} />
                    </div>
                </main>
            </div>
        </div>
    );
};

export const AdminView = () => {
    const [token, setToken] = useState<string | null>(() => getAdminToken());
    useAdminHead();

    // También al vencer la sesión: revocar una ya vencida no hace daño
    const logout = useCallback(() => {
        if (token) void logoutAdmin(token);
        setAdminToken(null);
        setToken(null);
    }, [token]);

    if (!token) return <AdminLogin onLogin={setToken} />;
    return <AdminDashboard token={token} onLogout={logout} />;
};
