import { httpGet, httpPost } from "./getHttp";
import { formatCartLine, formatPrice, getCartTotal } from "./order";
import type { ICartLine } from "./order";
import type { IPastaOptions } from "./pasta";
import { PRIVACY_NOTICE_VERSION } from "./privacy";

export type OrderStatus =
    | "PENDING_PAYMENT"
    | "PAID"
    | "IN_PREPARATION"
    | "READY"
    | "DELIVERED"
    | "REJECTED"
    | "CANCELLED"
    | "EXPIRED"
    | "FAILED";

export interface IPublicOrder {
    id: string;
    status: OrderStatus;
    /** Solo el nombre de pila. */
    customerName: string;
    lines: {
        name: string;
        quantity: number;
        /** Precio por unidad, con sus modificadores ya incluidos. */
        price: number;
        options?: IPastaOptions;
        modifiers?: { name: string; option: string; price: number }[];
    }[];
    // Solo el dia de pasta: la direccion escrita por el cliente (sin coordenadas)
    delivery: { address: string; details: string | null } | null;
    total: number;
    yappyConfirmation: string | null;
    // Los marca la cocina en /gestion
    acceptedAt: string | null;
    readyAt: string | null;
    createdAt: string;
    paidAt: string | null;
}

export interface IYappyPaymentSession {
    orderId: string;
    /** Llave para consultar el pedido: sin ella, conocer el id no basta. */
    accessToken: string;
    transactionId: string;
    token: string;
    documentName: string;
}

export type Fulfillment = "pickup" | "delivery";

export interface ICheckoutForm {
    customerName: string;
    customerPhone: string;
    hasOtherWhatsapp: boolean;
    whatsappPhone: string;
    note: string;
    /** Retiro o delivery; solo se elige con el modo delivery (el dia de pasta siempre es delivery). */
    fulfillment: Fulfillment;
    // Entrega a domicilio; lat y lng vienen juntos o ninguno
    deliveryAddress: string;
    deliveryDetails: string;
    deliveryLat: number | null;
    deliveryLng: number | null;
    /** Marcó la casilla del aviso de privacidad (Ley 81) en este pedido. Siempre obligatoria. */
    privacyConsent: boolean;
}

export type CheckoutErrors = Partial<
    Record<"customerName" | "customerPhone" | "whatsappPhone" | "deliveryAddress" | "privacyConsent", string>
>;

/**
 * Borrador del checkout en sessionStorage, para no perderlo al recargar. Solo nombre, celulares y
 * forma de entrega: la dirección, las referencias, la ubicación, la nota y la casilla no se guardan.
 */
const CHECKOUT_DRAFT_STORAGE_KEY = "chunky-checkout";

type CheckoutDraft = Pick<ICheckoutForm, "customerName" | "customerPhone" | "hasOtherWhatsapp" | "whatsappPhone" | "fulfillment">;

export const readCheckoutDraft = (): Partial<CheckoutDraft> => {
    try {
        const stored = JSON.parse(window.sessionStorage.getItem(CHECKOUT_DRAFT_STORAGE_KEY) ?? "{}");
        if (!stored || typeof stored !== "object") return {};
        const { customerName, customerPhone, hasOtherWhatsapp, whatsappPhone, fulfillment } = stored;
        return {
            ...(typeof customerName === "string" ? { customerName } : {}),
            ...(typeof customerPhone === "string" ? { customerPhone } : {}),
            ...(typeof hasOtherWhatsapp === "boolean" ? { hasOtherWhatsapp } : {}),
            ...(typeof whatsappPhone === "string" ? { whatsappPhone } : {}),
            ...(fulfillment === "pickup" || fulfillment === "delivery" ? { fulfillment } : {}),
        };
    } catch {
        return {};
    }
};

