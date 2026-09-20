import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
    HttpError,
    KITCHEN_LATE_MINUTES,
    disableKitchenPush,
    enableKitchenPush,
    fetchKitchenOrders,
    formatPastaOptions,
    formatPhone,
    formatPrice,
    getKitchenToken,
    getMinutesSince,
    hasKitchenPushSubscription,
    isChimeSoundOn,
    isPushSupported,
    isStandaloneApp,
    loginKitchen,
    playChime,
    setKitchenStep,
    setKitchenToken,
    unlockChimeSound,
} from "@/helpers";
import type { IKitchenOrder, KitchenStep } from "@/helpers";

import "./kitchen.css";

const POLL_MS = 5000;
// Sin respuesta del API por este tiempo se muestra la alerta de conexion
const OFFLINE_AFTER_MS = 15000;
// La campana se repite mientras haya pedidos sin aceptar
const CHIME_REPEAT_MS = 6000;
const TOAST_MS = 8000;

const formatClock = (date: Date | string | number) =>
    new Date(date).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" });

/** Manifest e iconos para "Agregar a pantalla de inicio" como app de cocina (iOS necesita esto para push). */
const useKitchenHead = () => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Cocina · Chunky Bites";

        const elements = [
            Object.assign(document.createElement("link"), { rel: "manifest", href: "/cocina.webmanifest" }),
            Object.assign(document.createElement("link"), { rel: "apple-touch-icon", href: "/cocina-icon-180.png" }),
            Object.assign(document.createElement("meta"), { name: "apple-mobile-web-app-capable", content: "yes" }),
            Object.assign(document.createElement("meta"), { name: "apple-mobile-web-app-title", content: "Cocina" }),
            Object.assign(document.createElement("meta"), { name: "theme-color", content: "#3a4b8e" }),
        ];
        elements.forEach((element) => document.head.appendChild(element));

        return () => {
            document.title = previousTitle;
            elements.forEach((element) => element.remove());
        };
    }, []);
};

/** Mantiene la pantalla encendida mientras el tablero esta abierto (Safari 16.4+). */
const useWakeLock = () => {
    const [isAwake, setIsAwake] = useState(false);

    useEffect(() => {
        let sentinel: WakeLockSentinel | null = null;

        const requestWakeLock = async () => {
            try {
                if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
                sentinel = await navigator.wakeLock.request("screen");
                setIsAwake(true);
                sentinel.addEventListener("release", () => setIsAwake(false));
            } catch {
                setIsAwake(false);
            }
        };

        requestWakeLock();
        document.addEventListener("visibilitychange", requestWakeLock);
        return () => {
            document.removeEventListener("visibilitychange", requestWakeLock);
            sentinel?.release().catch(() => null);
        };
    }, []);

    return isAwake;
};

/** Consulta el tablero cada 5 s y detecta los pedidos que entran. */
const useKitchenBoard = (token: string, onSessionExpired: () => void, onNewOrders: (orders: IKitchenOrder[]) => void) => {
    const [orders, setOrders] = useState<IKitchenOrder[]>([]);
    const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const seenIdsRef = useRef<Set<string> | null>(null);
    // El polling lee siempre los callbacks actuales sin reiniciarse
    const callbacksRef = useRef({ onSessionExpired, onNewOrders });
    useEffect(() => {
        callbacksRef.current = { onSessionExpired, onNewOrders };
    }, [onSessionExpired, onNewOrders]);

    const refresh = useCallback(async (signal?: AbortSignal) => {
        try {
            const { orders: nextOrders } = await fetchKitchenOrders(token, signal);
            setOrders(nextOrders);
            setLastSyncAt(Date.now());
            setIsLoaded(true);

            // Los que ya estaban al abrir no cuentan como "recien llegados"
            const seenIds = seenIdsRef.current;
            if (seenIds) {
                const arrived = nextOrders.filter((order) => !seenIds.has(order.id));
                if (arrived.length > 0) callbacksRef.current.onNewOrders(arrived);
            }
            seenIdsRef.current = new Set(nextOrders.map((order) => order.id));
        } catch (error) {
            if (signal?.aborted) return;
            if (error instanceof HttpError && error.status === 401) callbacksRef.current.onSessionExpired();
        }
    }, [token]);

    useEffect(() => {
        const controller = new AbortController();
        const firstLoad = window.setTimeout(() => refresh(controller.signal), 0);
        const timer = window.setInterval(() => refresh(controller.signal), POLL_MS);
        return () => {
            controller.abort();
            window.clearTimeout(firstLoad);
            window.clearInterval(timer);
        };
    }, [refresh]);

    return { orders, setOrders, lastSyncAt, isLoaded, refresh };
};

