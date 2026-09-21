import { httpGet, httpPost } from "./getHttp";
import type { IPastaOptions } from "./pasta";

export interface IKitchenOrder {
    id: string;
    customerName: string;
    customerPhone: string;
    whatsappPhone: string | null;
    note: string | null;
    lines: { name: string; quantity: number; options?: IPastaOptions; modifiers?: { name: string; option: string }[] }[];
    // Solo el dia de pasta. mapUrl ya viene armado por el API (coordenadas o busqueda de la direccion)
    delivery: { address: string; details: string | null; lat: number | null; lng: number | null; mapUrl: string } | null;
    total: number;
    paidAt: string;
    acceptedAt: string | null;
    readyAt: string | null;
}

export type KitchenStep = "accept" | "ready" | "deliver";

// Minutos de preparacion a partir de los cuales el tiempo se muestra en rojo
export const KITCHEN_LATE_MINUTES = 15;

// La cocina vive dentro de /gestion: entra quien tenga rol caja, con su propio PIN
const getKitchenHeaders = (token: string) => ({ "x-gestion-token": token });

export const fetchKitchenOrders = (token: string, signal?: AbortSignal) =>
    httpGet<{ orders: IKitchenOrder[]; serverTime: string }>("/gestion/cocina/pedidos", { signal, headers: getKitchenHeaders(token) });

export const setKitchenStep = (token: string, orderId: string, step: KitchenStep) =>
    httpPost<{ order: IKitchenOrder }>(`/gestion/cocina/pedidos/${encodeURIComponent(orderId)}/${step}`, {}, { headers: getKitchenHeaders(token) });

/** Minutos enteros desde una fecha ISO. */
export const getMinutesSince = (value: string | null, now = Date.now()) =>
    value ? Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000)) : 0;
