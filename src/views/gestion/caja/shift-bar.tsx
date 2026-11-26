import { useCallback, useState } from "react";

import { FullSheet } from "@/components";
import { formatCash, registerCashMovement } from "@/helpers";
import type { IShiftDetail } from "@/helpers";
import { GestionTurno } from "../turno";
import { MovementDialog } from "../turno/movement-dialog";
import { CASH_DIALOG } from "../turno/helpers";

export type ShiftSheet = "ver" | "abrir" | "cerrar";

const SHEET_TITLE: Record<ShiftSheet, string> = {
    ver: "Turno",
    abrir: "Abrir turno",
    cerrar: "Cerrar caja",
};

interface IShiftBarProps {
    token: string;
    shift: IShiftDetail | null;
    /** Hoja con la que se entra (llega de un enlace viejo `?s=turno`). */
    initialSheet?: ShiftSheet | null;
    onShiftChange: (shift: IShiftDetail | null) => void;
    onSessionExpired: () => void;
}

/**
 * Barra del turno arriba de las mesas: quién lo abrió y cuánto efectivo se espera, con los botones
 * para abrir, mover efectivo, ver el detalle y cerrar. El detalle, la apertura y el cierre son los de
 * siempre (GestionTurno) dentro de una hoja.
 */
export const ShiftBar = ({ token, shift, initialSheet = null, onShiftChange, onSessionExpired }: IShiftBarProps) => {
    const [sheet, setSheet] = useState<ShiftSheet | null>(initialSheet);
    const [movement, setMovement] = useState<"entrada" | "salida" | null>(null);
    const closeSheet = useCallback(() => setSheet(null), []);

    return (
        <div className="ges-shiftbar" role="region" aria-label="Turno">
            <p className={`ges-shiftbar__state${shift ? "" : " is-off"}`} role="status">
                <i aria-hidden="true" />
                {shift ? (
                    <span>
                        Turno abierto por <b>{shift.openedByName}</b> · efectivo esperado <b>{formatCash(shift.expected)}</b>
                    </span>
                ) : (
                    <span>Sin turno abierto</span>
                )}
            </p>
            <div className="ges-shiftbar__acts">
                {shift ? (
                    <>
                        <button type="button" className="ges-btn ges-btn--sm" onClick={() => setMovement("entrada")}>Entrada</button>
                        <button type="button" className="ges-btn ges-btn--sm" onClick={() => setMovement("salida")}>Salida</button>
                        <button type="button" className="ges-btn ges-btn--sm" onClick={() => setSheet("ver")}>Ver turno</button>
                        <button type="button" className="ges-btn ges-btn--sm ges-btn--solid" onClick={() => setSheet("cerrar")}>Cerrar caja</button>
                    </>
                ) : (
                    <button type="button" className="ges-btn ges-btn--sm ges-btn--solid" onClick={() => setSheet("abrir")}>Abrir turno</button>
                )}
            </div>

            {sheet ? (
                <FullSheet title={SHEET_TITLE[sheet]} onClose={closeSheet}>
                    {(close) => (
                        <GestionTurno
                            token={token}
                            onSessionExpired={onSessionExpired}
                            onShiftChange={onShiftChange}
                            onOpened={() => close()}
                            onClosed={() => close()}
                            shouldFocusClose={sheet === "cerrar"}
                        />
                    )}
                </FullSheet>
            ) : null}

            {movement ? (
                <MovementDialog
                    {...CASH_DIALOG[movement]}
                    amountLabel="Monto"
                    onClose={() => setMovement(null)}
                    onSave={async (amount, reason) => {
                        const data = await registerCashMovement(token, { type: movement, amount, reason });
                        onShiftChange(data.shift);
                        setMovement(null);
                    }}
                />
            ) : null}
        </div>
    );
};
