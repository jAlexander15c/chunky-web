import { useEffect, useState } from "react";

import { httpGet } from "./getHttp";

import type { IItem } from "@/interfaces";

export interface IModifierOption {
    id: string;
    name: string;
    price: number;
}

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

let modifiersCache: IModifier[] | null = null;
let modifiersRequest: Promise<IModifier[]> | null = null;

/** Catalogo de modificadores del API. Se pide una sola vez por carga de la pagina. */
export const fetchModifiersCached = () => {
    if (modifiersCache) return Promise.resolve(modifiersCache);

    if (!modifiersRequest) {
        modifiersRequest = httpGet<{ modifiers: IModifier[] }>("/modifiers")
            .then(({ modifiers }) => {
                modifiersCache = modifiers;
                return modifiers;
            })
            .catch((error) => {
                console.error("[modificadores] error:", error?.status, error?.message);
                // Sin modificadores el menu sigue funcionando: se agrega sin opciones
                return [];
            })
            .finally(() => {
                modifiersRequest = null;
            });
    }

    return modifiersRequest;
};

export const useModifiers = () => {
    const [modifiers, setModifiers] = useState<IModifier[]>(() => modifiersCache ?? []);

    useEffect(() => {
        let cancelled = false;
        void fetchModifiersCached().then((next) => {
            if (!cancelled) setModifiers(next);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return modifiers;
};

/**
 * Los modificadores de un producto, en el orden que tiene Loyverse.
 * Ojo: el campo de Loyverse es `modifier_ids`, no `modifiers_ids`.
 */
export const getItemModifiers = (item: IItem, modifiers: IModifier[]): IModifier[] =>
    (item.modifier_ids ?? [])
        .map((id) => modifiers.find((modifier) => modifier.id === id))
        .filter((modifier): modifier is IModifier => Boolean(modifier));

export const hasItemModifiers = (item: IItem, modifiers: IModifier[]) => getItemModifiers(item, modifiers).length > 0;

/** Un modificador con una sola opcion se muestra como casilla; con varias, se elige una. */
export const isSingleOptionModifier = (modifier: IModifier) => modifier.options.length === 1;

export const getModifiersPrice = (modifiers: ICartModifier[] = []) =>
    modifiers.reduce((sum, modifier) => sum + modifier.price, 0);

/** "leche especial · Café Capuchino" */
export const formatCartModifiers = (modifiers: ICartModifier[], separator = " · ") =>
    modifiers.map((modifier) => `${modifier.name} ${modifier.option}`).join(separator);

export const toCartModifier = (modifier: IModifier, option: IModifierOption): ICartModifier => ({
    modifierId: modifier.id,
    modifierOptionId: option.id,
    name: modifier.name,
    option: option.name,
    price: option.price,
});
