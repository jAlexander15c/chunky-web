import { useState } from "react";
import type { ReactNode } from "react";

import { HttpError } from "@/helpers";
import { parseAmount, roundMoney } from "./helpers";

interface IMovementDialogProps {
    title: string;
    note: string;
    amountLabel: string;
    reasonPlaceholder: string;
    /** El ajuste puede dejar el fondo en cero; una entrada o salida no puede ser de cero. */
    allowZero?: boolean;
    getPreview?: (amount: number) => ReactNode;
    onSave: (amount: number, reason: string) => Promise<void>;
    onClose: () => void;
}

export const MovementDialog = ({
    title,
    note,
    amountLabel,
    reasonPlaceholder,
    allowZero = false,
    getPreview,
    onSave,
    onClose,
}: IMovementDialogProps) => {
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const parsed = parseAmount(amount);
    const isValidAmount = Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0);

    const submit = async () => {
        if (!isValidAmount) {
            setError(allowZero ? "Escribe cuánto hay." : "Escribe un monto mayor que cero.");
            return;
        }
        if (reason.trim().length < 3) {
            setError("Escribe para qué fue.");
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onSave(roundMoney(parsed), reason.trim());
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo guardar.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={title}>
            <div className="ges-modal__panel">
                <h3 className="script">{title}</h3>
                <p className="ges-note">{note}</p>

                <label className="ges-field">
                    <span>{amountLabel}</span>
                    <input
                        id="turno-monto"
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={amount}
                        placeholder="0.00"
                        onChange={(event) => setAmount(event.target.value)}
                    />
                </label>

                {getPreview && isValidAmount ? getPreview(roundMoney(parsed)) : null}

                <label className="ges-field">
                    <span>Para qué</span>
                    <input
                        id="turno-motivo"
                        type="text"
                        value={reason}
                        placeholder={reasonPlaceholder}
                        onChange={(event) => setReason(event.target.value)}
                    />
                </label>

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="button" className="ges-btn ges-btn--solid" onClick={() => void submit()} disabled={isSending}>
                        {isSending ? "Guardando…" : "Guardar"}
                    </button>
                </div>
            </div>
        </div>
    );
};
