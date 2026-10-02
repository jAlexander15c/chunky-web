import { httpGet, httpPost } from "./getHttp";
import { formatCartLine, formatPrice, getCartTotal, getWhatsAppUrl } from "./order";
import type { ICartLine } from "./order";
import type { IPastaOptions } from "./pasta";
import { PRIVACY_NOTICE_VERSION } from "./privacy";

export type OrderStatus =
    | "PENDING_PAYMENT"
    // Por WhatsApp: guardado, falta confirmarlo con el cliente · confirmado, se cobra al entregar
    | "PENDING_CONFIRMATION"
    | "CONFIRMED"
    | "PAID"
    | "IN_PREPARATION"
    | "READY"
    | "ON_THE_WAY"
    | "DELIVERED"
    | "REJECTED"
    | "CANCELLED"
    | "EXPIRED"
    | "FAILED";

/**
 * Como paga el cliente de la web: Yappy en la página, tarjeta en la página de PagueloFacil, o lo
 * coordina por WhatsApp y paga al recibir.
 */
export type OrderPaymentMethod = "yappy" | "card" | "whatsapp";

/** Lo mínimo que cobra PagueloFacil con tarjeta (el API exige lo mismo). */
export const CARD_MIN_TOTAL = 1;

/** Con qué se cobró al entregar un pedido de WhatsApp. */
export type CollectedMethod = "efectivo" | "tarjeta" | "yappy";

export const COLLECTED_LABEL: Record<CollectedMethod, string> = {
    efectivo: "efectivo",
    tarjeta: "tarjeta",
    yappy: "Yappy",
};

export interface ICourierPosition {
    lat: number;
    lng: number;
    /** Metros de margen que reporta el teléfono del repartidor. */
    accuracy: number | null;
    at: string;
}

export interface IPublicOrder {
    id: string;
    status: OrderStatus;
    // Opcionales mientras el API viejo siga en producción
    paymentMethod?: OrderPaymentMethod;
    collectedMethod?: CollectedMethod | null;
    confirmedAt?: string | null;
    outAt?: string | null;
    deliveredAt?: string | null;
    /** Solo en camino: quién lo lleva (nombre de pila) y su última posición. */
    courier?: { name: string; position: ICourierPosition | null } | null;
    /** Cuando el repartidor llegó a menos de 300 m de la casa. */
    nearAt?: string | null;
    /** El local, para pintarlo en el mapa (solo en camino). */
    storeLocation?: { lat: number; lng: number } | null;
    /** Efectivo: con cuánto dijo que paga y con cuánto pagó al recibir. */
    cashTendered?: number | null;
    cashReceived?: number | null;
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
    // La dirección escrita; el punto exacto (lat/lng) solo llega mientras va en camino, para el mapa
    delivery: { address: string; details: string | null; lat?: number | null; lng?: number | null } | null;
    total: number;
    yappyConfirmation: string | null;
    // Los marca la cocina en /gestion
    acceptedAt: string | null;
    readyAt: string | null;
    createdAt: string;
    paidAt: string | null;
}

/** Pedido guardado para coordinar por WhatsApp: no hay pago en la página. */
export interface IWhatsappOrderSession {
    orderId: string;
    accessToken: string;
    paymentMethod: "whatsapp";
}

/** Pedido guardado para pagar con tarjeta: el cliente va al enlace de PagueloFacil y vuelve a /pedido. */
export interface ICardPaymentSession {
    orderId: string;
    accessToken: string;
    paymentMethod: "card";
    /** Enlace de un solo uso que vence a los 15 minutos. */
    paymentUrl: string;
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
    /**
     * A domicilio para otra persona: no se pide la ubicación de quien pide (puede estar lejos);
     * deliveryLat/deliveryLng son el pin que marca en el mapa donde recibe.
     */
    isForSomeoneElse: boolean;
    /** Marcó la casilla del aviso de privacidad (Ley 81) en este pedido. Siempre obligatoria. */
    privacyConsent: boolean;
}

