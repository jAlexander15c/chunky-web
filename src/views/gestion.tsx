import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
    COLLABORATOR_ROLES,
    HttpError,
    ROLE_LABEL,
    fetchStaffMe,
    formatCash,
    getGestionToken,
    hasUsedFaceIdHere,
    loginGestion,
    logoutGestion,
    setGestionToken,
} from "@/helpers";
import type { CollaboratorRole, IGestionSession, IShiftDetail, IStaffLogin } from "@/helpers";
import { useCourierTracking } from "@/hooks/useCourierTracking";
import { useDeliveryFeed } from "@/hooks/useDeliveryFeed";
import { useKitchenFeed } from "@/hooks/useKitchenFeed";
import { shouldOfferFaceId, useChoosePin, useFaceIdLogin } from "@/hooks/useStaffAccess";

import { FullSheet } from "@/components";

import { GestionCaja } from "./gestion/caja";
import { GestionCocina, KitchenToast } from "./gestion/cocina";
import { GestionCreditos } from "./gestion/creditos";
import { GestionDelivery } from "./gestion/delivery";
import { GestionInventario } from "./gestion/inventario";
import { GestionPasteleria } from "./gestion/pasteleria";
import { GestionTurno } from "./gestion/turno";
import { AccessPanel, FaceIdLoginButton, FaceIdOffer, InstallHint } from "./staff-access";

import "./gestion.css";
import "./admin.css";

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

/* ============ Acceso con PIN o Face ID ============ */

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

interface IPinPadProps {
    pin: string;
    isBusy: boolean;
    /** Lo que se lee bajo los puntos: el error o "Entrando…". */
    status: string;
    onChange: (pin: string) => void;
    /** Con seis dígitos se envía solo: no hace falta buscar el botón con las manos ocupadas. */
    onComplete: (pin: string) => void;
}

/** Los puntos y el teclado grande de /gestion, para entrar y para elegir el PIN. */
const PinPad = ({ pin, isBusy, status, onChange, onComplete }: IPinPadProps) => {
    const pressKey = (key: string) => {
        if (isBusy) return;
        if (key === "⌫") {
            onChange(pin.slice(0, -1));
            return;
        }
        if (pin.length >= PIN_LENGTH) return;

        const next = pin + key;
        onChange(next);
        if (next.length === PIN_LENGTH) onComplete(next);
    };

    return (
        <>
            <div className="ges-dots" role="status" aria-label={`${pin.length} de ${PIN_LENGTH} dígitos`}>
                {Array.from({ length: PIN_LENGTH }, (_value, index) => (
                    <span key={index} className={index < pin.length ? "is-on" : undefined} />
                ))}
            </div>

            <p className="ges-gate__error" role="alert">{status}</p>

            <div className="ges-keys">
                {PIN_KEYS.map((key, index) =>
                    key ? (
                        <button
                            key={key}
                            type="button"
                            className={`ges-key${key === "⌫" ? " ges-key--soft" : ""}`}
                            onClick={() => pressKey(key)}
                            disabled={isBusy}
                            aria-label={key === "⌫" ? "Borrar" : key}
                        >
                            {key}
                        </button>
                    ) : (
                        <span key={`vacio-${index}`} />
                    )
                )}
            </div>
        </>
    );
};

interface IGestionLoginProps {
    /** viaPin: entró escribiendo el PIN (después se le ofrece Face ID). */
    onLogin: (login: IStaffLogin, viaPin: boolean) => void;
}

