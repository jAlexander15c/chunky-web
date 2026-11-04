import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    COLLABORATOR_ROLES,
    HttpError,
    ROLE_LABEL,
    fetchStaffMe,
    formatCash,
    getGestionToken,
    logoutGestion,
    setGestionToken,
} from "@/helpers";
import type { CollaboratorRole, IGestionSession, IShiftDetail, IStaffLogin } from "@/helpers";
import { useCourierTracking } from "@/hooks/useCourierTracking";
import { useDeliveryFeed } from "@/hooks/useDeliveryFeed";
import { useKitchenFeed } from "@/hooks/useKitchenFeed";
import { useOrderAlerts } from "@/hooks/useOrderAlerts";
import type { OrderAlertsStatus } from "@/hooks/useOrderAlerts";
import { shouldOfferFaceId } from "@/hooks/useStaffAccess";

import { FullSheet } from "@/components";

import { GestionCaja } from "./gestion/caja";
import { GestionCocina, KitchenToast } from "./gestion/cocina";
import { GestionCreditos } from "./gestion/creditos";
import { GestionDelivery } from "./gestion/delivery";
import { GestionInventario } from "./gestion/inventario";
import { GestionPasteleria } from "./gestion/pasteleria";
import { GestionChoosePin, GestionLogin } from "./gestion/login";
import { SECTIONS } from "./gestion/sections";
import type { Section } from "./gestion/sections";
import { GestionTurno } from "./gestion/turno";
import { AccessPanel, FaceIdOffer } from "./staff-access";

import "@/styles/ops.css";
import "./gestion.css";
import "./admin.css";

/** Por que no se pueden activar los avisos aqui, al tocar "Activar avisos". */
const ALERT_HINT: Record<OrderAlertsStatus, string> = {
    homeScreen:
        "Para recibir avisos con la pantalla apagada, abre Gestión desde su ícono: en Safari toca Compartir → Agregar a inicio, entra desde ese ícono y toca Activar avisos.",
    denied: "Las notificaciones están bloqueadas. Actívalas en Ajustes → Notificaciones → Gestión y vuelve a entrar.",
    unsupported: "Este navegador no recibe avisos. Usa Safari en el iPad o Chrome.",
    loading: "",
    off: "",
    on: "",
};

const useGestionHead = () => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Gestión · Chunky Bites";
        return () => {
            document.title = previousTitle;
        };
    }, []);
};

interface IGestionShellProps {
    token: string;
    meId: number;
    name: string;
    roles: CollaboratorRole[];
    onLogout: () => void;
    onTokenChange: (login: IStaffLogin) => void;
}

/** En el teléfono la barra de abajo muestra hasta cinco; con más, cuatro y "Más" abre el resto a pantalla completa. */
const MAX_BOTTOM_ITEMS = 5;

const MoreIcon = () => (
    <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="19" cy="12" r="1.5" />
    </svg>
);

