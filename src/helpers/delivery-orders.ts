import { httpGet, httpPost } from "./getHttp";
import type { IKitchenOrder } from "./kitchen";
import type { CollectedMethod, ICourierPosition, OrderStatus } from "./payment";

/** Un pedido en la pestaña Delivery de /gestion: lo de cocina más lo de quien coordina y lo lleva. */
export interface IDeliveryOrder extends IKitchenOrder {
    /** El estado que ve el cliente (por confirmar, listo, en camino…). */
    status: OrderStatus;
    createdAt: string;
    confirmedAt: string | null;
    confirmedByName: string | null;
    courierId: number | null;
    courierPosition: ICourierPosition | null;
    collectedMethod: CollectedMethod | null;
    /** Efectivo: con cuánto pagó al entregar. */
    cashReceived?: number | null;
    /** Cuando el repartidor llegó cerca de la casa. */
    nearAt?: string | null;
    /** /pedido/:id?t=…: se arma la URL con el dominio de la web. */
    trackingPath: string;
    trackingSharedAt: string | null;
}

export interface IDeliveryInput {
    address: string;
    details?: string | null;
    lat?: number | null;
    lng?: number | null;
}

/** En qué va el pedido, para agruparlo en la pestaña. */
export type DeliveryStage = "por-confirmar" | "en-cocina" | "listo-salir" | "listo-retirar" | "en-camino";

export const getDeliveryStage = (order: IDeliveryOrder): DeliveryStage => {
    if (order.status === "PENDING_CONFIRMATION") return "por-confirmar";
    if (order.outAt) return "en-camino";
    if (order.readyAt) return order.delivery ? "listo-salir" : "listo-retirar";
    return "en-cocina";
};

const getHeaders = (token: string) => ({ "x-gestion-token": token });
const orderPath = (orderId: string, action: string) => `/gestion/delivery/pedidos/${encodeURIComponent(orderId)}/${action}`;

export const fetchDeliveryOrders = (token: string, signal?: AbortSignal) =>
    httpGet<{ orders: IDeliveryOrder[]; serverTime: string }>("/gestion/delivery/pedidos", { signal, headers: getHeaders(token) });

/** El punto de lo que mandó el cliente: un enlace de Google Maps o coordenadas. */
export const resolveLocationLink = (token: string, text: string) =>
    httpPost<{ lat: number; lng: number }>("/gestion/delivery/ubicacion", { text }, { headers: getHeaders(token) });

/** Lo que caja revisa: dónde se entrega y con cuánto paga. Sin el campo queda como estaba; null lo borra. */
export interface IDeliveryChange {
    delivery?: IDeliveryInput | null;
    cashTendered?: number | null;
}

export const confirmDeliveryOrder = (token: string, orderId: string, change: IDeliveryChange = {}) =>
    httpPost<{ order: IDeliveryOrder }>(orderPath(orderId, "confirmar"), change, { headers: getHeaders(token) });

export const changeOrderDelivery = (token: string, orderId: string, change: IDeliveryChange) =>
    httpPost<{ order: IDeliveryOrder }>(orderPath(orderId, "entrega"), change, { headers: getHeaders(token) });

export const cancelDeliveryOrder = (token: string, orderId: string) =>
    httpPost<{ order: IDeliveryOrder }>(orderPath(orderId, "cancelar"), {}, { headers: getHeaders(token) });

export const shareTrackingLink = (token: string, orderId: string) =>
    httpPost<{ trackingPath: string }>(orderPath(orderId, "enlace"), {}, { headers: getHeaders(token) });

export const takeDeliveryOrder = (token: string, orderId: string) =>
    httpPost<{ order: IDeliveryOrder }>(orderPath(orderId, "tomar"), {}, { headers: getHeaders(token) });

export const releaseDeliveryOrder = (token: string, orderId: string) =>
    httpPost<{ order: IDeliveryOrder }>(orderPath(orderId, "soltar"), {}, { headers: getHeaders(token) });

export const sendCourierPosition = (token: string, orderId: string, position: { lat: number; lng: number; accuracy: number | null }) =>
    httpPost<void>(orderPath(orderId, "posicion"), position, { headers: getHeaders(token) });

/**
 * El medio solo hace falta si el pedido es de WhatsApp y todavía no se cobró. En efectivo va con
 * cuánto pagó, como en caja.
 */
export const deliverOrder = (token: string, orderId: string, payment: { method?: CollectedMethod; cashReceived?: number | null } = {}) =>
    httpPost<{ order: IDeliveryOrder }>(
        orderPath(orderId, "entregar"),
        { method: payment.method, cashReceived: payment.cashReceived ?? undefined },
        { headers: getHeaders(token) }
    );

/** El vuelto que tiene que llevar el repartidor, o 0 si no dijo con cuánto paga. */
export const getChangeToCarry = (order: Pick<IDeliveryOrder, "cashTendered" | "total">) =>
    order.cashTendered && order.cashTendered > order.total + 0.005 ? Math.round((order.cashTendered - order.total) * 100) / 100 : 0;

/** Enlace completo de seguimiento, con el dominio donde está abierta la web. */
export const getTrackingUrl = (order: Pick<IDeliveryOrder, "trackingPath">) => `${window.location.origin}${order.trackingPath}`;

/** WhatsApp del cliente con el mensaje ya escrito. */
export const getCustomerWhatsAppUrl = (phone: string, message?: string) =>
    `https://wa.me/507${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;

/** Mensaje para mandarle el enlace de seguimiento al cliente. */
export const buildTrackingMessage = (order: Pick<IDeliveryOrder, "customerName" | "id" | "trackingPath" | "delivery">) => {
    const firstName = order.customerName.trim().split(/\s+/)[0] ?? "";
    const follow = order.delivery ? "Aquí puedes seguirlo, y cuando salga verás al repartidor en el mapa" : "Aquí puedes ver cómo va";
    return `¡Hola${firstName ? `, ${firstName}` : ""}! Confirmamos tu pedido ${order.id} en Chunky Bites. ${follow}: ${getTrackingUrl(order)}`;
};