/* ============ Acceso con PIN ============ */

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

const KitchenLogin = ({ onLogin }: { onLogin: (token: string) => void }) => {
    const [pin, setPin] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);

    const pressKey = (key: string) => {
        setError(null);
        if (key === "⌫") setPin((current) => current.slice(0, -1));
        else if (key) setPin((current) => (current.length < 12 ? current + key : current));
    };

    const submit = async (event?: FormEvent) => {
        event?.preventDefault();
        if (pin.length < 4 || isSending) return;
        setIsSending(true);
        try {
            const { token } = await loginKitchen(pin);
            onLogin(token);
        } catch (loginError) {
            setPin("");
            setError(loginError instanceof HttpError && loginError.status < 500 ? loginError.message : "No pudimos conectar. Revisa el Wi-Fi.");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="kitchen-center">
            <form className="kitchen-panel" onSubmit={submit}>
                <h1 className="kitchen-panel__title script">Cocina</h1>
                <p>Escribe el PIN del local para ver los pedidos.</p>
                <label htmlFor="kitchen-pin" className="kitchen-sr-only">PIN</label>
                <input
                    id="kitchen-pin"
                    className="kitchen-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={12}
                    value={pin}
                    onChange={(event) => { setError(null); setPin(event.target.value.replace(/\D/g, "")); }}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "kitchen-pin-error" : undefined}
                />
                {error && <p id="kitchen-pin-error" className="kitchen-error" role="alert">{error}</p>}
                <div className="kitchen-keys">
                    {PIN_KEYS.map((key, index) => (
                        key ? (
                            <button key={key} type="button" className="kitchen-key" onClick={() => pressKey(key)} aria-label={key === "⌫" ? "Borrar" : key}>{key}</button>
                        ) : <span key={`vacio-${index}`} />
                    ))}
                </div>
                <button type="submit" className="kitchen-btn" disabled={pin.length < 4 || isSending}>
                    {isSending ? "Entrando…" : "Entrar"}
                </button>
            </form>
        </div>
    );
};

/* ============ Inicio de turno ============ */

const KitchenStart = ({ token, onStart, onLogout }: { token: string; onStart: (hasPush: boolean) => void; onLogout: () => void }) => {
    const [isStarting, setIsStarting] = useState(false);
    const canUsePush = isPushSupported() && isStandaloneApp();

    const start = async () => {
        setIsStarting(true);
        // Todo dentro del toque: iOS solo habilita audio y permisos asi
        const isSoundOn = await unlockChimeSound();
        if (isSoundOn) playChime();
        const hasPush = canUsePush ? await enableKitchenPush(token) : false;
        onStart(hasPush);
    };

    return (
        <div className="kitchen-center">
            <div className="kitchen-panel">
                <h1 className="kitchen-panel__title script">Iniciar turno</h1>
                <p>Un toque para que el iPad suene con cada pedido y no se apague la pantalla.</p>
                <ul className="kitchen-checks">
                    <li className="is-ok"><b>✓</b>Sesión de cocina activa</li>
                    <li><b>♪</b>Sonido de pedidos nuevos</li>
                    <li><b>☀</b>Pantalla siempre encendida</li>
                    <li className={canUsePush ? "" : "is-warn"}>
                        <b>{canUsePush ? "✉" : "!"}</b>
                        {canUsePush
                            ? "Avisos con el iPad bloqueado"
                            : "Para recibir avisos con el iPad bloqueado: Compartir → Agregar a inicio, y abre Cocina desde ese ícono."}
                    </li>
                </ul>
                <button type="button" className="kitchen-btn" onClick={start} disabled={isStarting}>
                    {isStarting ? "Activando…" : "Iniciar turno"}
                </button>
                <button type="button" className="kitchen-link" onClick={onLogout}>Cerrar sesión de cocina</button>
            </div>
        </div>
    );
};

