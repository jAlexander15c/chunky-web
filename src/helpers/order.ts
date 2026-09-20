import { formatPastaOptions } from "./pasta";
import type { IPastaOptions } from "./pasta";

import type { IItem } from "@/interfaces";

export const WHATSAPP_PHONE = "50763266648";

export interface ICartLine {
    /** Identidad de la linea: el producto y, en la pasta, sus opciones (ver getLineKey). */
    lineKey: string;
    item: IItem;
    quantity: number;
    options?: IPastaOptions;
}

export const OPENING_HOURS = [
    { days: "Lunes a viernes", hours: "8:00 a 20:00" },
    { days: "Sábado", hours: "8:00 a 18:00" },
    { days: "Domingo", hours: "Cerrado" },
];

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const formatPrice = (value: number) => priceFormatter.format(value);

/**
 * Precio que se cobra: el de la tienda en Loyverse (variants[0].stores[].price), igual que calcula
 * chunky-api al crear el pedido. default_price es el precio general y solo se usa si la tienda no tiene uno.
 */
export const getItemPrice = (item: IItem) => {
    const variant = item.variants?.[0];
    const stores = variant?.stores ?? [];
    const store = stores.find((entry) => entry.available_for_sale) ?? stores[0];
    return store?.price ?? variant?.default_price ?? 0;
};

export const getCartCount = (lines: ICartLine[]) => lines.reduce((sum, line) => sum + line.quantity, 0);

export const getCartTotal = (lines: ICartLine[]) =>
    lines.reduce((sum, line) => sum + getItemPrice(line.item) * line.quantity, 0);

/** "- Pasta armable x2 (Fettuccine · Pomodoro Chunky · Pollo Grill)" para los mensajes de WhatsApp. */
export const formatCartLine = (line: ICartLine) => {
    const options = line.options ? ` (${formatPastaOptions(line.options)})` : "";
    return `- ${line.item.item_name} x${line.quantity}${options}`;
};

export const buildOrderMessage = (lines: ICartLine[], delivery?: string) => {
    const detail = lines.map(formatCartLine).join("\n");
    const address = delivery ? `\n\n${delivery}` : "";
    return `¡Hola! Me gustaría realizar el siguiente pedido:\n\n${detail}\n\nTotal: ${formatPrice(getCartTotal(lines))}${address}`;
};

export const getWhatsAppUrl = (message?: string) => {
    const query = message ? `?text=${encodeURIComponent(message)}` : "";
    return `https://wa.me/${WHATSAPP_PHONE}${query}`;
};

/** Hora de cierre del dia, o null si hoy no abre. */
export const getClosingHour = (date = new Date()) => {
    const day = date.getDay();
    if (day === 0) return null;
    return day === 6 ? 18 : 20;
};

/** Estado de la barra en una frase: "Abierto hasta las 20:00" o cuando vuelve a abrir. */
export const getOpeningStatusLabel = (isOpen: boolean, date = new Date()) => {
    const closingHour = getClosingHour(date);
    return isOpen && closingHour ? `Abierto hasta las ${closingHour}:00` : getNextOpeningLabel(date);
};

/** Texto corto para cuando la barra esta cerrada: indica cuando vuelve a abrir. */
export const getNextOpeningLabel = (date = new Date()) => {
    const day = date.getDay();
    const hour = date.getHours();

    if (day !== 0 && hour < 8) return "Abrimos hoy a las 8:00";
    if (day === 6 || day === 0) return "Abrimos el lunes a las 8:00";
    return "Abrimos mañana a las 8:00";
};
