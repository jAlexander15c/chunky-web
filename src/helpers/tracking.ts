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
    | "quote_step"
    | "quote_submit"
    | "pasta_open"
    | "pasta_add";

interface ITrackEvent {
    name: TrackEventName;
    target?: string;
    label?: string;
    path: string;
    value?: number;
}

interface ITrafficOrigin {
    source: string;
    medium?: string;
}

const SESSION_STORAGE_KEY = "chunky-session";
const ORIGIN_STORAGE_KEY = "chunky-origin";
/** Mismo tope que el API para source y medium. */
const ORIGIN_TEXT_MAX = 40;
/** Sitios conocidos por su dominio: el resto se guarda con el dominio tal cual. */
const KNOWN_REFERRERS: { source: string; hosts: string[] }[] = [
    { source: "instagram", hosts: ["instagram.com"] },
    { source: "facebook", hosts: ["facebook.com", "fb.com", "messenger.com"] },
    { source: "whatsapp", hosts: ["whatsapp.com", "wa.me"] },
    { source: "google", hosts: ["google.com", "google.com.pa"] },
    { source: "pedidosya", hosts: ["pedidosya.com.pa", "pedidosya.com"] },
    { source: "tiktok", hosts: ["tiktok.com"] },
];
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
let fallbackOrigin: ITrafficOrigin | null = null;
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

const getOriginText = (value: string | null) => {
    const text = value?.trim().toLowerCase().slice(0, ORIGIN_TEXT_MAX);
    return text || undefined;
};

const getReferrerSource = (referrer: string) => {
    try {
        const host = new URL(referrer).hostname.replace(/^www\./, "");
        if (host === window.location.hostname.replace(/^www\./, "")) return undefined;
        const known = KNOWN_REFERRERS.find(({ hosts }) => hosts.some((entry) => host === entry || host.endsWith(`.${entry}`)));
        return known?.source ?? getOriginText(host);
    } catch {
        return undefined;
    }
};

/** El navegador dentro de Instagram o Facebook casi nunca manda referrer, pero se nombra en el user agent. */
const getInAppSource = (userAgent: string) => {
    if (/Instagram/i.test(userAgent)) return "instagram";
    if (/FBAN|FBAV/i.test(userAgent)) return "facebook";
    return undefined;
};

/** Primero el enlace con utm_source, luego el sitio anterior, luego la app; si no hay nada, "directo". */
const detectOrigin = (): ITrafficOrigin => {
    const params = new URLSearchParams(window.location.search);
    const utmSource = getOriginText(params.get("utm_source"));
    if (utmSource) return { source: utmSource, medium: getOriginText(params.get("utm_medium")) };

    const source = getReferrerSource(document.referrer) ?? getInAppSource(navigator.userAgent) ?? "directo";
    return { source };
};

/** El origen se decide al abrir la pestaña y no cambia al navegar dentro de la web. */
const getOrigin = () => {
    try {
        const stored = window.sessionStorage.getItem(ORIGIN_STORAGE_KEY);
        if (stored) return JSON.parse(stored) as ITrafficOrigin;
        const detected = detectOrigin();
        window.sessionStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify(detected));
        return detected;
    } catch {
        fallbackOrigin ??= detectOrigin();
        return fallbackOrigin;
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
    httpPostKeepalive("/events", { sessionId: getSessionId(), ...getOrigin(), events }).catch(() => undefined);
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

/**
 * Registra un clic del embudo. target es el id (producto, categoria) y label su nombre.
 * value es un monto, solo para los eventos que lo tienen (total de una cotizacion).
 */
export const trackEvent = (name: TrackEventName, target?: string, label?: string, value?: number) => {
    if (!isTrackingEnabled || typeof window === "undefined") return;
    const { pathname } = window.location;
    if (isStaffPath(pathname)) return;

    listenPageHide();
    // Se lee ya, con la URL de llegada: al navegar dentro de la web se pierde el ?utm_
    getOrigin();
    queue.push({ name, target: clip(target), label: clip(label), path: getTrackedPath(pathname), value });
    if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
    scheduleFlush();
};