const GestionShell = ({ token, meId, name, roles, onLogout, onTokenChange }: IGestionShellProps) => {
    const [shift, setShift] = useState<IShiftDetail | null>(null);

    // Solo se ofrece lo que esta persona puede hacer
    const available = useMemo(() => SECTIONS.filter((one) => one.roles.some((role) => roles.includes(role))), [roles]);
    // Al tocar una notificacion se llega con ?s=cocina o ?s=delivery
    const [section, setSection] = useState<Section>(() => {
        const requested = new URLSearchParams(window.location.search).get("s");
        return available.find((one) => one.id === requested)?.id ?? available[0]?.id ?? "inventario";
    });
    // Pedido que se abre al llegar a Delivery desde Cocina (Confirmar / Ver en Delivery)
    const [deliveryOpenId, setDeliveryOpenId] = useState<string | null>(null);

    const current = available.find((one) => one.id === section) ?? available[0];

    // Los pedidos de la web se siguen en cualquier seccion: quien cobra tambien atiende la cocina
    const kitchen = useKitchenFeed(token, roles.includes("caja"), onLogout);
    // Y los avisos llegan aunque la tablet este bloqueada. A la pastelera le llegan las cotizaciones nuevas
    const canReceiveAlerts = roles.includes("caja") || roles.includes("pastelera");
    const alerts = useOrderAlerts(token, canReceiveAlerts, onLogout);
    const [isAlertHintOpen, setIsAlertHintOpen] = useState(false);
    const alertHint = alerts.error || (isAlertHintOpen ? ALERT_HINT[alerts.status] : "");

    // Delivery tambien: suena el pedido nuevo por WhatsApp y el repartidor sigue compartiendo
    // su ubicacion aunque cambie de seccion
    const canDeliver = roles.includes("caja") || roles.includes("repartidor");
    const delivery = useDeliveryFeed(token, canDeliver, onLogout, roles.includes("caja"));
    const myOutOrderIds = delivery.orders.filter((order) => order.outAt && order.courierId === meId).map((order) => order.id);
    const tracking = useCourierTracking(token, myOutOrderIds, onLogout);
    const deliveryBadge = roles.includes("caja") ? delivery.pendingCount : delivery.readyToGoCount;

    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const closeMore = useCallback(() => setIsMoreOpen(false), []);

    const openSection = (id: Section) => {
        setSection(id);
        setDeliveryOpenId(null);
    };

    /** Pedidos nuevos en Cocina; en Delivery, los que esperan a caja o al repartidor. */
    const getBadge = (id: Section) => {
        if (id === "cocina" && kitchen.newCount > 0)
            return <span className="ges-nav__badge" aria-label={`${kitchen.newCount} pedidos nuevos`}>{kitchen.newCount}</span>;
        if (id === "delivery" && deliveryBadge > 0)
            return (
                <span
                    className="ges-nav__badge"
                    aria-label={roles.includes("caja") ? `${deliveryBadge} por coordinar` : `${deliveryBadge} listos para salir`}
                >
                    {deliveryBadge}
                </span>
            );
        return null;
    };

    const hasMore = available.length > MAX_BOTTOM_ITEMS;
    const overflow = hasMore ? available.slice(MAX_BOTTOM_ITEMS - 1) : [];
    const currentInOverflow = overflow.find((one) => one.id === current?.id);

    if (!current) {
        return (
            <div className="ges ges-gate">
                <div className="ges-gate__panel">
                    <span className="ges-gate__mark script">Gestión</span>
                    <h1>Sin permisos</h1>
                    <p>Tu PIN funciona, pero todavía no tiene ninguna sección asignada. Pídele al administrador que te dé caja, inventario, repostería o repartidor.</p>
                    <button type="button" className="ges-btn ges-btn--block" onClick={onLogout}>Salir</button>
                </div>
            </div>
        );
    }

    return (
        <div className="ges ges-shell">
            <nav className="ges-nav" aria-label="Secciones de gestión">
                <div className="ges-nav__brand script">Gestión</div>
                {available.map((one, index) => (
                    <button
                        key={one.id}
                        type="button"
                        className={`ges-nav__item${hasMore && index >= MAX_BOTTOM_ITEMS - 1 ? " is-overflow" : ""}`}
                        aria-current={current.id === one.id}
                        onClick={() => openSection(one.id)}
                    >
                        {one.icon}
                        {one.label}
                        {getBadge(one.id)}
                    </button>
                ))}
                {hasMore ? (
                    <button
                        type="button"
                        className="ges-nav__item ges-nav__more"
                        aria-current={Boolean(currentInOverflow)}
                        aria-haspopup="dialog"
                        onClick={() => setIsMoreOpen(true)}
                    >
                        {currentInOverflow ? currentInOverflow.icon : <MoreIcon />}
                        {currentInOverflow ? currentInOverflow.label : "Más"}
                        {overflow.some((one) => one.id !== currentInOverflow?.id && getBadge(one.id)) ? (
                            <span className="ges-nav__dot" aria-label="Hay pendientes en otras secciones" />
                        ) : null}
                    </button>
                ) : null}
                <div className="ges-nav__foot">
                    {name || "equipo"}
                    <span>{roles.map((role) => ROLE_LABEL[role]).join(" · ") || "sin permisos"}</span>
                </div>
            </nav>

            {isMoreOpen ? (
                <FullSheet title="Ir a…" onClose={closeMore}>
                    {(close) => (
                        <div className="fsheet__group">
                            {available.map((one) => (
                                <button
                                    key={one.id}
                                    type="button"
                                    className="fsheet__opt"
                                    aria-current={current.id === one.id}
                                    onClick={() => close(() => openSection(one.id))}
                                >
                                    <span className="fsheet__ico">{one.icon}</span>
                                    <span className="fsheet__text">
                                        <b>{one.label}</b>
                                        <small>{one.sub}</small>
                                    </span>
                                    {getBadge(one.id)}
                                </button>
                            ))}
                        </div>
                    )}
                </FullSheet>
            ) : null}

            <div className="ges-panel">
                <header className="ges-top">
                    <div>
                        <h1>{current.label}</h1>
                        <p className="ges-top__sub">{current.sub}</p>
                    </div>
                    <div className="ges-top__right">
                        {current.id === "cocina" ? (
                            <>
                                <span className={`ges-chip${kitchen.offlineSince !== null ? " is-off" : ""}`} role="status">
                                    <i aria-hidden="true" />
                                    {kitchen.offlineSince !== null ? "Sin conexión" : "En línea"}
                                </span>
                            </>
                        ) : null}
                        {roles.includes("caja") ? (
                            <>
                                {kitchen.isSoundOn ? (
                                    <span className="ges-chip">
                                        <i aria-hidden="true" />
                                        Sonido
                                    </span>
                                ) : (
                                    <button type="button" className="ges-chip is-off" onClick={kitchen.turnSoundOn}>
                                        <i aria-hidden="true" />
                                        Activar sonido
                                    </button>
                                )}
                            </>
                        ) : null}
                        {canReceiveAlerts ? (
                            <>
                                {alerts.status === "on" ? (
                                    <span className="ges-chip">
                                        <i aria-hidden="true" />
                                        Avisos
                                    </span>
                                ) : alerts.status !== "loading" ? (
                                    <button
                                        type="button"
                                        className="ges-chip is-off"
                                        disabled={alerts.isSaving}
                                        onClick={() => {
                                            if (alerts.status === "off") void alerts.activate();
                                            else setIsAlertHintOpen((isOpen) => !isOpen);
                                        }}
                                    >
                                        <i aria-hidden="true" />
                                        {alerts.isSaving ? "Activando…" : "Activar avisos"}
                                    </button>
                                ) : null}
                            </>
                        ) : null}
                        {tracking.status !== "off" ? (
                            <span
                                className={`ges-chip${tracking.status === "sharing" ? "" : " is-off"}`}
                                role="status"
                            >
                                <i aria-hidden="true" />
                                {tracking.status === "sharing" ? "Compartiendo ubicación" : "Ubicación sin compartir"}
                            </span>
                        ) : null}
                        {roles.includes("caja") ? (
                            <span className={`ges-chip${shift ? "" : " is-off"}`} role="status">
                                <i aria-hidden="true" />
                                {shift ? `Turno abierto · ${formatCash(shift.expected)}` : "Sin turno abierto"}
                            </span>
                        ) : null}
                        <button type="button" className="ges-btn ges-btn--sm" onClick={onLogout}>Salir</button>
                    </div>
                </header>
                {alertHint ? <p className="ges-top__hint" role="status">{alertHint}</p> : null}

                <main className="ges-body">
                    {current.id === "caja" ? (
                        <GestionCaja token={token} onSessionExpired={onLogout} onShiftChange={setShift} />
                    ) : current.id === "turno" ? (
                        <GestionTurno token={token} onSessionExpired={onLogout} onShiftChange={setShift} />
                    ) : current.id === "creditos" ? (
                        <GestionCreditos token={token} onSessionExpired={onLogout} onShiftChange={setShift} />
                    ) : current.id === "cocina" ? (
                        <GestionCocina feed={kitchen} token={token} onSessionExpired={onLogout} onOpenDelivery={(orderId) => {
                            setDeliveryOpenId(orderId ?? null);
                            setSection("delivery");
                        }} />
                    ) : current.id === "delivery" ? (
                        <GestionDelivery
                            token={token}
                            meId={meId}
                            roles={roles}
                            feed={delivery}
                            tracking={tracking}
                            initialOpenId={deliveryOpenId}
                            onSessionExpired={onLogout}
                        />
                    ) : current.id === "pasteleria" ? (
                        <GestionPasteleria token={token} onSessionExpired={onLogout} />
                    ) : current.id === "acceso" ? (
                        <AccessPanel
                            kind="ges"
                            scope="gestion"
                            token={token}
                            personName={name}
                            onSessionExpired={onLogout}
                            onTokenChange={onTokenChange}
                        />
                    ) : (
                        <GestionInventario token={token} onSessionExpired={onLogout} />
                    )}
                </main>
            </div>

            {kitchen.toast ? <KitchenToast order={kitchen.toast} /> : null}
        </div>
    );
};

