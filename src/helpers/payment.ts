import { httpGet, httpPost } from "./getHttp";
import { formatPrice, getCartTotal } from "./order";
import type { ICartLine } from "./order";

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
    lines: { name: string; quantity: number; price: number }[];
    total: number;
    yappyConfirmation: string | null;
    // Los marca la cocina en /cocina
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

export interface ICheckoutForm {
    customerName: string;
    customerPhone: string;
    hasOtherWhatsapp: boolean;
    whatsappPhone: string;
    note: string;
}

export type CheckoutErrors = Partial<Record<"customerName" | "customerPhone" | "whatsappPhone", string>>;

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

export const getCheckoutErrors = (form: ICheckoutForm): CheckoutErrors => {
    const errors: CheckoutErrors = {};
    if (form.customerName.trim().length < 2) errors.customerName = "Escribe tu nombre para saber de quién es el pedido.";
    if (!isPanamaMobile(form.customerPhone)) errors.customerPhone = "Escribe un celular de 8 dígitos que empiece en 6.";
    if (form.hasOtherWhatsapp && !isPanamaMobile(form.whatsappPhone)) {
        errors.whatsappPhone = "Escribe un WhatsApp de 8 dígitos que empiece en 6.";
    }
    return errors;
};

export const createOrder = (lines: ICartLine[], form: ICheckoutForm) =>
    httpPost<IYappyPaymentSession>("/orders", {
        lines: lines.map((line) => ({ variantId: line.item.variants[0].variant_id, quantity: line.quantity })),
        customerName: form.customerName.trim(),
        customerPhone: getPhoneDigits(form.customerPhone),
        whatsappPhone: form.hasOtherWhatsapp ? getPhoneDigits(form.whatsappPhone) : undefined,
        note: form.note.trim() || undefined,
    });

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
export const buildPaymentHelpMessage = (lines: ICartLine[], form: Pick<ICheckoutForm, "customerName" | "note">, orderId?: string | null) => {
    const detail = lines.map((line) => `- ${line.item.item_name} x${line.quantity}`).join("\n");
    const who = form.customerName.trim() ? `Soy ${form.customerName.trim()}. ` : "";
    const reference = orderId ? ` (pedido ${orderId})` : "";
    const note = form.note.trim() ? `\n\nNota: ${form.note.trim()}` : "";
    return `¡Hola! ${who}Tuve un problema pagando con Yappy en la web${reference}. Mi pedido es:\n\n${detail}\n\nTotal: ${formatPrice(getCartTotal(lines))}${note}`;
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
