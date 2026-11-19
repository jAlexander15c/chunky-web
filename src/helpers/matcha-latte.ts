import { normalizeModifierName } from "./modifiers";
import type { IModifier } from "./modifiers";

/** Solo el "Matcha Latte" a secas: "Matcha Latte Caliente" y los demás matcha se quedan con la hoja de siempre. */
export const isMatchaLatteName = (name: string) => normalizeModifierName(name) === "matcha latte";

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
