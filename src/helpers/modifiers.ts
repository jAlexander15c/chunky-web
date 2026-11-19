import { useEffect, useRef, useState } from "react";

import { httpGet } from "./getHttp";
import { keepIfSame, useLiveRefresh } from "./live-refresh";

import type { IItem } from "@/interfaces";

export interface IModifierOption {
    id: string;
    name: string;
    price: number;
    /** Agotada en nuestra base (Loyverse no lo soporta). Si falta, esta disponible. */
    isAvailable?: boolean;
    /** Se apagó sola porque a su insumo no le alcanza para una porción. */
    isOutOfStock?: boolean;
    /** Permanece apagada por decisión manual aunque sus insumos alcancen. */
    isManuallyDisabled?: boolean;
}

export const isOptionAvailable = (option: IModifierOption) => option.isAvailable !== false;

/** Un modificador de Loyverse, ej. "leche" con la opcion "especial" a +$0.50. */
export interface IModifier {
    id: string;
    name: string;
    options: IModifierOption[];
}

/** Lo que se guarda en la linea del carrito y viaja al pedido. */
export interface ICartModifier {
    modifierId: string;
    modifierOptionId: string;
    name: string;
    option: string;
    price: number;
}

/** Cada tanto se vuelve a pedir: asi una opcion que se agota se ve sin recargar la pagina. */
const MODIFIERS_TTL_MS = 2 * 60 * 1000;

type ModifierCacheEntry = { modifiers: IModifier[]; savedAt: number };
const modifiersCache = new Map<string, ModifierCacheEntry>();
const modifiersRequests = new Map<string, Promise<IModifier[]>>();

/** Cada variante tiene su disponibilidad y su cache; la global sigue sirviendo al catálogo. */
const fetchModifiersCached = (force = false, variantId?: string, options = "") => {
    const key = JSON.stringify([variantId ?? "", options]);
    const cached = modifiersCache.get(key);
    if (!force && cached && Date.now() - cached.savedAt < MODIFIERS_TTL_MS) return Promise.resolve(cached.modifiers);
    let request = modifiersRequests.get(key);
    if (!request) {
        request = httpGet<{ modifiers: IModifier[] }>("/modifiers" + (variantId ? "?variantId=" + encodeURIComponent(variantId) + (options ? "&options=" + encodeURIComponent(options) : "") : ""))
            .then(({ modifiers }) => {
                modifiersCache.set(key, { modifiers, savedAt: Date.now() });
                return modifiers;
            })
            .catch((error) => {
                console.error("[modificadores] error:", error?.status, error?.message);
                return modifiersCache.get(key)?.modifiers ?? [];
            })
            .finally(() => { modifiersRequests.delete(key); });
        modifiersRequests.set(key, request);
    }
    return request;
};

/** Caja refresca en vivo; variantId aplica las cantidades propias de su receta. */
export const useModifiers = ({ live = false, variantId, optionIds = [] }: { live?: boolean; variantId?: string; optionIds?: string[] } = {}) => {
    const options = [...new Set(optionIds)].sort().join(",");
    const key = JSON.stringify([variantId ?? "", options]);
    const latestKey = useRef(key);
    useEffect(() => { latestKey.current = key; }, [key]);
    const [state, setState] = useState<{ variantId?: string; modifiers: IModifier[] }>(() => ({ variantId, modifiers: modifiersCache.get(key)?.modifiers ?? [] }));
    useLiveRefresh(() => {
        void fetchModifiersCached(true, variantId, options).then((next) => {
            if (latestKey.current === key) setState((current) => ({ variantId, modifiers: current.variantId === variantId ? keepIfSame(current.modifiers, next) : next }));
        });
    }, live);
    useEffect(() => {
        let cancelled = false;
        void fetchModifiersCached(Boolean(variantId), variantId, options).then((next) => {
            if (!cancelled && latestKey.current === key) setState({ variantId, modifiers: next });
        });
        return () => { cancelled = true; };
    }, [key, variantId, options]);
    // Conserva los controles mientras cambia la selección, sin compartir estados entre variantes.
    return state.variantId === variantId ? state.modifiers : modifiersCache.get(key)?.modifiers ?? [];
};

/**
 * Los modificadores de un producto, en el orden que tiene Loyverse.
 * Ojo: el campo de Loyverse es `modifier_ids`, no `modifiers_ids`.
 */
