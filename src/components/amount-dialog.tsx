import { useState } from "react";
import type { FormEvent } from "react";

import { HttpError } from "@/helpers";

import "./amount-dialog.css";

interface IAmountDialogProps {
    title: string;
    hint: string;
    unit: string;
    initial?: string;
    confirmLabel: string;
    /** Clase de los botones, para que el diálogo se vea como la pantalla que lo abre. */
    buttonClass?: string;
    onConfirm: (amount: number) => Promise<void>;
    onClose: () => void;
}

/**
 * Pide una cantidad y la confirma. Lo usan el tablero y la pantalla de gestión
 * para compras, conteos, mermas y producción.
 */
export const AmountDialog = ({
    title,
    hint,
    unit,
    initial = "",
    confirmLabel,
    buttonClass = "adm-btn",
    onConfirm,
    onClose,
}: IAmountDialogProps) => {
    const [amount, setAmount] = useState(initial);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        // La coma es lo que sale del teclado numérico en español
        const parsed = Number(amount.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0) {
            setError("Escribe una cantidad válida.");
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onConfirm(parsed);
            onClose();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo guardar.");
            setIsSending(false);
        }
    };

    return (
        <div className="dlg" role="dialog" aria-modal="true" aria-label={title}>
            <form className="dlg__panel" onSubmit={submit}>
                <h3 className="script">{title}</h3>
                <p className="dlg__hint">{hint}</p>

                <div className="dlg__field">
                    <input
                        id="amount-dialog-input"
                        className="dlg__input"
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        aria-label={`Cantidad en ${unit}`}
                    />
                    <span className="dlg__unit">{unit}</span>
                </div>

                {error ? <p className="dlg__error" role="alert">{error}</p> : null}

                <div className="dlg__actions">
                    <button type="button" className={buttonClass} onClick={onClose} disabled={isSending}>
                        Cancelar
                    </button>
                    <button type="submit" className={`${buttonClass} ${buttonClass}--solid`} disabled={isSending}>
                        {isSending ? "Guardando…" : confirmLabel}
                    </button>
                </div>
            </form>
        </div>
    );
};