/* ============ Tablero ============ */

const STEP_ACTION: Record<KitchenStep, string> = {
    accept: "Aceptar pedido",
    ready: "Marcar listo",
    deliver: "Entregado",
};

/** "2× Café (leche especial)" para el aviso de pedido nuevo. */
const formatKitchenLine = (line: IKitchenOrder["lines"][number]) => {
    const details = [
        ...(line.options ? [formatPastaOptions(line.options, ", ")] : []),
        ...(line.modifiers ?? []).map((modifier) => `${modifier.name} ${modifier.option}`),
    ];
    return `${line.quantity}× ${line.name}${details.length ? ` (${details.join(", ")})` : ""}`;
};

const KitchenTicket = ({ order, now, onStep }: { order: IKitchenOrder; now: number; onStep: (order: IKitchenOrder, step: KitchenStep) => void }) => {
    const isNew = !order.acceptedAt;
    const isReady = Boolean(order.readyAt);
    const step: KitchenStep = isNew ? "accept" : isReady ? "deliver" : "ready";

    // Nuevo: desde el pago · Preparando: desde que se acepto · Listo: desde que se marco
    const minutes = getMinutesSince(isReady ? order.readyAt : isNew ? order.paidAt : order.acceptedAt, now);
    const isLate = !isNew && !isReady && minutes >= KITCHEN_LATE_MINUTES;
    const timeLabel = isReady ? "listo hace" : isNew ? "hace" : "preparando";

    return (
        <article className={`kitchen-ticket ${isNew ? "kitchen-ticket--new" : ""} ${isReady ? "kitchen-ticket--ready" : ""}`}>
            <header className="kitchen-ticket__top">
                <span className="kitchen-ticket__name">
                    {order.customerName}
                    {order.delivery && <span className="kitchen-ticket__badge">Delivery</span>}
                </span>
                <span className={`kitchen-ticket__time ${isLate ? "kitchen-ticket__time--late" : ""}`}>
                    {timeLabel} <b>{minutes}</b> min
                </span>
            </header>
            <ul className="kitchen-ticket__items">
                {order.lines.map((line, index) => (
                    <li key={`${line.name}-${index}`}>
                        <b>{line.quantity}×</b>{line.name}
                        {(line.options || line.modifiers?.length) && (
                            <span className="kitchen-ticket__options">
                                {[
                                    ...(line.options ? [formatPastaOptions(line.options)] : []),
                                    ...(line.modifiers ?? []).map((modifier) => `${modifier.name} ${modifier.option}`),
                                ].join(" · ")}
                            </span>
                        )}
                    </li>
                ))}
            </ul>
            {order.delivery && (
                <div className="kitchen-ticket__dest">
                    <b>Entregar en</b>
                    <span>{order.delivery.address}</span>
                    {order.delivery.details && <span>{order.delivery.details}</span>}
                    <a href={order.delivery.mapUrl} target="_blank" rel="noopener noreferrer">Abrir en Maps</a>
                </div>
            )}
            {order.note && <p className="kitchen-ticket__note">Nota: {order.note}</p>}
            <div className="kitchen-ticket__meta">
                <span>{order.id} · {formatPrice(order.total)} Yappy · {formatClock(order.paidAt)}</span>
                <span>
                    {order.whatsappPhone ? `WhatsApp ${formatPhone(order.whatsappPhone)}` : `Tel ${formatPhone(order.customerPhone)}`}
                </span>
            </div>
            <button type="button" className={`kitchen-ticket__action kitchen-ticket__action--${step}`} onClick={() => onStep(order, step)}>
                {STEP_ACTION[step]}
            </button>
        </article>
    );
};

