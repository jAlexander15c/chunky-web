import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { PastaBuilderContext } from "./use-pasta-builder";

/** Estado de la hoja del armador: se abre desde el menu, el inicio o el carrito. */
export const PastaBuilderProvider = ({ children }: { children: ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);

    const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);

    return <PastaBuilderContext.Provider value={value}>{children}</PastaBuilderContext.Provider>;
};