export const saveCheckoutDraft = (form: ICheckoutForm) => {
    const draft: CheckoutDraft = {
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        hasOtherWhatsapp: form.hasOtherWhatsapp,
        whatsappPhone: form.whatsappPhone,
        fulfillment: form.fulfillment,
    };
    try {
        window.sessionStorage.setItem(CHECKOUT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
        return;
    }
};

/** Al confirmarse el pago: el pedido ya salió y el borrador no hace falta. */
export const clearCheckoutDraft = () => {
    try {
        window.sessionStorage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
    } catch {
        return;
    }
};

const MIN_ADDRESS_LENGTH = 5;

/** Enlace de Google Maps al punto que guardo el celular del cliente. */
export const getMapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

// Produccion por defecto; para pruebas: https://bt-cdn-uat.yappycloud.com/v1/cdn/web-component-btn-yappy.js
export const YAPPY_BUTTON_SCRIPT_URL = (import.meta.env.VITE_YAPPY_CDN_URL
    || "https://bt-cdn.yappy.cloud/v1/cdn/web-component-btn-yappy.js") as string;

const LAST_ORDER_STORAGE_KEY = "chunky-last-order";

export const FAILED_ORDER_STATUSES: OrderStatus[] = ["REJECTED", "CANCELLED", "EXPIRED", "FAILED"];
export const PAID_ORDER_STATUSES: OrderStatus[] = ["PAID", "IN_PREPARATION", "READY", "DELIVERED"];

/** Solo digitos: "6123-4567" -> "61234567". */
export const getPhoneDigits = (value: string) => value.replace(/\D/g, "").slice(0, 8);

/** "61234567" -> "6123-4567" para mostrar. */
export const formatPhone = (value: string) => {
    const digits = getPhoneDigits(value);
    return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
};

const isPanamaMobile = (value: string) => /^6\d{7}$/.test(getPhoneDigits(value));

export const getCheckoutErrors = (form: ICheckoutForm, requiresDelivery = false): CheckoutErrors => {
    const errors: CheckoutErrors = {};
    if (requiresDelivery && form.deliveryAddress.trim().length < MIN_ADDRESS_LENGTH) {
        errors.deliveryAddress = "Escribe la dirección donde te llevamos el pedido.";
    }
    if (form.customerName.trim().length < 2) errors.customerName = "Escribe tu nombre para saber de quién es el pedido.";
    if (!isPanamaMobile(form.customerPhone)) errors.customerPhone = "Escribe un celular de 8 dígitos que empiece en 6.";
    if (form.hasOtherWhatsapp && !isPanamaMobile(form.whatsappPhone)) {
        errors.whatsappPhone = "Escribe un WhatsApp de 8 dígitos que empiece en 6.";
    }
    if (!form.privacyConsent) {
        errors.privacyConsent = "Para pedir, acepta el aviso de privacidad.";
    }
    return errors;
};

export const createOrder = (lines: ICartLine[], form: ICheckoutForm, requiresDelivery = false) =>
    httpPost<IYappyPaymentSession>("/orders", {
        lines: lines.map((line) => ({
            variantId: line.item.variants[0].variant_id,
            quantity: line.quantity,
            options: line.options,
            modifierOptionIds: line.modifiers?.map((modifier) => modifier.modifierOptionId),
        })),
        delivery: requiresDelivery ? getDeliveryPayload(form) : undefined,
        customerName: form.customerName.trim(),
        customerPhone: getPhoneDigits(form.customerPhone),
        whatsappPhone: form.hasOtherWhatsapp ? getPhoneDigits(form.whatsappPhone) : undefined,
        note: form.note.trim() || undefined,
        privacyConsent: form.privacyConsent,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    });

const getDeliveryPayload = (form: ICheckoutForm) => ({
    address: form.deliveryAddress.trim(),
    details: form.deliveryDetails.trim() || undefined,
    lat: form.deliveryLat ?? undefined,
    lng: form.deliveryLng ?? undefined,
});

/** Direccion y referencias en texto, para el mensaje de WhatsApp. Vacio si no hay entrega. */
export const getDeliveryText = (form: Partial<Pick<ICheckoutForm, "deliveryAddress" | "deliveryDetails" | "deliveryLat" | "deliveryLng">>) => {
    const address = form.deliveryAddress?.trim();
    if (!address) return "";

    const details = form.deliveryDetails?.trim() ? `\nReferencias: ${form.deliveryDetails.trim()}` : "";
    const map = form.deliveryLat != null && form.deliveryLng != null ? `\nUbicación: ${getMapsUrl(form.deliveryLat, form.deliveryLng)}` : "";
    return `Entrega en: ${address}${details}${map}`;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Lo mismo que el API deja consultar un pedido. */
const ORDER_ACCESS_MS = 7 * DAY_MS;
const MAX_STORED_ORDERS = 5;
const ORDER_ACCESS_STORAGE_KEY = "chunky-order-access";

type OrderAccess = Record<string, { token: string; expiresAt: number }>;

/** Tokens de los pedidos hechos en este navegador, sin los vencidos. */
const readOrderAccess = (): OrderAccess => {
    try {
        const stored = JSON.parse(window.localStorage.getItem(ORDER_ACCESS_STORAGE_KEY) ?? "{}");
        if (!stored || typeof stored !== "object") return {};
        const now = Date.now();
        return Object.fromEntries(
            Object.entries(stored).filter(
                (entry): entry is [string, { token: string; expiresAt: number }] => {
                    const value = entry[1] as { token?: unknown; expiresAt?: unknown } | null;
                    return typeof value?.token === "string" && typeof value.expiresAt === "number" && value.expiresAt > now;
                }
            )
        );
    } catch {
        return {};
    }
};

/** Guarda la llave del pedido: con ella esta página y sus avisos pueden consultarlo por 7 días. */
export const rememberOrderAccess = (orderId: string, token: string) => {
    const recent = Object.entries(readOrderAccess())
        .filter(([id]) => id !== orderId)
        .sort(([, a], [, b]) => b.expiresAt - a.expiresAt)
        .slice(0, MAX_STORED_ORDERS - 1);
    try {
        window.localStorage.setItem(
            ORDER_ACCESS_STORAGE_KEY,
            JSON.stringify(Object.fromEntries([[orderId, { token, expiresAt: Date.now() + ORDER_ACCESS_MS }], ...recent]))
        );
    } catch {
        return;
    }
};

/** Header con la llave del pedido, o nada si este navegador no lo hizo. */
export const getOrderAccessHeaders = (orderId: string): Record<string, string> => {
    const access = readOrderAccess()[orderId];
    return access ? { "x-order-token": access.token } : {};
};

export const fetchOrder = (orderId: string, signal?: AbortSignal) =>
    httpGet<IPublicOrder>(`/orders/${encodeURIComponent(orderId)}`, { signal, headers: getOrderAccessHeaders(orderId) });

/** El último pedido solo sirve para vaciar el carrito al confirmarse el pago: vence en un día. */
const LAST_ORDER_MS = DAY_MS;

/** Ultimo pedido iniciado en este navegador, para recuperarlo si se recarga la pagina. */
export const getLastOrderId = () => {
    try {
        const stored = JSON.parse(window.localStorage.getItem(LAST_ORDER_STORAGE_KEY) ?? "null");
        return typeof stored?.id === "string" && typeof stored.expiresAt === "number" && stored.expiresAt > Date.now()
            ? (stored.id as string)
            : null;
    } catch {
        return null;
    }
};

export const setLastOrderId = (orderId: string | null) => {
    try {
        if (orderId) {
            window.localStorage.setItem(LAST_ORDER_STORAGE_KEY, JSON.stringify({ id: orderId, expiresAt: Date.now() + LAST_ORDER_MS }));
        } else {
            window.localStorage.removeItem(LAST_ORDER_STORAGE_KEY);
        }
    } catch {
        return;
    }
};

/** Mensaje de WhatsApp cuando el cliente tuvo un problema pagando con Yappy. */
export const buildPaymentHelpMessage = (
    lines: ICartLine[],
    form: Pick<ICheckoutForm, "customerName" | "note"> & Partial<Pick<ICheckoutForm, "deliveryAddress" | "deliveryDetails" | "deliveryLat" | "deliveryLng">>,
    orderId?: string | null
) => {
    const detail = lines.map(formatCartLine).join("\n");
    const delivery = getDeliveryText(form);
    const who = form.customerName.trim() ? `Soy ${form.customerName.trim()}. ` : "";
    const reference = orderId ? ` (pedido ${orderId})` : "";
    const note = form.note.trim() ? `\n\nNota: ${form.note.trim()}` : "";
    const address = delivery ? `\n\n${delivery}` : "";
    return `¡Hola! ${who}Tuve un problema pagando con Yappy en la web${reference}. Mi pedido es:\n\n${detail}\n\nTotal: ${formatPrice(getCartTotal(lines))}${address}${note}`;
};

/** Texto del motivo cuando el pago no se completo. */
export const getFailedOrderReason = (status: OrderStatus) => {
    switch (status) {
        case "CANCELLED":
            return "Cancelaste el pago en la app de Yappy.";
        case "REJECTED":
            return "No aprobaste el pago en los 5 minutos que dura la solicitud.";
        case "EXPIRED":
            return "La solicitud de pago venció antes de aprobarla.";
        default:
            return "No pudimos iniciar el pago con Yappy.";
    }
};
