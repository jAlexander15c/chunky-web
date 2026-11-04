import { HttpError } from "@/helpers";
import type { IDeliveryOrder, PaymentMethod } from "@/helpers";

export const PAYMENT_METHODS: PaymentMethod[] = ["efectivo", "tarjeta", "yappy"];

export const formatClock = (value: string | number) =>
    new Date(value).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", hour12: true });

/** A quién se le escribe: su WhatsApp si dio otro, si no el celular del pedido. */
export const getContactPhone = (order: IDeliveryOrder) => order.whatsappPhone ?? order.customerPhone;

export const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof HttpError && error.status < 500 ? error.message : fallback;