const GestionLogin = ({ onLogin }: IGestionLoginProps) => {
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const faceId = useFaceIdLogin("gestion", (login) => onLogin(login, false));

    const submit = useCallback(
        async (candidate: string) => {
            setIsSending(true);
            setError("");

            try {
                onLogin(await loginGestion(candidate), true);
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

    const isReturning = faceId.isAvailable && hasUsedFaceIdHere();

    return (
        <div className="ges ges-gate">
            <div className="ges-gate__panel">
                <span className="ges-gate__mark script">Gestión</span>
                <h1>{isReturning ? "Hola de nuevo" : "Entra con tu PIN"}</h1>
                <p>Es tuyo: lo que registres queda a tu nombre.</p>
                <InstallHint />
                <FaceIdLoginButton kind="ges" faceId={faceId} />

                <PinPad
                    pin={pin}
                    isBusy={isSending}
                    status={isSending ? "Entrando…" : error}
                    onChange={(next) => {
                        setError("");
                        setPin(next);
                    }}
                    onComplete={(next) => void submit(next)}
                />
            </div>
        </div>
    );
};

/** Quien entró con el PIN que generó el tablero elige el suyo, con el mismo teclado. */
const GestionChoosePin = ({ token, name, onChanged }: { token: string; name: string; onChanged: (login: IStaffLogin) => void }) => {
    const choose = useChoosePin("gestion", token, onChanged);
    const isFirst = choose.step === "first";

    return (
        <div className="ges ges-gate">
            <div className="ges-gate__panel">
                <span className="ges-gate__mark script">Gestión</span>
                <h1>{isFirst ? "Elige tu PIN" : "Repite tu PIN"}</h1>
                <div className="sa-steps" aria-hidden="true">
                    <i className="is-on" />
                    <i className={isFirst ? undefined : "is-on"} />
                </div>
                <p>
                    {isFirst
                        ? `Hola, ${name}. Escribe 6 números que recuerdes. Desde ahora entras con ese PIN o con Face ID.`
                        : "Escríbelo otra vez para confirmarlo."}
                </p>

                <PinPad
                    pin={choose.pin}
                    isBusy={choose.isSaving}
                    status={choose.isSaving ? "Guardando…" : choose.error}
                    onChange={(next) => {
                        choose.setError("");
                        choose.setPin(next);
                    }}
                    onComplete={(next) => void choose.submit(next)}
                />
                <p className="sa-hint">No sirven 123456, 111111 ni parecidos.</p>
            </div>
        </div>
    );
};

/* ============ Armazón ============ */

type Section = "caja" | "turno" | "creditos" | "cocina" | "delivery" | "inventario" | "pasteleria" | "acceso";

interface ISectionInfo {
    id: Section;
    label: string;
    /** Se ve con cualquiera de estos roles. */
    roles: CollaboratorRole[];
    sub: string;
    icon: ReactNode;
}

const SECTIONS: ISectionInfo[] = [
    {
        id: "caja",
        label: "Caja",
        roles: ["caja"],
        sub: "Toma las mesas, envía a cocina y cobra",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="7" width="20" height="13" rx="2" />
                <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M2 12h20" />
            </svg>
        ),
    },
    {
        id: "turno",
        label: "Turno",
        roles: ["caja"],
        sub: "Fondo inicial, movimientos de efectivo y cierre",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </svg>
        ),
    },
    {
        id: "creditos",
        label: "Créditos",
        roles: ["caja"],
        sub: "Cuentas que se pagan después: quién debe y desde cuándo",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
                <path d="M9 8h6M9 12h6" />
            </svg>
        ),
    },
    {
        id: "cocina",
        label: "Cocina",
        roles: ["caja"],
        sub: "Pedidos de la web: acéptalos, márcalos listos y entrega lo que se retira",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 13.9A4 4 0 0 1 7 6a5 5 0 0 1 10 0 4 4 0 0 1 1 7.9V20H6z" />
                <path d="M6 17h12" />
            </svg>
        ),
    },
    {
        id: "delivery",
        label: "Delivery",
        roles: ["caja", "repartidor"],
        sub: "Pedidos por WhatsApp y a domicilio: confírmalos, manda el enlace y llévalos",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="6" cy="17" r="3" />
                <circle cx="18" cy="17" r="3" />
                <path d="M9 17h6l-2-7H9M13 10h3l2 7M5 10h4" />
            </svg>
        ),
    },
    {
        id: "inventario",
        label: "Inventario",
        roles: ["inventario"],
        sub: "Compras, conteos, mermas y disponibilidad",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
                <path d="M3 7l9 4 9-4M12 11v10" />
            </svg>
        ),
    },
    {
        id: "pasteleria",
        label: "Pastelería",
        roles: ["pastelera"],
        sub: "Tus cotizaciones de cakes y postres, y lo que te dejan",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 21V11h16v10M2 11h20M12 11V7" />
                <circle cx="12" cy="5" r="2" />
            </svg>
        ),
    },
    {
        // Va al final y la ve cualquiera con un rol: es de la persona, no de su trabajo
        id: "acceso",
        // Corto: en la barra de abajo del teléfono ya van siete secciones
        label: "Acceso",
        roles: COLLABORATOR_ROLES,
        sub: "Tu PIN y tus equipos con Face ID",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                <path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1.1 3.6 1.1 5 0" />
            </svg>
        ),
    },
];

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
    const [section, setSection] = useState<Section>(() => available[0]?.id ?? "inventario");
    // Pedido que se abre al llegar a Delivery desde Cocina (Confirmar / Ver en Delivery)
    const [deliveryOpenId, setDeliveryOpenId] = useState<string | null>(null);

    const current = available.find((one) => one.id === section) ?? available[0];

    // Los pedidos de la web se siguen en cualquier seccion: quien cobra tambien atiende la cocina
    const kitchen = useKitchenFeed(token, roles.includes("caja"), onLogout);

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
                    <p>Tu PIN funciona, pero todavía no tiene ninguna sección asignada. Pídele al administrador que te dé caja, inventario, pastelería o repartidor.</p>
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
                                <span className={`ges-chip${kitchen.isSoundOn ? "" : " is-off"}`}>
                                    <i aria-hidden="true" />
                                    {kitchen.isSoundOn ? "Sonido" : "Sonido apagado"}
                                </span>
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

                <main className="ges-body">
                    {current.id === "caja" ? (
                        <GestionCaja token={token} onSessionExpired={onLogout} onShiftChange={setShift} />
                    ) : current.id === "turno" ? (
                        <GestionTurno token={token} onSessionExpired={onLogout} onShiftChange={setShift} />
                    ) : current.id === "creditos" ? (
                        <GestionCreditos token={token} onSessionExpired={onLogout} onShiftChange={setShift} />
                    ) : current.id === "cocina" ? (
                        <GestionCocina feed={kitchen} onSessionExpired={onLogout} onOpenDelivery={(orderId) => {
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
