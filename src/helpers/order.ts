import type { IItem } from "@/interfaces";

export const WHATSAPP_PHONE = "50763266648";

export interface ICartLine {
    item: IItem;
    quantity: number;
}

export const OPENING_HOURS = [
    { days: "Lunes a viernes", hours: "8:00 a 20:00" },
    { days: "Sábado", hours: "8:00 a 18:00" },
    { days: "Domingo", hours: "Cerrado" },
];

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const formatPrice = (value: number) => priceFormatter.format(value);

export const getItemPrice = (item: IItem) => item.variants?.[0]?.default_price ?? 0;

export const getCartCount = (lines: ICartLine[]) => lines.reduce((sum, line) => sum + line.quantity, 0);

export const getCartTotal = (lines: ICartLine[]) =>
    lines.reduce((sum, line) => sum + getItemPrice(line.item) * line.quantity, 0);

export const buildOrderMessage = (lines: ICartLine[]) => {
    const detail = lines.map((line) => `- ${line.item.item_name} x${line.quantity}`).join("\n");
    return `¡Hola! Me gustaría realizar el siguiente pedido:\n\n${detail}\n\nTotal: ${formatPrice(getCartTotal(lines))}`;
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
