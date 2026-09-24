import { httpPostKeepalive } from "./getHttp";

/**
 * Pasos del embudo de compra y unos pocos botones sueltos. Es una lista cerrada:
 * el API rechaza cualquier otro nombre (misma lista en chunky-api analytics.validation).
 */
export type TrackEventName =
    | "page_view"
    | "category_open"
    | "product_open"
    | "add_to_cart"
    | "cart_open"
    | "checkout_start"
    | "pay_click"
    | "whatsapp_click"
    | "quote_submit"
    | "pasta_open"
    | "pasta_add";

interface ITrackEvent {
    name: TrackEventName;
    target?: string;
    label?: string;
    path: string;
}

const SESSION_STORAGE_KEY = "chunky-session";
const FLUSH_INTERVAL_MS = 5000;
/** El API acepta hasta 50 por lote: se manda antes de llegar. */
const FLUSH_AT = 20;
/** Si el API no responde no se acumula sin fin: se tira lo mas viejo. */
const QUEUE_MAX = 100;
const TEXT_MAX = 120;
/** Rutas del equipo: no son clientes y ensuciarian el embudo. */
const STAFF_PATHS = ["/admin", "/tablero", "/gestion", "/staff", "/cocina"];

/** En desarrollo no se mide, salvo que se pida para probarlo (VITE_TRACKING_DEV=true). */
const isTrackingEnabled = !import.meta.env.DEV || import.meta.env.VITE_TRACKING_DEV === "true";

let queue: ITrackEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let fallbackSessionId: string | null = null;
let isListening = false;

const createSessionId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Id al azar de la pestaña: dura lo que la pestaña, no identifica a la persona. */
const getSessionId = () => {
    try {
        const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) return stored;
        const created = createSessionId();
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
        return created;
    } catch {
        // Modo privado o almacenamiento bloqueado: vale para esta carga de la pagina
        fallbackSessionId ??= createSessionId();
        return fallbackSessionId;
    }
};

const isStaffPath = (pathname: string) => STAFF_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/** /pedido/ABC123 se cuenta como /pedido: el id del pedido no aporta y es de un cliente. */
export const getTrackedPath = (pathname: string) => (pathname.startsWith("/pedido/") ? "/pedido" : pathname);

const clip = (value?: string) => (value ? value.slice(0, TEXT_MAX) : undefined);

/** Manda lo que haya en cola. Si falla se pierde: el tracking nunca frena una compra. */
const flushEvents = () => {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (queue.length === 0) return;

    const events = queue;
    queue = [];
    httpPostKeepalive("/events", { sessionId: getSessionId(), events }).catch(() => undefined);
};

const scheduleFlush = () => {
    if (queue.length >= FLUSH_AT) {
        flushEvents();
        return;
    }
    flushTimer ??= setTimeout(flushEvents, FLUSH_INTERVAL_MS);
};

/** Al esconder la pestaña (cambiar de app, cerrarla) se manda lo pendiente. */
const listenPageHide = () => {
    if (isListening) return;
    isListening = true;
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushEvents();
    });
    window.addEventListener("pagehide", flushEvents);
};

/** Registra un clic del embudo. target es el id (producto, categoria) y label su nombre. */
export const trackEvent = (name: TrackEventName, target?: string, label?: string) => {
    if (!isTrackingEnabled || typeof window === "undefined") return;
    const { pathname } = window.location;
    if (isStaffPath(pathname)) return;

    listenPageHide();
    queue.push({ name, target: clip(target), label: clip(label), path: getTrackedPath(pathname) });
    if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
    scheduleFlush();
};
