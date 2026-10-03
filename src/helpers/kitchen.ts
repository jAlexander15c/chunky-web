import { httpGet, httpPost } from "./getHttp";
import type { IPastaOptions } from "./pasta";

export interface IKitchenOrder {
    id: string;
    customerName: string;
    // Las comandas de la caja (mesas y para llevar) llegan sin telefono
    customerPhone: string | null;
    whatsappPhone: string | null;
    // web: pedido desde la pagina (Yappy, tarjeta o WhatsApp) · mesa: enviado desde la caja de /gestion
    channel?: "web" | "mesa";
    // Opcionales mientras el API viejo siga en produccion
    paymentMethod?: "yappy" | "card" | "whatsapp";
    /** Un pedido de WhatsApp confirmado se prepara sin cobrar: se cobra al entregarlo. */
    isPaid?: boolean;
    /** Llegó por WhatsApp y nadie lo ha confirmado: se ve, pero no se prepara todavía. */
    isAwaitingConfirmation?: boolean;
    /** A cuántos km del local queda la casa (null sin punto). */
    distanceKm?: number | null;
    /** Efectivo: con cuánto dijo que paga, para llevar el vuelto. */
    cashTendered?: number | null;
    /** Lo recibe otra persona: caja la ubica al confirmar. */
    forSomeoneElse?: boolean;
    /** Delivery: cuando salio y quien lo lleva. */
    outAt?: string | null;
    courierName?: string | null;
    note: string | null;
    // note: lo que la caja anotó en ese plato ("sin cebolla")
    lines: {
        name: string;
        quantity: number;
        options?: IPastaOptions;
        modifiers?: { name: string; option: string }[];
        note?: string;
        // "Ver receta": opcionales mientras el API viejo siga en produccion
        variantId?: string;
        modifierOptionIds?: string[];
        hasRecipe?: boolean;
    }[];
    // mapUrl ya viene armado por el API (coordenadas o busqueda de la direccion)
    delivery: { address: string; details: string | null; lat: number | null; lng: number | null; mapUrl: string } | null;
    total: number;
    paidAt: string;
    acceptedAt: string | null;
    readyAt: string | null;
}

/** Se cobra al entregarlo (pedido de WhatsApp): la cocina no lo cierra, lo cierra Delivery. */
export const isUnpaidOrder = (order: Pick<IKitchenOrder, "isPaid">) => order.isPaid === false;

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
