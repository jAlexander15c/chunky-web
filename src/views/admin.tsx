import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router";

import {
    HttpError,
    fetchDashboard,
    getSelectionRange,
    readStoredSelection,
    storeSelection,
    fetchSupplies,
    fetchStaffMe,
    getAdminToken,
    getGestionToken,
    logoutAdmin,
    logoutGestion,
    setAdminToken,
    setGestionToken,
    setUnifiedAdminToken,
    syncReceiptsNow,
} from "@/helpers";
import type { IDashboard, IStaffLogin, IStaffMe, ISupplyStatus, PeriodSelection } from "@/helpers";
import { shouldOfferFaceId } from "@/hooks/useStaffAccess";

import { AdminStoreStatus } from "./admin-hours";
import { AdminIncidents } from "./admin-incidents";
import { AdminInventory } from "./admin-inventory";
import { AdminSite } from "./admin-site";
import { AdminWeb } from "./admin-web";
import { AdminCustomers } from "./admin-customers";
import { AdminOverview } from "./admin-overview";
import { PeriodPicker } from "./admin-period";
import {
    ADMIN_GROUPS,
    ADMIN_OPERATION_LINKS,
    ADMIN_SECTIONS,
    PERIOD_SECTIONS,
    getLegacySectionTarget,
    getSectionFromParam,
} from "./admin-sections";
import type { AdminSection } from "./admin-sections";
import { FullSheet, SheetChevron } from "@/components";
import { FaceIdOffer } from "./staff-access";
import { AdminChoosePin, AdminLogin } from "./admin/admin-login";
import { DeliveryModePanel } from "./admin/delivery-panel";
import { PastaModePanel } from "./admin/pasta-mode-panel";
import { useSalesTab } from "./admin/sales-tab";
import { MenuSection, SalesSection, SettingsSection } from "./admin/tabbed-sections";

import "@/styles/ops.css";
import "./admin.css";
// Después de admin.css para no cambiar la cascada: es el último bloque del archivo original
import "./admin-waste.css";

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

const SECTION_PARAM = "s";

/* ============ Tablero ============ */

interface IAdminDashboardProps {
    token: string;
    /** Null si se entró con la llave de recuperación (ADMIN_PIN). */
    personName: string | null;
    /** Muestra el grupo Operación (enlaces a /gestion): solo con la sesión de una persona. */
    hasOperation?: boolean;
    onLogout: () => void;
}

