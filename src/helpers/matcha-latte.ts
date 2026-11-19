import { normalizeModifierName } from "./modifiers";
import type { IModifier } from "./modifiers";

/** Solo el "Matcha Latte" a secas: "Matcha Latte Caliente" y los demás matcha se quedan con la hoja de siempre. */
export const isMatchaLatteName = (name: string) => normalizeModifierName(name) === "matcha latte";

/** Lo que es matcha: lleva "matcha" en el nombre (Matcha Bloom...) o es un "Cloud" (Strawberry Cloud, Banana Cloud). */
export const isMatchaName = (name: string) => {
    const normalized = normalizeModifierName(name);
    return normalized.includes("matcha") || normalized.endsWith(" cloud");
};

/** En Bebidas: el Matcha Latte primero, luego los demás matcha y después el resto, cada grupo en su orden. */
export const sortMatchaFirst = <T extends { item_name: string }>(items: T[]) => {
    const getRank = (item: T) => (isMatchaLatteName(item.item_name) ? 0 : isMatchaName(item.item_name) ? 1 : 2);
    return [...items].sort((a, b) => getRank(a) - getRank(b));
};

/** Yellowtail (los títulos a mano del menú de matcha) se pide solo donde se usa: el resto de la web no la paga. */
const MATCHA_FONT_ID = "matcha-options-font";
export const loadMatchaFont = () => {
    if (typeof document === "undefined" || document.getElementById(MATCHA_FONT_ID)) return;
    const link = document.createElement("link");
    link.id = MATCHA_FONT_ID;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Yellowtail&display=swap";
    document.head.appendChild(link);
};

/** El orden de la maqueta: Leche, Compota, Endulzante, Matcha Extra, Cold foam. */
const MATCHA_MODIFIER_ORDER = ["leche", "compota", "endulzante", "matcha extra", "cold foam"];

/** Los modificadores en el orden del menú de matcha; los que no están en la lista van después, como vienen. */
export const sortMatchaModifiers = (modifiers: IModifier[]) => {
    const getRank = (modifier: IModifier) => {
        const rank = MATCHA_MODIFIER_ORDER.indexOf(normalizeModifierName(modifier.name));
        return rank === -1 ? MATCHA_MODIFIER_ORDER.length : rank;
    };
    // sort es estable: los que empatan conservan el orden de Loyverse
    return [...modifiers].sort((a, b) => getRank(a) - getRank(b));
};
