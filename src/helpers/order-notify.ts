import { httpGet, httpPost } from "./getHttp";
import { getExistingPushSubscription, getPushSubscription } from "./push";

const ORDER_PUSH_STORAGE_PREFIX = "chunky-order-push:";

const readFlag = (orderId: string) => {
    try {
        return window.localStorage.getItem(`${ORDER_PUSH_STORAGE_PREFIX}${orderId}`) === "on";
    } catch {
        return false;
    }
};

const writeFlag = (orderId: string, isOn: boolean) => {
    try {
        if (isOn) window.localStorage.setItem(`${ORDER_PUSH_STORAGE_PREFIX}${orderId}`, "on");
        else window.localStorage.removeItem(`${ORDER_PUSH_STORAGE_PREFIX}${orderId}`);
    } catch {
        return;
    }
};

/** Avisos activos para este pedido en este navegador (se recuerda al recargar). */
export const isOrderPushEnabled = (orderId: string) =>
    readFlag(orderId) && "Notification" in window && Notification.permission === "granted";

/**
 * Activa los avisos de "aceptado" y "listo" para este pedido.
 * Debe llamarse dentro de un toque. Devuelve el permiso resultante.
 */
export const enableOrderPush = async (orderId: string): Promise<"granted" | "denied" | "error"> => {
    try {
        const { publicKey } = await httpGet<{ publicKey: string | null }>("/orders/push/public-key");
        if (!publicKey) return "error";

        const subscription = await getPushSubscription(publicKey);
        if (!subscription) return Notification.permission === "denied" ? "denied" : "error";

        await httpPost(`/orders/${encodeURIComponent(orderId)}/push/subscribe`, subscription.toJSON());
        writeFlag(orderId, true);
        return "granted";
    } catch (error) {
        console.error("[pedido] no se pudieron activar los avisos:", error);
        return "error";
    }
};

/** Deja de avisar este pedido. La suscripcion del navegador se mantiene para otros pedidos. */
export const disableOrderPush = async (orderId: string) => {
    writeFlag(orderId, false);
    const subscription = await getExistingPushSubscription();
    if (!subscription) return;
    await httpPost(`/orders/${encodeURIComponent(orderId)}/push/unsubscribe`, { endpoint: subscription.endpoint }).catch(() => null);
};
