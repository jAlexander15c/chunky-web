/* Notificaciones push del navegador (cocina y clientes), con el service worker /sw.js. */

/** Web agregada a la pantalla de inicio. En iOS es la unica forma de recibir push. */
export const isStandaloneApp = () =>
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isAppleMobile = () =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isPushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Push utilizable aqui: en iPhone/iPad solo si la web se abrio desde la pantalla de inicio. */
export const canUsePush = () => isPushSupported() && (!isAppleMobile() || isStandaloneApp());

export const getNotificationPermission = (): NotificationPermission | "unsupported" =>
    "Notification" in window ? Notification.permission : "unsupported";

const getApplicationServerKey = (base64: string) => {
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

/**
 * Pide permiso, registra /sw.js y devuelve la suscripcion de este navegador (la crea si no existe).
 * Debe llamarse dentro de un toque. Devuelve null si no hay permiso o soporte.
 */
export const getPushSubscription = async (publicKey: string) => {
    if (!isPushSupported()) return null;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: getApplicationServerKey(publicKey) });
};

/** Suscripcion existente sin pedir permiso (null si no hay). */
export const getExistingPushSubscription = async () => {
    try {
        if (!isPushSupported() || Notification.permission !== "granted") return null;
        const registration = await navigator.serviceWorker.getRegistration("/");
        return (await registration?.pushManager.getSubscription()) ?? null;
    } catch {
        return null;
    }
};
