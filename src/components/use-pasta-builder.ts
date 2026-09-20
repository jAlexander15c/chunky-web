import { createContext, useContext } from "react";

export interface IPastaBuilderContext {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

export const PastaBuilderContext = createContext<IPastaBuilderContext | null>(null);

export const usePastaBuilder = () => {
    const context = useContext(PastaBuilderContext);
    if (!context) throw new Error("usePastaBuilder debe usarse dentro de PastaBuilderProvider");
    return context;
};
