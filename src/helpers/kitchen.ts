import { httpGet, httpPost } from "./getHttp";
import type { IPastaOptions } from "./pasta";
import { getExistingPushSubscription, getPushSubscription } from "./push";

export interface IKitchenOrder {
    id: string;
    customerName: string;
    customerPhone: string;
    whatsappPhone: string | null;
    note: string | null;
    lines: { name: string; quantity: number; options?: IPastaOptions }[];
    // Solo el dia de pasta. mapUrl ya viene armado por el API (coordenadas o busqueda de la direccion)
    delivery: { address: string; details: string | null; lat: number | null; lng: number | null; mapUrl: string } | null;
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

/* ============ Notificaciones push ============ */

/**
 * Suscribe este dispositivo a los avisos de cocina.
 * Debe llamarse dentro de un toque (iOS pide el permiso solo asi). Devuelve si quedo activo.
 */
export const enableKitchenPush = async (token: string) => {
    try {
        const { publicKey } = await httpGet<{ publicKey: string | null }>("/kitchen/push/public-key", { headers: getKitchenHeaders(token) });
        if (!publicKey) return false;

        const subscription = await getPushSubscription(publicKey);
        if (!subscription) return false;

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
        const subscription = await getExistingPushSubscription();
        if (!subscription) return;
        await httpPost("/kitchen/push/unsubscribe", { endpoint: subscription.endpoint }, { headers: getKitchenHeaders(token) }).catch(() => null);
        await subscription.unsubscribe();
    } catch {
        return;
    }
};

export const hasKitchenPushSubscription = async () => Boolean(await getExistingPushSubscription());
