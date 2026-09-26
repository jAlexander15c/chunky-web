import { httpGet, httpPost } from "./getHttp";
import { formatCartLine, formatPrice, getCartTotal } from "./order";
import type { ICartLine } from "./order";
import type { IPastaOptions } from "./pasta";

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
    customerName: string;
    note: string | null;
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
    /** Aceptó el aviso de privacidad (Ley 81). Obligatorio para quien no lo aceptó antes en este aparato. */
    privacyConsent: boolean;
}

export type CheckoutErrors = Partial<
    Record<"customerName" | "customerPhone" | "whatsappPhone" | "deliveryAddress" | "privacyConsent", string>
>;

/** Celulares que ya aceptaron el aviso en este navegador: a ellos no se les vuelve a preguntar. */
const PRIVACY_STORAGE_KEY = "chunky-privacy-phones";

const readPrivacyPhones = (): string[] => {
    try {
        const stored = JSON.parse(window.localStorage.getItem(PRIVACY_STORAGE_KEY) ?? "[]");
        return Array.isArray(stored) ? stored.filter((one): one is string => typeof one === "string") : [];
    } catch {
        return [];
    }
};

/**
 * Si este celular ya aceptó el aviso en este navegador. Un cliente ya registrado que pide desde
 * otro aparato lo verá una vez más; la API igual le suma el pedido aunque no lo marque.
 */
export const hasAcceptedPrivacy = (phone: string) => {
    const digits = getPhoneDigits(phone);
    return digits.length === 8 && readPrivacyPhones().includes(digits);
};

export const rememberPrivacyAccepted = (phone: string) => {
    const digits = getPhoneDigits(phone);
    if (digits.length !== 8) return;
    try {
        const phones = readPrivacyPhones().filter((one) => one !== digits);
        window.localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify([digits, ...phones].slice(0, 5)));
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
    if (!form.privacyConsent && !hasAcceptedPrivacy(form.customerPhone)) {
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
        privacyConsent: form.privacyConsent || hasAcceptedPrivacy(form.customerPhone),
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

export const fetchOrder = (orderId: string, signal?: AbortSignal) =>
    httpGet<IPublicOrder>(`/orders/${encodeURIComponent(orderId)}`, { signal });

/** Ultimo pedido iniciado en este navegador, para recuperarlo si se recarga la pagina. */
export const getLastOrderId = () => {
    try {
        return window.localStorage.getItem(LAST_ORDER_STORAGE_KEY);
    } catch {
        return null;
    }
};

export const setLastOrderId = (orderId: string | null) => {
    try {
        if (orderId) window.localStorage.setItem(LAST_ORDER_STORAGE_KEY, orderId);
        else window.localStorage.removeItem(LAST_ORDER_STORAGE_KEY);
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
