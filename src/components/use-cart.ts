import { createContext, useContext } from "react";

import type { ICartLine, ICartModifier, IPastaOptions } from "@/helpers";
import type { IItem } from "@/interfaces";

export interface ICartContext {
    lines: ICartLine[];
    count: number;
    total: number;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    /** Suma una unidad. Lo elegido (opciones o modificadores) define la linea: otra eleccion es otra linea. */
    addItem: (item: IItem, options?: IPastaOptions, modifiers?: ICartModifier[]) => void;
    setQuantity: (lineKey: string, quantity: number) => void;
    /** Cantidad de un producto sin opciones (la pasta siempre va por su linea). */
    getQuantity: (itemId: string) => number;
    /** Quita lineas que ya no se venden hoy, recuerda sus nombres y abre el carrito para avisarlo. */
    removeUnavailable: (lines: ICartLine[]) => void;
    /** Nombres de lo ultimo que se quito por no estar disponible (vacio si no hay aviso). */
    removedNames: string[];
    dismissRemoved: () => void;
    clearCart: () => void;
}

export const CartContext = createContext<ICartContext | null>(null);

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) throw new Error("useCart debe usarse dentro de CartProvider");
    return context;
};