const KitchenColumn = ({ title, orders, empty, isNew, now, onStep }: {
    title: string;
    orders: IKitchenOrder[];
    empty: string;
    isNew?: boolean;
    now: number;
    onStep: (order: IKitchenOrder, step: KitchenStep) => void;
}) => (
    <section className={`kitchen-col ${isNew ? "kitchen-col--new" : ""}`} aria-label={title}>
        <h2 className="kitchen-col__head">{title} <span className="kitchen-count">{orders.length}</span></h2>
        <div className="kitchen-col__list">
            {orders.length === 0
                ? <p className="kitchen-empty">{empty}</p>
                : orders.map((order) => <KitchenTicket key={order.id} order={order} now={now} onStep={onStep} />)}
        </div>
    </section>
);

const KitchenBoard = ({ token, hasPush, onLogout, onSessionExpired }: {
    token: string;
    hasPush: boolean;
    onLogout: () => void;
    onSessionExpired: () => void;
}) => {
    const [now, setNow] = useState(() => Date.now());
    const [isSoundOn, setIsSoundOn] = useState(isChimeSoundOn());
    const [isPushOn, setIsPushOn] = useState(hasPush);
    const [toast, setToast] = useState<IKitchenOrder | null>(null);
    const [stepError, setStepError] = useState<string | null>(null);
    const isAwake = useWakeLock();

    const showArrivals = useCallback((arrived: IKitchenOrder[]) => {
        setToast(arrived[arrived.length - 1]);
        playChime();
    }, []);

    const { orders, setOrders, lastSyncAt, isLoaded, refresh } = useKitchenBoard(token, onSessionExpired, showArrivals);

    const newOrders = orders.filter((order) => !order.acceptedAt);
    const preparingOrders = orders.filter((order) => order.acceptedAt && !order.readyAt);
    const readyOrders = orders.filter((order) => order.readyAt);
    const hasNewOrders = newOrders.length > 0;
    const isOffline = isLoaded ? now - (lastSyncAt ?? 0) > OFFLINE_AFTER_MS : false;

    // Reloj y estado del sonido (iOS lo suspende al bloquearse)
    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(Date.now());
            setIsSoundOn(isChimeSoundOn());
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        hasKitchenPushSubscription().then(setIsPushOn);
    }, []);

    // La campana sigue sonando mientras haya pedidos sin aceptar
    useEffect(() => {
        if (!hasNewOrders) return;
        const timer = window.setInterval(playChime, CHIME_REPEAT_MS);
        return () => window.clearInterval(timer);
    }, [hasNewOrders]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), TOAST_MS);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const turnSoundOn = async () => setIsSoundOn(await unlockChimeSound());

    const runStep = async (order: IKitchenOrder, step: KitchenStep) => {
        setStepError(null);
        try {
            const { order: updated } = await setKitchenStep(token, order.id, step);
            setOrders((current) => step === "deliver"
                ? current.filter((entry) => entry.id !== order.id)
                : current.map((entry) => (entry.id === order.id ? updated : entry)));
        } catch (error) {
            if (error instanceof HttpError && error.status === 401) return onSessionExpired();
            setStepError(`No pudimos actualizar el pedido de ${order.customerName}. Intenta de nuevo.`);
            refresh();
        }
    };

    return (
        <div className="kitchen-board-page">
            <header className="kitchen-bar">
                <div className="kitchen-bar__brand"><span className="script">Chunky Bites</span><span>Cocina</span></div>
                <div className="kitchen-bar__status">
                    <span className={`kitchen-pill ${isOffline ? "kitchen-pill--warn" : ""}`}>
                        <i />{isOffline ? `Sin conexión desde ${formatClock(lastSyncAt ?? now)}` : "En línea"}
                    </span>
                    <span className={`kitchen-pill ${isSoundOn ? "" : "kitchen-pill--warn"}`}><i />{isSoundOn ? "Sonido" : "Sonido apagado"}</span>
                    <span className={`kitchen-pill ${isAwake ? "" : "kitchen-pill--warn"}`}><i />{isAwake ? "Pantalla encendida" : "Pantalla puede apagarse"}</span>
                    <span className={`kitchen-pill ${isPushOn ? "" : "kitchen-pill--muted"}`}><i />{isPushOn ? "Avisos bloqueado" : "Sin avisos bloqueado"}</span>
                </div>
                <div className="kitchen-bar__end">
                    <span className="kitchen-bar__clock">{formatClock(now)}</span>
                    <button type="button" className="kitchen-bar__logout" onClick={onLogout}>Salir</button>
                </div>
            </header>

            {(isOffline || !isSoundOn) && (
                <div className="kitchen-banner" role="alert">
                    <span>
                        {isOffline
                            ? "No estamos recibiendo pedidos: revisa el Wi-Fi del iPad. Reintentando…"
                            : "El sonido está apagado: los pedidos nuevos no van a sonar."}
                    </span>
                    {!isSoundOn && <button type="button" onClick={turnSoundOn}>Activar sonido</button>}
                </div>
            )}

            {stepError && <div className="kitchen-banner" role="alert"><span>{stepError}</span></div>}

            <main className="kitchen-board">
                <KitchenColumn title="Nuevos" orders={newOrders} empty="Sin pedidos nuevos" isNew now={now} onStep={runStep} />
                <KitchenColumn title="Preparando" orders={preparingOrders} empty="Nada en preparación" now={now} onStep={runStep} />
                <KitchenColumn title="Listos para retirar o enviar" orders={readyOrders} empty="Nada por entregar" now={now} onStep={runStep} />
            </main>

            {toast && (
                <div className="kitchen-toast" role="status">
                    <span className="kitchen-toast__bell" aria-hidden>♪</span>
                    <span>
                        <b>Nuevo pedido{toast.delivery ? " · Delivery" : ""} · {toast.customerName}</b>
                        <small>{toast.lines.map(formatKitchenLine).join(", ")}</small>
                    </span>
                </div>
            )}
        </div>
    );
};

/* ============ Vista ============ */

export const KitchenView = () => {
    const [token, setToken] = useState<string | null>(getKitchenToken);
    const [isStarted, setIsStarted] = useState(false);
    const [hasPush, setHasPush] = useState(false);
    useKitchenHead();

    const login = (nextToken: string) => {
        setKitchenToken(nextToken);
        setToken(nextToken);
    };

    // Cerrar sesion o sesion vencida: este iPad deja de recibir avisos (la suscripcion se cancela
    // en el dispositivo aunque el API ya no acepte el token)
    const logout = async () => {
        if (token) await disableKitchenPush(token);
        setKitchenToken(null);
        setToken(null);
        setIsStarted(false);
    };

    const start = (isPushOn: boolean) => {
        setHasPush(isPushOn);
        setIsStarted(true);
    };

    return (
        <div className="kitchen">
            {!token ? (
                <KitchenLogin onLogin={login} />
            ) : !isStarted ? (
                <KitchenStart token={token} onStart={start} onLogout={logout} />
            ) : (
                <KitchenBoard token={token} hasPush={hasPush} onLogout={logout} onSessionExpired={logout} />
            )}
        </div>
    );
};
