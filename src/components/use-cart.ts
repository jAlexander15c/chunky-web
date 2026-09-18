import { createContext, useContext } from "react";

import type { ICartLine } from "@/helpers";
import type { IItem } from "@/interfaces";

export interface ICartContext {
    lines: ICartLine[];
    count: number;
    total: number;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    addItem: (item: IItem) => void;
    setQuantity: (itemId: string, quantity: number) => void;
    getQuantity: (itemId: string) => number;
    clearCart: () => void;
}

export const CartContext = createContext<ICartContext | null>(null);

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) throw new Error("useCart debe usarse dentro de CartProvider");
    return context;
};
