import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { CartContext } from "./use-cart";

import { getCartCount, getCartTotal } from "@/helpers";
import type { ICartLine } from "@/helpers";
import type { IItem } from "@/interfaces";

const CART_STORAGE_KEY = "chunky-cart";

const readStoredLines = (): ICartLine[] => {
    try {
        const raw = window.sessionStorage.getItem(CART_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
    const [lines, setLines] = useState<ICartLine[]>(readStoredLines);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        try {
            window.sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
        } catch {
            return;
        }
    }, [lines]);

    const addItem = useCallback((item: IItem) => {
        setLines((current) => {
            const existing = current.find((line) => line.item.id === item.id);
            if (existing) {
                return current.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line);
            }
            return [...current, { item, quantity: 1 }];
        });
    }, []);

    const setQuantity = useCallback((itemId: string, quantity: number) => {
        setLines((current) => quantity <= 0
            ? current.filter((line) => line.item.id !== itemId)
            : current.map((line) => line.item.id === itemId ? { ...line, quantity } : line));
    }, []);

    const getQuantity = useCallback(
        (itemId: string) => lines.find((line) => line.item.id === itemId)?.quantity ?? 0,
        [lines]
    );

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
        clearCart,
    }), [lines, isOpen, addItem, setQuantity, getQuantity, clearCart]);

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
