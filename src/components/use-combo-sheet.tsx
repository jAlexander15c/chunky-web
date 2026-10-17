import { useEffect, useState } from "react";

import { ComboSheet } from "./combo-sheet";

import { useCombos } from "@/helpers";
import type { IPublicCombo } from "@/helpers";

/**
 * Abre la hoja de un combo y la cierra con aviso si el combo deja de estar a la venta mientras
 * está abierta. `comboSheet` se pinta una vez, donde se use el hook.
 */
export const useComboSheet = () => {
    const { combos, isReady } = useCombos();
    const [openedId, setOpenedId] = useState<number | null>(null);
    const [goneName, setGoneName] = useState("");
    const [lastName, setLastName] = useState("");

    const opened = openedId === null ? null : combos.find((combo) => combo.id === openedId) ?? null;
    // Si se abrió y ya no está en la lista (terminó su hora), se cierra y se avisa
    if (openedId !== null && isReady && !opened) {
        setOpenedId(null);
        setGoneName(lastName);
    }

    useEffect(() => {
        if (!goneName) return;
        const timer = window.setTimeout(() => setGoneName(""), 7000);
        return () => window.clearTimeout(timer);
    }, [goneName]);

    const openCombo = (combo: IPublicCombo) => {
        setGoneName("");
        setLastName(combo.name);
        setOpenedId(combo.id);
    };

    const comboSheet = (
        <>
            <ComboSheet combo={opened} onClose={() => setOpenedId(null)} />
            {goneName && <p className="combo-notice" role="status">El combo {goneName} ya no está a la venta a esta hora.</p>}
        </>
    );

    return { openCombo, comboSheet };
};
