import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { CartContext } from "./use-cart";

import { COMBO_LIMITS, getCartCount, getComboLineKey, getComboSaving, getPromoCart, useCombos, usePromos, getLineKey, getLineMax, trackEvent } from "@/helpers";
import type { ICartLine, ICartModifier, IComboChoice, IPastaOptions, IPublicCombo } from "@/helpers";
import type { IItem } from "@/interfaces";

const CART_STORAGE_KEY = "chunky-cart";

const readStoredLines = (): ICartLine[] => {
    try {
        const raw = window.sessionStorage.getItem(CART_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        // Los carritos guardados antes de la pasta no traen lineKey
        return parsed
            .filter((line) => line?.item?.id)
            .map((line) => ({ ...line, lineKey: line.lineKey ?? getLineKey(line.item.id, line.options, line.modifiers) }));
    } catch {
        return [];
    }
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
    const [lines, setLines] = useState<ICartLine[]>(readStoredLines);
    const { promos } = usePromos();
    const pricing = useMemo(() => getPromoCart(lines, promos), [lines, promos]);
    const { combos } = useCombos();
    // Lo que ahorra el cliente con sus combos frente a comprar los productos por separado (solo informativo)
    const comboSavings = useMemo(() => Math.round(lines.reduce((sum, line) => {
        const combo = line.combo ? combos.find((entry) => entry.id === line.combo!.comboId) : undefined;
        return sum + (combo ? getComboSaving(combo) * line.quantity : 0);
    }, 0) * 100) / 100, [lines, combos]);
    const [isOpen, setIsOpen] = useState(false);
    const [removedNames, setRemovedNames] = useState<string[]>([]);
    const [cartNotice, setCartNotice] = useState("");

    useEffect(() => {
        try {
            window.sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
        } catch {
            return;
        }
    }, [lines]);

    // Cada vez que el carrito se abre, venga del boton o de agregar algo con opciones
    useEffect(() => {
        if (isOpen) trackEvent("cart_open");
    }, [isOpen]);

    const addItem = useCallback((item: IItem, options?: IPastaOptions, modifiers?: ICartModifier[]) => {
        // Un solo punto para todos los "agregar": tarjeta, opciones y armador de pasta
        trackEvent("add_to_cart", item.id, item.item_name);
        const lineKey = getLineKey(item.id, options, modifiers);
        setLines((current) => {
            // Galletas y postres por lotes: no se agrega lo que no existe
            const max = getLineMax(current, item, lineKey);
            const existing = current.find((line) => line.lineKey === lineKey);
            if (existing) {
                return current.map((line) =>
                    line.lineKey === lineKey ? { ...line, quantity: Math.min(max, line.quantity + 1) } : line
                );
            }
            if (max <= 0) return current;
            return [...current, { lineKey, item, quantity: 1, options, ...(modifiers?.length && { modifiers }) }];
        });
    }, []);

    /** Suma una unidad de un combo con lo elegido en cada hueco. El tope de stock lo valida el API. */
    const addCombo = useCallback((combo: IPublicCombo, choices: IComboChoice[]) => {
        trackEvent("add_to_cart", `combo:${combo.id}`, combo.name);
        const lineKey = getComboLineKey(combo.id, choices);
        setLines((current) => {
            if (current.some((line) => line.lineKey === lineKey)) {
                return current.map((line) =>
                    line.lineKey === lineKey ? { ...line, quantity: Math.min(COMBO_LIMITS.quantityMax, line.quantity + 1) } : line
                );
            }
            return [...current, { lineKey, item: choices[0].item, quantity: 1, combo: { comboId: combo.id, name: combo.name, price: combo.price, choices } }];
        });
    }, []);

    const setQuantity = useCallback((lineKey: string, quantity: number) => {
        setLines((current) => quantity <= 0
            ? current.filter((line) => line.lineKey !== lineKey)
            : current.map((line) => {
                if (line.lineKey !== lineKey) return line;
                const max = line.combo ? COMBO_LIMITS.quantityMax : getLineMax(current, line.item, lineKey);
                return { ...line, quantity: Math.min(max, quantity) };
            }));
    }, []);

    /** Quita las líneas de combos que ya no están a la venta. */
    const removeCombos = useCallback((comboIds: number[], message = "") => {
        setLines((current) => current.filter((line) => !line.combo || !comboIds.includes(line.combo.comboId)));
        // Con el carrito vacío no queda donde leer el aviso del pago: se muestra arriba del carrito
        setCartNotice(message);
    }, []);

    const getQuantity = useCallback(
        (itemId: string) => lines.find((line) => line.lineKey === itemId)?.quantity ?? 0,
        [lines]
    );

    const removeUnavailable = useCallback((unavailable: ICartLine[]) => {
        const lineKeys = unavailable.map((line) => line.lineKey);
        setLines((current) => current.filter((line) => !lineKeys.includes(line.lineKey)));
        setRemovedNames((current) => [...new Set([...current, ...unavailable.map((line) => line.item.item_name)])]);
        // Con el carrito vacio no queda como abrirlo: se abre solo para que el aviso se vea
        setIsOpen(true);
    }, []);

    const dismissRemoved = useCallback(() => { setRemovedNames([]); setCartNotice(""); }, []);

    const clearCart = useCallback(() => setLines([]), []);

    const value = useMemo(() => ({
        lines,
        count: getCartCount(lines),
        ...pricing,
        comboSavings,
        isOpen,
        setIsOpen,
        addItem,
        addCombo,
        removeCombos,
        setQuantity,
        getQuantity,
        removeUnavailable,
        removedNames,
        cartNotice,
        dismissRemoved,
        clearCart,
    }), [lines, pricing, comboSavings, isOpen, addItem, addCombo, removeCombos, setQuantity, getQuantity, removeUnavailable, removedNames, cartNotice, dismissRemoved, clearCart]);

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
