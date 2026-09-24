import { formatCartModifiers, getModifiersPrice } from "./modifiers";
import type { ICartModifier } from "./modifiers";
import { formatPastaOptions } from "./pasta";
import type { IPastaOptions } from "./pasta";

import type { IItem } from "@/interfaces";

export const WHATSAPP_PHONE = "50763266648";

/** La tienda en PedidosYa, para quien prefiere pedir por esa app. */
export const PEDIDOS_YA_URL = "https://www.pedidosya.com.pa/restaurantes/aguadulce/chunky-bites-bakery-4dcee4db-b0f4-42b4-bcd3-ac8257ef2753-menu";

export interface ICartLine {
    /** Identidad de la linea: el producto y, en la pasta, sus opciones (ver getLineKey). */
    lineKey: string;
    item: IItem;
    quantity: number;
    options?: IPastaOptions;
    /** Modificadores de Loyverse elegidos (ej. leche especial). Su precio se suma al del producto. */
    modifiers?: ICartModifier[];
}

/** "8:00 a. m.", "5:00 p. m.": las horas siempre se muestran en formato de 12 horas. */
export const formatHour = (hour: number) =>
    new Date(2000, 0, 1, hour).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", hour12: true });

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

/** Precio de una unidad con sus modificadores incluidos. */
export const getCartLinePrice = (line: ICartLine) => getItemPrice(line.item) + getModifiersPrice(line.modifiers);

export const getCartTotal = (lines: ICartLine[]) =>
    lines.reduce((sum, line) => sum + getCartLinePrice(line) * line.quantity, 0);

/** Lo elegido en una linea: opciones de la pasta y modificadores, en una sola frase. */
export const formatCartLineDetails = (line: ICartLine, separator = " · ") =>
    [
        ...(line.options ? [formatPastaOptions(line.options, separator)] : []),
        ...(line.modifiers ? [formatCartModifiers(line.modifiers, separator)] : []),
    ]
        .filter(Boolean)
        .join(separator);

/** "- Pasta armable x2 (Fettuccine · Pomodoro Chunky · Pollo Grill)" para los mensajes de WhatsApp. */
export const formatCartLine = (line: ICartLine) => {
    const details = formatCartLineDetails(line);
    return `- ${line.item.item_name} x${line.quantity}${details ? ` (${details})` : ""}`;
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
