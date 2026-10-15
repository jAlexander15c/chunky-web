import { isWithinOperatingHours } from "./hours";
import type { IWeekHours, StoreOverride } from "./hours";
import type { ICartModifier } from "./modifiers";

import type { IItem } from "@/interfaces";

/** Lo que el cliente elige al armar su pasta (nombres exactos que manda chunky-api en /settings/public). */
export interface IPastaOptions {
    pasta: string;
    sauce: string;
    protein: string;
}

type PastaOptionKey = keyof IPastaOptions;

export interface IPastaSettings {
    itemId: string;
    itemName: string;
    variantId: string;
    price: number;
    imageUrl: string | null;
    options: Record<PastaOptionKey, string[]>;
    /** Los modificadores Pasta, Salsa y Proteína, para elegirlos en la Caja. Falta con un API anterior. */
    modifierIds?: string[];
}

/** Los tres pasos del armador, en orden. */
export const PASTA_STEPS: { key: PastaOptionKey; label: string }[] = [
    { key: "pasta", label: "Pasta" },
    { key: "sauce", label: "Salsa" },
    { key: "protein", label: "Proteína" },
];

export const isPastaOptionsComplete = (options: Partial<IPastaOptions>): options is IPastaOptions =>
    PASTA_STEPS.every((step) => Boolean(options[step.key]));

/** "Fettuccine · Pomodoro Chunky · Pollo Grill" */
export const formatPastaOptions = (options: IPastaOptions, separator = " · ") =>
    [options.pasta, options.sauce, options.protein].join(separator);

/**
 * Identidad de una linea del carrito: el producto y lo que se eligio (opciones de la pasta o
 * modificadores de Loyverse). Asi dos bebidas con leche distinta no se suman en una sola linea.
 */
export const getLineKey = (itemId: string, options?: IPastaOptions, modifiers?: ICartModifier[]) => {
    const pasta = options ? `:${options.pasta}|${options.sauce}|${options.protein}` : "";
    // Ordenados: elegir leche y luego café da la misma linea que al revés
    const chosen = modifiers?.length
        ? `:${modifiers.map((modifier) => modifier.modifierOptionId).slice().sort().join("|")}`
        : "";
    return `${itemId}${pasta}${chosen}`;
};

/**
 * El carrito guarda items de Loyverse completos, pero la web solo conoce de la pasta lo que trae
 * /settings/public. Se arma un item con lo minimo que usan el carrito y el pedido.
 */
export const buildPastaItem = (pasta: IPastaSettings): IItem => ({
    id: pasta.itemId,
    item_name: pasta.itemName,
    image_url: pasta.imageUrl ?? "",
    category_id: null,
    variants: [
        {
            variant_id: pasta.variantId,
            default_price: pasta.price,
            stores: [{ available_for_sale: true, price: pasta.price }],
        },
    ],
} as unknown as IItem);

/** Lo que decide que se vende el dia de pasta: sale de GET /settings/public. */
export interface IPastaDayContext {
    pastaMode: boolean;
    /** Tambien se vende el resto del menu (segundo interruptor del tablero). Falta con un API anterior. */
    pastaFullMenu?: boolean;
    openingHours?: IWeekHours;
    storeOverride?: StoreOverride | null;
}

/**
 * Si ahora solo se vende pasta y bebidas. Con el resto del menu encendido, eso pasa solo fuera del
 * horario de la semana (abierto a mano desde el tablero cuenta como dentro del horario).
 */
export const isPastaOnlyNow = (context: IPastaDayContext, date = new Date()) => {
    if (!context.pastaMode) return false;
    if (!context.pastaFullMenu || !context.openingHours) return true;
    if (context.storeOverride === "open") return false;
    return !isWithinOperatingHours(context.openingHours, date);
};

/** El dia de solo pasta y bebidas todo es delivery; con el resto del menu la entrega sigue el modo delivery. */
export const isPastaDeliveryOnly = (context: IPastaDayContext) => context.pastaMode && !context.pastaFullMenu;
