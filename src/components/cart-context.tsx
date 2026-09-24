import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { CartContext } from "./use-cart";

import { getCartCount, getCartTotal, getLineKey, trackEvent } from "@/helpers";
import type { ICartLine, ICartModifier, IPastaOptions } from "@/helpers";
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
    const [isOpen, setIsOpen] = useState(false);
    const [removedNames, setRemovedNames] = useState<string[]>([]);

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
            const existing = current.find((line) => line.lineKey === lineKey);
            if (existing) {
                return current.map((line) => line.lineKey === lineKey ? { ...line, quantity: line.quantity + 1 } : line);
            }
            return [...current, { lineKey, item, quantity: 1, options, ...(modifiers?.length && { modifiers }) }];
        });
    }, []);

    const setQuantity = useCallback((lineKey: string, quantity: number) => {
        setLines((current) => quantity <= 0
            ? current.filter((line) => line.lineKey !== lineKey)
            : current.map((line) => line.lineKey === lineKey ? { ...line, quantity } : line));
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

    const dismissRemoved = useCallback(() => setRemovedNames([]), []);

    const clearCart = useCallback(() => setLines([]), []);

    const value = useMemo(() => ({
        lines,
        count: getCartCount(lines),
        total: getCartTotal(lines),
        isOpen,
        setIsOpen,
        addItem,
        setQuantity,
        getQuantity,
        removeUnavailable,
        removedNames,
        dismissRemoved,
        clearCart,
    }), [lines, isOpen, addItem, setQuantity, getQuantity, removeUnavailable, removedNames, dismissRemoved, clearCart]);

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
