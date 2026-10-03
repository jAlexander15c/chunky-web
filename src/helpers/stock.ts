import { MAX_LINE_QUANTITY } from "./order";
import type { ICartLine } from "./order";
import type { IItem } from "@/interfaces";

/**
 * Unidades que existen de un producto por lotes (galletas, postres). null si no tiene tope:
 * se prepara al momento, no lleva control o alguien lo prendió a mano.
 */
export const getAvailableQuantity = (item: IItem): number | null => {
    const availability = item.variants?.[0]?.inventoryAvailability;
    if (availability?.productionMode !== "BATCH" || availability.availabilityMode !== "AUTOMATIC") return null;
    const stock = Number(availability.usableStock);
    return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : null;
};

/** Todas las que lleva el cliente de un producto, sumando sus líneas. */
export const getItemCartQuantity = (lines: ICartLine[], item: IItem) =>
    lines.filter((line) => line.item.id === item.id).reduce((sum, line) => sum + line.quantity, 0);

/**
 * Cuántas puede llevar una línea del carrito. Las demás líneas del mismo producto
 * (otra leche, otro topping) comen del mismo lote, así que se descuentan.
 */
export const getLineMax = (lines: ICartLine[], item: IItem, lineKey: string) => {
    const available = getAvailableQuantity(item);
    if (available === null) return MAX_LINE_QUANTITY;
    const others = lines
        .filter((line) => line.item.id === item.id && line.lineKey !== lineKey)
        .reduce((sum, line) => sum + line.quantity, 0);
    return Math.min(MAX_LINE_QUANTITY, Math.max(0, available - others));
};

/**
 * Aviso junto al contador cuando el stock pone el tope ("Solo quedan 3").
 * available: las que existen del producto; quantity: las que ya lleva el cliente.
 * Devuelve null cuando no hace falta decir nada.
 */
export const getStockNote = (available: number | null, quantity: number): string | null => {
    // Solo al tope: antes de eso el aviso sería ruido
    if (available === null || available <= 0 || quantity < available) return null;
    return available === 1 ? "Solo queda 1" : `Solo quedan ${available}`;
};
