import { createContext, useContext } from "react";

import type { ICartLine, ICartModifier, IComboChoice, IPastaOptions, IPromoLinePrice, IPublicCombo } from "@/helpers";
import type { IItem } from "@/interfaces";

interface ICartContext {
    lines: ICartLine[];
    count: number;
    total: number;
    subtotal: number;
    discount: number;
    prices: Record<string, IPromoLinePrice>;
    /** Lo que ahorra con sus combos frente a comprar por separado; no entra en el total. */
    comboSavings: number;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    /** Suma una unidad. Lo elegido (opciones o modificadores) define la linea: otra eleccion es otra linea. */
    addItem: (item: IItem, options?: IPastaOptions, modifiers?: ICartModifier[]) => void;
    /** Suma una unidad de un combo con un producto (y sus modificadores) por hueco. */
    addCombo: (combo: IPublicCombo, choices: IComboChoice[]) => void;
    /** Quita del carrito las líneas de esos combos (ya no están a la venta). */
    removeCombos: (comboIds: number[], message?: string) => void;
    setQuantity: (lineKey: string, quantity: number) => void;
    /** Cantidad de un producto sin opciones (la pasta siempre va por su linea). */
    getQuantity: (itemId: string) => number;
    /** Quita lineas que ya no se venden hoy, recuerda sus nombres y abre el carrito para avisarlo. */
    removeUnavailable: (lines: ICartLine[]) => void;
    /** Nombres de lo ultimo que se quito por no estar disponible (vacio si no hay aviso). */
    removedNames: string[];
    /** Aviso suelto (ej. un combo que se acabó al pagar); vacío si no hay. */
    cartNotice: string;
    dismissRemoved: () => void;
    clearCart: () => void;
}

export const CartContext = createContext<ICartContext | null>(null);

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) throw new Error("useCart debe usarse dentro de CartProvider");
    return context;
};