export type CheckoutErrors = Partial<
    Record<"customerName" | "customerPhone" | "whatsappPhone" | "deliveryAddress" | "deliveryLocation" | "privacyConsent", string>
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
/** El pedido ya salió: pagado con Yappy, o guardado para coordinar por WhatsApp. El carrito se vacía. */
export const PLACED_ORDER_STATUSES: OrderStatus[] = [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "PAID",
    "IN_PREPARATION",
    "READY",
    "ON_THE_WAY",
    "DELIVERED",
];

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
    // Sin el punto no se sabe si llegamos (el API exige lo mismo): el de quien pide o el pin de quien recibe
    if (requiresDelivery && (form.deliveryLat === null || form.deliveryLng === null)) {
        errors.deliveryLocation = form.isForSomeoneElse
            ? "Marca en el mapa dónde recibe para saber si llegamos."
            : "Toca «Usar mi ubicación» para saber si llegamos. Si es para otra persona, márcalo.";
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

/** Clave de un intento de pago: si la petición se repite (doble toque, red que falla), el API no crea otro pedido. */
export const createIdempotencyKey = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}-${Math.random().toString(36).slice(2, 14)}`;

const getOrderBody = (lines: ICartLine[], form: ICheckoutForm, requiresDelivery: boolean) => ({
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
        forSomeoneElse: requiresDelivery && form.isForSomeoneElse ? true : undefined,
});

const getIdempotencyOptions = (idempotencyKey?: string) =>
    idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined;

export const createOrder = (lines: ICartLine[], form: ICheckoutForm, requiresDelivery = false, idempotencyKey?: string) =>
    httpPost<IYappyPaymentSession>("/orders", getOrderBody(lines, form, requiresDelivery), getIdempotencyOptions(idempotencyKey));

/** Guarda el pedido y pide el enlace de PagueloFacil para pagarlo con tarjeta. */
export const createCardOrder = (lines: ICartLine[], form: ICheckoutForm, requiresDelivery = false, idempotencyKey?: string) =>
    httpPost<ICardPaymentSession>(
        "/orders",
        { ...getOrderBody(lines, form, requiresDelivery), paymentMethod: "card" },
        getIdempotencyOptions(idempotencyKey)
    );

/** Guarda el pedido sin cobrar: se confirma por WhatsApp y se paga al recibirlo. */
export const createWhatsappOrder = (
    lines: ICartLine[],
    form: ICheckoutForm,
    requiresDelivery = false,
    idempotencyKey?: string,
    cashTendered?: number | null
) =>
    httpPost<IWhatsappOrderSession>(
        "/orders",
        { ...getOrderBody(lines, form, requiresDelivery), paymentMethod: "whatsapp", cashTendered: cashTendered ?? undefined },
        getIdempotencyOptions(idempotencyKey)
    );

/** "20", "20.5", "$20,50" → 20.5. Null si no es un monto. */
export const parseMoney = (value: string) => {
    const cleaned = value.replace(/[$\s]/g, "").replace(",", ".");
    if (!cleaned) return null;
    const amount = Number(cleaned);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
};

/** Billetes con los que se suele pagar: el total justo y los que alcanzan. */
export const getCashSuggestions = (total: number) =>
    [total, ...[5, 10, 20, 50, 100].filter((bill) => bill > total + 0.005)].slice(0, 4);

// El punto de entrega: la ubicación de quien pide, o el pin de quien recibe si es para otra persona
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

/** Mensaje de WhatsApp cuando el cliente tuvo un problema pagando con Yappy o con tarjeta. */
export const buildPaymentHelpMessage = (
    lines: ICartLine[],
    form: Pick<ICheckoutForm, "customerName" | "note"> & Partial<Pick<ICheckoutForm, "deliveryAddress" | "deliveryDetails" | "deliveryLat" | "deliveryLng">>,
    orderId?: string | null,
    paymentMethod: OrderPaymentMethod = "yappy"
) => {
    const detail = lines.map(formatCartLine).join("\n");
    const delivery = getDeliveryText(form);
    const who = form.customerName.trim() ? `Soy ${form.customerName.trim()}. ` : "";
    const reference = orderId ? ` (pedido ${orderId})` : "";
    const note = form.note.trim() ? `\n\nNota: ${form.note.trim()}` : "";
    const address = delivery ? `\n\n${delivery}` : "";
    return `¡Hola! ${who}Tuve un problema pagando con ${paymentMethod === "card" ? "tarjeta" : "Yappy"} en la web${reference}. Mi pedido es:\n\n${detail}\n\nTotal: ${formatPrice(getCartTotal(lines))}${address}${note}`;
};

/** Mensaje que abre WhatsApp al guardar un pedido para coordinar: el código, lo pedido y la entrega. */
export const buildWhatsappOrderMessage = (
    lines: ICartLine[],
    form: Pick<ICheckoutForm, "customerName" | "note"> &
        Partial<Pick<ICheckoutForm, "deliveryAddress" | "deliveryDetails" | "deliveryLat" | "deliveryLng" | "isForSomeoneElse">>,
    orderId: string,
    orderUrl: string,
    cashTendered?: number | null
) => {
    const detail = lines.map(formatCartLine).join("\n");
    // Para otra persona la ubicación es el pin que marcó donde recibe
    const forOther = Boolean(form.isForSomeoneElse && form.deliveryAddress?.trim());
    const delivery = getDeliveryText(form);
    const who = form.customerName.trim() ? `Soy ${form.customerName.trim()}. ` : "";
    const note = form.note.trim() ? `\n\nNota: ${form.note.trim()}` : "";
    const fulfillment = delivery
        ? `\n\n${delivery}${forOther ? "\nEs para otra persona." : ""}`
        : "\n\nPaso a retirarlo.";
    const cash = cashTendered ? `\nPago en efectivo con ${formatPrice(cashTendered)}` : "";
    return `¡Hola! ${who}Quiero coordinar mi pedido ${orderId}:\n\n${detail}\n\nTotal: ${formatPrice(getCartTotal(lines))}${cash}${fulfillment}${note}\n\nVer pedido: ${orderUrl}`;
};

/** Para volver a abrir el chat desde /pedido: el código y lo pedido, sin la dirección. */
export const getWhatsappOrderChatUrl = (order: IPublicOrder) => {
    const detail = order.lines.map((line) => `- ${line.name} x${line.quantity}`).join("\n");
    return getWhatsAppUrl(
        `¡Hola! Soy ${order.customerName}. Quiero coordinar mi pedido ${order.id}:\n\n${detail}\n\nTotal: ${formatPrice(order.total)}`
    );
};

/** Texto del motivo cuando el pedido no siguió. */
export const getFailedOrderReason = (status: OrderStatus, paymentMethod: OrderPaymentMethod = "yappy") => {
    if (paymentMethod === "card") {
        switch (status) {
            case "REJECTED":
                return "Tu banco no aprobó el pago con tarjeta.";
            case "EXPIRED":
                return "El enlace de pago venció antes de pagar.";
            default:
                return "No pudimos abrir el pago con tarjeta.";
        }
    }
    if (paymentMethod === "whatsapp") {
        return status === "EXPIRED"
            ? "No alcanzamos a confirmarlo por WhatsApp a tiempo."
            : "Se canceló al coordinarlo por WhatsApp.";
    }
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