/** Mientras se pregunta al API quién tiene la sesión abierta (al recargar la página). */
const GestionSessionCheck = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
    <div className="ges ges-gate">
        <div className="ges-gate__panel">
            <span className="ges-gate__mark script">Gestión</span>
            <p className="ges-gate__error" role="alert">{error || "Entrando…"}</p>
            {error ? (
                <button type="button" className="ges-btn" onClick={onRetry}>Reintentar</button>
            ) : null}
        </div>
    </div>
);

interface IGestionMe extends IGestionSession {
    mustChangePin: boolean;
    isFaceIdAvailable: boolean;
}

export const GestionView = () => {
    const [token, setToken] = useState<string | null>(() => getGestionToken());
    const [session, setSession] = useState<IGestionMe | null>(null);
    const [sessionError, setSessionError] = useState("");
    const [retryKey, setRetryKey] = useState(0);
    const [isOfferingFaceId, setIsOfferingFaceId] = useState(false);
    /** Entró con PIN en esta visita: al terminar se le ofrece Face ID una vez. */
    const offerAfterPinRef = useRef(false);
    useGestionHead();

    // Nombre, roles y si le falta elegir PIN se piden siempre al API (efecto de abajo)
    const login = useCallback((result: IStaffLogin, viaPin = false) => {
        setGestionToken(result.token);
        setToken(result.token);
        setSession(null);
        if (viaPin) offerAfterPinRef.current = true;
    }, []);

    // También al vencer la sesión: revocar una ya vencida no hace daño
    const logout = useCallback(() => {
        if (token) void logoutGestion(token);
        setGestionToken(null);
        setToken(null);
        setSession(null);
        setIsOfferingFaceId(false);
    }, [token]);

    // Con un token guardado, nombre y roles se piden al API: no se guardan en el navegador
    useEffect(() => {
        if (!token || session) return;

        const controller = new AbortController();
        fetchStaffMe("gestion", token, controller.signal)
            .then(({ collaborator, mustChangePin, isFaceIdAvailable }) => {
                if (!collaborator) return;
                setSession({
                    ...collaborator,
                    roles: collaborator.roles.filter((role) => COLLABORATOR_ROLES.includes(role)),
                    // Un API sin estos campos (antes de desplegarlo) no pide elegir PIN
                    mustChangePin: mustChangePin === true,
                    isFaceIdAvailable: isFaceIdAvailable === true,
                });
            })
            .catch((requestError) => {
                if (controller.signal.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) {
                    setGestionToken(null);
                    setToken(null);
                    return;
                }
                setSessionError("No pudimos conectar. Revisa el Wi-Fi.");
            });
        return () => controller.abort();
    }, [token, session, retryKey]);

    // Ya con su PIN propio: si entró con PIN y el equipo tiene Face ID, se le ofrece una vez
    useEffect(() => {
        if (!session || session.mustChangePin || !offerAfterPinRef.current) return;
        offerAfterPinRef.current = false;
        void shouldOfferFaceId(session.isFaceIdAvailable).then(setIsOfferingFaceId);
    }, [session]);

    if (!token) return <GestionLogin onLogin={login} />;
    if (!session) {
        const retry = () => {
            setSessionError("");
            setRetryKey((key) => key + 1);
        };
        return <GestionSessionCheck error={sessionError} onRetry={retry} />;
    }
    if (session.mustChangePin) {
        return <GestionChoosePin token={token} name={session.name} onChanged={(result) => login(result, true)} />;
    }
    if (isOfferingFaceId) {
        return <FaceIdOffer kind="ges" scope="gestion" token={token} mark="Gestión" onDone={() => setIsOfferingFaceId(false)} />;
    }
    return (
        <GestionShell
            token={token}
            meId={session.id}
            name={session.name}
            roles={session.roles}
            onLogout={logout}
            onTokenChange={(result) => login(result)}
        />
    );
};