const AdminDashboard = ({ token, personName, hasOperation = false, onLogout }: IAdminDashboardProps) => {
    const navigate = useNavigate();
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
    // Ventas tiene la pestaña Cierres, que no usa el período
    const [salesTab] = useSalesTab();
    const hasPeriod = PERIOD_SECTIONS.includes(section) && !(section === "ventas" && salesTab === "cierres");
    // En el teléfono el menú es un botón que abre la lista a pantalla completa
    const [isNavOpen, setIsNavOpen] = useState(false);
    const closeNav = useCallback(() => setIsNavOpen(false), []);

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

    /** El número junto a la sección: insumos por comprar o descuadres sin resolver. */
    const getSectionBadge = (id: AdminSection) => {
        if (id === "inventario" && toBuy.length > 0)
            return <span className="adm-menu__badge" aria-label={`${toBuy.length} insumos por comprar`}>{toBuy.length}</span>;
        if (id === "resumen" && openIncidents > 0)
            return (
                <span className="adm-menu__badge is-alert" aria-label={`${openIncidents} descuadres sin resolver`}>
                    {openIncidents}
                </span>
            );
        return null;
    };
    const today = dashboard
        ? new Date(dashboard.serverTime).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" })
        : "";

    /** Qué se dibuja en cada sección: un mapa en vez de una cadena de ternarios. */
    const sectionViews: Record<AdminSection, () => ReactNode> = {
        resumen: () => (
            <>
                {/* Lo que se enciende y se apaga durante el día, sin ir a Ajustes */}
                <div className="adm-quick">
                    <DeliveryModePanel token={token} onSessionExpired={onLogout} />
                    <PastaModePanel token={token} onSessionExpired={onLogout} />
                    <AdminStoreStatus token={token} onSessionExpired={onLogout} />
                </div>

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
        ),
        ventas: () => <SalesSection token={token} onSessionExpired={onLogout} refreshKey={refreshKey} from={range.from} to={range.to} />,
        web: () => <AdminWeb token={token} onSessionExpired={onLogout} refreshKey={refreshKey} from={range.from} to={range.to} />,
        clientes: () => <AdminCustomers token={token} onSessionExpired={onLogout} refreshKey={refreshKey} />,
        inventario: () => <AdminInventory token={token} onSessionExpired={onLogout} refreshKey={refreshKey} from={range.from} to={range.to} />,
        menu: () => <MenuSection token={token} onSessionExpired={onLogout} />,
        pagina: () => <AdminSite token={token} onSessionExpired={onLogout} />,
        ajustes: () => <SettingsSection token={token} onSessionExpired={onLogout} />,
    };

    // Enlaces de antes de reunir las secciones (avisos, favoritos): cada uno va a su lugar nuevo
    const requestedSection = searchParams.get(SECTION_PARAM);
    const legacyTarget = getLegacySectionTarget(requestedSection);
    if (legacyTarget) {
        const params = new URLSearchParams({ [SECTION_PARAM]: legacyTarget.section });
        if (legacyTarget.tab) params.set("t", legacyTarget.tab);
        return <Navigate to={`/admin?${params.toString()}`} replace />;
    }
    // "Mi acceso" es el Acceso de Gestión. Con la llave de recuperación no hay a dónde ir: al resumen
    if (requestedSection === "acceso") return <Navigate to={hasOperation ? "/gestion?s=acceso" : "/admin"} replace />;

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
                    <span className="adm-bar__where">{personName ? `${today} · ${personName}` : today}</span>
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
                                    <SectionIcon icon={one.icon} />
                                    {one.label}
                                    {getSectionBadge(one.id)}
                                </button>
                            ))}
                        </div>
                    ))}
                    {hasOperation ? (
                        <div className="adm-menu__group" role="group" aria-labelledby="adm-menu-operacion">
                            <span className="adm-menu__label" id="adm-menu-operacion">Operación</span>
                            {ADMIN_OPERATION_LINKS.map((one) => (
                                <Link key={one.id} className="adm-menu__item" to={one.href}>
                                    <SectionIcon icon={one.icon} />
                                    {one.label}
                                </Link>
                            ))}
                        </div>
                    ) : null}
                </nav>

                <button type="button" className="adm-nav-trigger" aria-haspopup="dialog" onClick={() => setIsNavOpen(true)}>
                    <SectionIcon icon={sectionInfo.icon} />
                    <span className="adm-nav-trigger__text">
                        <small>{ADMIN_GROUPS.find((group) => group.sections.some((one) => one.id === section))?.label}</small>
                        <b>{sectionInfo.label}</b>
                    </span>
                    {ADMIN_SECTIONS.some((one) => one.id !== section && getSectionBadge(one.id)) ? (
                        <span className="adm-nav-trigger__dot" aria-label="Hay pendientes en otras secciones" />
                    ) : null}
                    {getSectionBadge(section)}
                    <SheetChevron />
                </button>

                {isNavOpen ? (
                    <FullSheet title="Ir a…" onClose={closeNav}>
                        {(close) => (
                            <>
                                {ADMIN_GROUPS.map((group) => (
                                    <div className="fsheet__group" role="group" aria-label={group.label} key={group.label}>
                                        <span className="fsheet__label">{group.label}</span>
                                        {group.sections.map((one) => (
                                            <button
                                                key={one.id}
                                                type="button"
                                                className="fsheet__opt"
                                                aria-current={section === one.id}
                                                onClick={() => close(() => openSection(one.id))}
                                            >
                                                <span className="fsheet__ico"><SectionIcon icon={one.icon} /></span>
                                                <span className="fsheet__text">
                                                    <b>{one.label}</b>
                                                    <small>{one.subtitle}</small>
                                                </span>
                                                {getSectionBadge(one.id)}
                                            </button>
                                        ))}
                                    </div>
                                ))}
                                {hasOperation ? (
                                    <div className="fsheet__group" role="group" aria-label="Operación">
                                        <span className="fsheet__label">Operación</span>
                                        {ADMIN_OPERATION_LINKS.map((one) => (
                                            <button key={one.id} type="button" className="fsheet__opt" onClick={() => close(() => navigate(one.href))}>
                                                <span className="fsheet__ico"><SectionIcon icon={one.icon} /></span>
                                                <span className="fsheet__text">
                                                    <b>{one.label}</b>
                                                    <small>{one.subtitle}</small>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </>
                        )}
                    </FullSheet>
                ) : null}

                <main className="adm-wrap" key={section}>
                    <div className="adm-head">
                        <div className="adm-head__text">
                            <h1 className="script">{sectionInfo.label}</h1>
                            <p>
                                {sectionInfo.subtitle}
                                {sectionInfo.source ? <span className={`adm-src${sectionInfo.source === "Loyverse" ? "" : " is-own"}`}>{sectionInfo.source}</span> : null}
                            </p>
                        </div>
                        {hasPeriod ? <PeriodPicker selection={period} onChange={changePeriod} /> : null}
                    </div>

                    {sectionViews[section]()}

                    {/* Los descuadres se cuentan en todas las secciones (el aviso del encabezado), pero se muestran en el resumen */}
                    <div hidden={section !== "resumen"}>
                        <AdminIncidents token={token} onSessionExpired={onLogout} onOpenCountChange={setOpenIncidents} />
                    </div>
                </main>
            </div>
        </div>
    );
};

/** Lo que se sabe con un API que todavía no tiene /admin/me: sin persona y sin Face ID. */
const UNKNOWN_ME: IStaffMe = { collaborator: null, mustChangePin: false, isFaceIdAvailable: false };

/** El icono de una sección, igual en el menú lateral y en la hoja del teléfono. */
const SectionIcon = ({ icon }: { icon: ReactNode }) => (
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
        {icon}
    </svg>
);

/**
 * La llave de recuperación (ADMIN_PIN) y las sesiones del tablero de antes del login único:
 * su propia pantalla de PIN y su sesión aparte, sin cambios.
 */
const RecoveryAdminView = () => {
    const [token, setToken] = useState<string | null>(() => getAdminToken());
    const [me, setMe] = useState<IStaffMe | null>(null);
    const [meError, setMeError] = useState("");
    const [retryKey, setRetryKey] = useState(0);
    const [isOfferingFaceId, setIsOfferingFaceId] = useState(false);
    /** Entró con PIN en esta visita: al terminar se le ofrece Face ID una vez. */
    const offerAfterPinRef = useRef(false);

    // También al vencer la sesión: revocar una ya vencida no hace daño
    const logout = useCallback(() => {
        if (token) void logoutAdmin(token);
        setAdminToken(null);
        setToken(null);
        setMe(null);
        setIsOfferingFaceId(false);
    }, [token]);

    const applyLogin = useCallback((login: IStaffLogin, viaPin = false) => {
        setAdminToken(login.token);
        setToken(login.token);
        setMe(null);
        if (viaPin) offerAfterPinRef.current = true;
    }, []);

    // Quién tiene la sesión y si le falta elegir PIN: se pregunta al API, no se guarda en el navegador
    useEffect(() => {
        if (!token || me) return;

        const controller = new AbortController();
        fetchStaffMe("admin", token, controller.signal)
            .then((loaded) => {
                setMeError("");
                setMe(loaded);
            })
            .catch((requestError) => {
                if (controller.signal.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) {
                    setAdminToken(null);
                    setToken(null);
                    return;
                }
                if (requestError instanceof HttpError && requestError.status === 404) {
                    setMe(UNKNOWN_ME);
                    return;
                }
                setMeError("No pudimos conectar. Revisa la conexión.");
            });
        return () => controller.abort();
    }, [token, me, retryKey]);

    // Ya con su PIN propio: si entró con PIN y el equipo tiene Face ID, se le ofrece una vez
    useEffect(() => {
        if (!me?.collaborator || me.mustChangePin || !offerAfterPinRef.current) return;
        offerAfterPinRef.current = false;
        void shouldOfferFaceId(me.isFaceIdAvailable).then(setIsOfferingFaceId);
    }, [me]);

    if (!token) return <AdminLogin onLogin={applyLogin} />;
    if (!me) {
        return (
            <div className="adm-gate">
                <div className="adm-gate__panel">
                    <span className="script adm-gate__mark">Chunky Bites</span>
                    {meError ? (
                        <>
                            <p className="adm-gate__error" role="alert">{meError}</p>
                            <button type="button" className="adm-btn adm-btn--block" onClick={() => setRetryKey((key) => key + 1)}>
                                Reintentar
                            </button>
                        </>
                    ) : (
                        <p className="adm-gate__loading script">Entrando…</p>
                    )}
                </div>
            </div>
        );
    }
    if (me.mustChangePin && me.collaborator) {
        return <AdminChoosePin token={token} name={me.collaborator.name} onChanged={(login) => applyLogin(login, true)} />;
    }
    if (isOfferingFaceId) {
        return <FaceIdOffer kind="adm" scope="admin" token={token} mark="Chunky Bites" onDone={() => setIsOfferingFaceId(false)} />;
    }
    return (
        <AdminDashboard token={token} personName={me.collaborator?.name ?? null} onLogout={logout} />
    );
};

/** Mientras se pregunta quién tiene la sesión, o si no se pudo entrar. */
const AdminGate = ({ message, action }: { message: string; action?: ReactNode }) => (
    <div className="adm-gate">
        <div className="adm-gate__panel">
            <span className="script adm-gate__mark">Chunky Bites</span>
            {action ? (
                <>
                    <p className="adm-gate__error" role="alert">{message}</p>
                    {action}
                </>
            ) : (
                <p className="adm-gate__loading script">{message}</p>
            )}
        </div>
    </div>
);

interface IUnifiedAdminViewProps {
    token: string;
    onTokenChange: (token: string | null) => void;
}

/** El tablero con la misma sesión de /gestion: un solo PIN o Face ID para todo el equipo. */
const UnifiedAdminView = ({ token, onTokenChange }: IUnifiedAdminViewProps) => {
    const navigate = useNavigate();
    const [me, setMe] = useState<IStaffMe | null>(null);
    const [meError, setMeError] = useState("");
    const [retryKey, setRetryKey] = useState(0);

    // Antes que los efectos de las secciones: sus llamadas al tablero van con x-gestion-token
    useLayoutEffect(() => {
        setUnifiedAdminToken(token);
        return () => setUnifiedAdminToken(null);
    }, [token]);

    const logout = useCallback(() => {
        void logoutGestion(token);
        setGestionToken(null);
        onTokenChange(null);
        navigate("/gestion", { replace: true });
    }, [token, onTokenChange, navigate]);

    // Quién tiene la sesión y sus roles: se pregunta al API cada vez, como en /gestion
    useEffect(() => {
        const controller = new AbortController();
        fetchStaffMe("gestion", token, controller.signal)
            .then((loaded) => {
                setMeError("");
                setMe(loaded);
            })
            .catch((requestError) => {
                if (controller.signal.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) {
                    setGestionToken(null);
                    onTokenChange(null);
                    return;
                }
                setMeError("No pudimos conectar. Revisa la conexión.");
            });
        return () => controller.abort();
    }, [token, retryKey, onTokenChange]);

    if (!me) {
        if (!meError) return <AdminGate message="Entrando…" />;
        return (
            <AdminGate
                message={meError}
                action={
                    <button type="button" className="adm-btn adm-btn--block" onClick={() => setRetryKey((key) => key + 1)}>
                        Reintentar
                    </button>
                }
            />
        );
    }
    // Elegir el PIN propio y ofrecer Face ID son parte del login: se hacen en /gestion
    if (!me.collaborator || me.mustChangePin) return <Navigate to="/gestion" replace />;
    if (!me.collaborator.roles.includes("admin")) {
        return (
            <AdminGate
                message="Tu PIN no tiene permiso para abrir el tablero."
                action={<Link className="adm-btn adm-btn--block" to="/gestion">Ir a Gestión</Link>}
            />
        );
    }
    return (
        <AdminDashboard token={token} personName={me.collaborator.name} hasOperation onLogout={logout} />
    );
};

export const AdminView = () => {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const [token, setToken] = useState<string | null>(() => getGestionToken());
    useAdminHead();

    if (token) return <UnifiedAdminView token={token} onTokenChange={setToken} />;
    // Llave de recuperación (?recuperar) o una sesión del tablero de antes que todavía sirve
    if (searchParams.has("recuperar") || getAdminToken()) return <RecoveryAdminView />;
    // Un solo login: se entra por /gestion y se vuelve aquí (por ejemplo, desde un aviso)
    return <Navigate to={`/gestion?volver=${encodeURIComponent(location.pathname + location.search)}`} replace />;
};