export const getItemModifiers = (item: IItem, modifiers: IModifier[], selectedOptionIds: string[] = []): IModifier[] =>
    (item.modifier_ids ?? [])
        .map((id) => modifiers.find((modifier) => modifier.id === id))
        .filter((modifier): modifier is IModifier => Boolean(modifier))
        // Con todas sus opciones agotadas, el modificador no se ofrece
        .filter((modifier) => modifier.options.some((option) => isOptionAvailable(option) || selectedOptionIds.includes(option.id)));

export const hasItemModifiers = (item: IItem, modifiers: IModifier[]) => getItemModifiers(item, modifiers).length > 0;

/** Un modificador con una sola opcion se muestra como casilla; con varias, se elige una. */
export const isSingleOptionModifier = (modifier: IModifier) => modifier.options.length === 1;

/** Con repeticiones (Endulzante x3) la suma de decimales acumula ruido: se redondea a centavos. */
export const getModifiersPrice = (modifiers: ICartModifier[] = []) =>
    Math.round(modifiers.reduce((sum, modifier) => sum + modifier.price, 0) * 100) / 100;

/** "Endulzante" -> "endulzante": sin acentos, espacios colapsados y en minúsculas. */
export const normalizeModifierName = (name: string) =>
    name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Modificadores cuya opción elegida se puede agregar varias veces (mismo contrato que el API). */
export const REPEATABLE_MODIFIER_NAMES = ["endulzante"];

/** Tope de repeticiones de una opción repetible. */
export const MAX_MODIFIER_REPEAT = 20;

/**
 * Un modificador repetible se elige una sola vez y se cuenta: la opción viaja como el mismo id
 * repetido N veces (y como N entradas idénticas en el carrito), así los precios suman N × precio.
 */
export const isRepeatableModifier = (modifier: Pick<IModifier, "name">) =>
    REPEATABLE_MODIFIER_NAMES.includes(normalizeModifierName(modifier.name));

/**
 * La opción de un modificador repetible queda `count` veces (0 a MAX_MODIFIER_REPEAT). Lo que ese
 * modificador tuviera antes se reemplaza: elegir otra opción del Endulzante no suma, cambia.
 */
export const setRepeatedOption = (chosen: ICartModifier[], modifier: IModifier, option: IModifierOption, count: number): ICartModifier[] => {
    const next = Math.min(MAX_MODIFIER_REPEAT, Math.max(0, count));
    return [
        ...chosen.filter((entry) => entry.modifierId !== modifier.id),
        ...Array.from({ length: next }, () => toCartModifier(modifier, option)),
    ];
};

/** El nombre del grupo con mayúscula inicial: "leche" -> "Leche". */
export const capitalizeFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Lo mínimo que tiene un modificador elegido en cualquier pantalla (carrito, comanda, cocina, pedido). */
type ModifierEntry = { name: string; option: string };

/** Junta las repeticiones de una misma opción, en el orden de la primera vez que aparece. */
export const groupModifierEntries = <T extends ModifierEntry>(modifiers: T[]): { entry: T; count: number }[] => {
    const groups = new Map<string, { entry: T; count: number }>();
    modifiers.forEach((modifier) => {
        const key = `${modifier.name}\u0000${modifier.option}`;
        const group = groups.get(key);
        if (group) group.count += 1;
        else groups.set(key, { entry: modifier, count: 1 });
    });
    return [...groups.values()];
};

/** "Vainilla ×3"; una sola vez, sin "×1". */
const withRepeat = (text: string, count: number) => (count > 1 ? `${text} ×${count}` : text);

/** "Leche: Avena · Endulzante: Vainilla ×3 · Extra: Shot de espresso" */
export const formatCartModifiers = (modifiers: ICartModifier[], separator = " · ") =>
    groupModifierEntries(modifiers)
        .map(({ entry, count }) => `${capitalizeFirst(entry.name.trim())}: ${withRepeat(entry.option, count)}`)
        .join(separator);

/** Solo las opciones, para donde el nombre del grupo sobra: "Avena, Vainilla ×3". */
export const formatModifierOptions = (modifiers: ModifierEntry[], separator = ", ") =>
    groupModifierEntries(modifiers)
        .map(({ entry, count }) => withRepeat(entry.option, count))
        .join(separator);

/** Una frase por opción, como se lee en la comanda: ["Leche Avena", "Endulzante Vainilla ×3"]. */
export const formatModifierPhrases = (modifiers: ModifierEntry[]) =>
    groupModifierEntries(modifiers).map(({ entry, count }) => withRepeat(`${entry.name} ${entry.option}`, count));

export const toCartModifier = (modifier: IModifier, option: IModifierOption): ICartModifier => ({
    modifierId: modifier.id,
    modifierOptionId: option.id,
    name: modifier.name,
    option: option.name,
    price: option.price,
});
