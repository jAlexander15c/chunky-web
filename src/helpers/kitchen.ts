import { httpGet, httpPost } from "./getHttp";

export interface IKitchenOrder {
    id: string;
    customerName: string;
    customerPhone: string;
    whatsappPhone: string | null;
    note: string | null;
    lines: { name: string; quantity: number }[];
    total: number;
    paidAt: string;
    acceptedAt: string | null;
    readyAt: string | null;
}

export type KitchenStep = "accept" | "ready" | "deliver";

const KITCHEN_TOKEN_STORAGE_KEY = "chunky-kitchen-token";

// Minutos de preparacion a partir de los cuales el tiempo se muestra en rojo
export const KITCHEN_LATE_MINUTES = 15;

const getKitchenHeaders = (token: string) => ({ "x-kitchen-token": token });

export const getKitchenToken = () => {
    try {
        return window.localStorage.getItem(KITCHEN_TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
};

export const setKitchenToken = (token: string | null) => {
    try {
        if (token) window.localStorage.setItem(KITCHEN_TOKEN_STORAGE_KEY, token);
        else window.localStorage.removeItem(KITCHEN_TOKEN_STORAGE_KEY);
    } catch {
        return;
    }
};

export const loginKitchen = (pin: string) => httpPost<{ token: string }>("/kitchen/login", { pin });

export const fetchKitchenOrders = (token: string, signal?: AbortSignal) =>
    httpGet<{ orders: IKitchenOrder[]; serverTime: string }>("/kitchen/orders", { signal, headers: getKitchenHeaders(token) });

export const setKitchenStep = (token: string, orderId: string, step: KitchenStep) =>
    httpPost<{ order: IKitchenOrder }>(`/kitchen/orders/${encodeURIComponent(orderId)}/${step}`, {}, { headers: getKitchenHeaders(token) });

/** Minutos enteros desde una fecha ISO. */
export const getMinutesSince = (value: string | null, now = Date.now()) =>
    value ? Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000)) : 0;

/* ============ Sonido ============ */

let audioContext: AudioContext | null = null;

/** Crea o reanuda el audio. En iOS solo funciona dentro de un toque del usuario. */
export const unlockKitchenSound = async () => {
    try {
        audioContext ??= new AudioContext();
        if (audioContext.state !== "running") await audioContext.resume();
        return audioContext.state === "running";
    } catch {
        return false;
    }
};

export const isKitchenSoundOn = () => audioContext?.state === "running";

/** Campanita de tres notas generada con WebAudio (no necesita archivos de audio). */
export const playKitchenChime = () => {
    if (!audioContext || audioContext.state !== "running") return false;

    const start = audioContext.currentTime;
    [880, 1175, 1568].forEach((frequency, index) => {
        const oscillator = audioContext!.createOscillator();
        const gain = audioContext!.createGain();
        const noteStart = start + index * 0.18;

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.5, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.45);
        oscillator.connect(gain).connect(audioContext!.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.5);
    });
    return true;
};

/* ============ Notificaciones push ============ */

/** iOS solo permite push a la web agregada a la pantalla de inicio. */
export const isStandaloneApp = () =>
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isPushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const getApplicationServerKey = (base64: string) => {
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

/**
 * Registra el service worker y suscribe este dispositivo a los avisos de cocina.
 * Debe llamarse dentro de un toque (iOS pide el permiso solo asi). Devuelve si quedo activo.
 */
export const enableKitchenPush = async (token: string) => {
    if (!isPushSupported()) return false;

    try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return false;

        const { publicKey } = await httpGet<{ publicKey: string | null }>("/kitchen/push/public-key", { headers: getKitchenHeaders(token) });
        if (!publicKey) return false;

        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription()
            ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: getApplicationServerKey(publicKey) });

        await httpPost("/kitchen/push/subscribe", subscription.toJSON(), { headers: getKitchenHeaders(token) });
        return true;
    } catch (error) {
        console.error("[cocina] no se pudieron activar las notificaciones:", error);
        return false;
    }
};

/** Al cerrar sesion este dispositivo deja de recibir avisos. */
export const disableKitchenPush = async (token: string) => {
    try {
        const registration = await navigator.serviceWorker?.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) return;
        await httpPost("/kitchen/push/unsubscribe", { endpoint: subscription.endpoint }, { headers: getKitchenHeaders(token) }).catch(() => null);
        await subscription.unsubscribe();
    } catch {
        return;
    }
};

export const hasKitchenPushSubscription = async () => {
    try {
        if (!isPushSupported() || Notification.permission !== "granted") return false;
        const registration = await navigator.serviceWorker.getRegistration("/");
        return Boolean(await registration?.pushManager.getSubscription());
    } catch {
        return false;
    }
};
