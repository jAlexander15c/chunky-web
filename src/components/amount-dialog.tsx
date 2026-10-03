import { useState } from "react";
import type { FormEvent } from "react";

import { HttpError, roundQuantity, splitInPresentation } from "@/helpers";
import type { IPresentation } from "@/helpers";

import "./amount-dialog.css";

interface IAmountDialogProps {
    title: string;
    hint: string;
    unit: string;
    initial?: string;
    confirmLabel: string;
    /** Clase de los botones, para que el diálogo se vea como la pantalla que lo abre. */
    buttonClass?: string;
    /**
     * Con presentación se escribe "3 cartones y 400 ml" en lugar de 3238 ml.
     * `onConfirm` recibe igual el total en la unidad de consumo.
     */
    presentation?: IPresentation | null;
    onConfirm: (amount: number) => Promise<void>;
    onClose: () => void;
}

/** La coma es lo que sale del teclado numérico en español. */
const parseAmount = (value: string) => (value.trim() ? Number(value.replace(",", ".")) : 0);

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
    presentation,
    onConfirm,
    onClose,
}: IAmountDialogProps) => {
    const initialSplit =
        presentation && initial.trim() ? splitInPresentation(parseAmount(initial), presentation) : null;
    const [amount, setAmount] = useState(initial);
    const [whole, setWhole] = useState(initialSplit ? String(initialSplit.whole) : "");
    const [loose, setLoose] = useState(initialSplit ? String(initialSplit.loose) : "");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const getTotal = () => {
        if (!presentation) return parseAmount(amount);
        const count = parseAmount(whole);
        if (!Number.isInteger(count)) return NaN;
        return roundQuantity(count * presentation.size + parseAmount(loose));
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const parsed = getTotal();
        if (!Number.isFinite(parsed) || parsed < 0) {
            setError(
                presentation
                    ? `Escribe ${presentation.plural} enteros y lo suelto en ${unit}.`
                    : "Escribe una cantidad válida."
            );
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

    const total = presentation ? getTotal() : null;

    return (
        <div className="dlg" role="dialog" aria-modal="true" aria-label={title}>
            <form className="dlg__panel" onSubmit={submit}>
                <h3 className="script">{title}</h3>
                <p className="dlg__hint">{hint}</p>

                {presentation ? (
                    <>
                        <div className="dlg__split">
                            <label className="dlg__part">
                                <span>{presentation.plural} enteros</span>
                                <input
                                    id="amount-dialog-whole"
                                    className="dlg__input"
                                    type="text"
                                    inputMode="numeric"
                                    autoFocus
                                    value={whole}
                                    placeholder="0"
                                    onChange={(event) => setWhole(event.target.value)}
                                />
                            </label>
                            <span className="dlg__plus" aria-hidden="true">
                                y
                            </span>
                            <label className="dlg__part">
                                <span>Suelto ({unit})</span>
                                <input
                                    id="amount-dialog-loose"
                                    className="dlg__input"
                                    type="text"
                                    inputMode="decimal"
                                    value={loose}
                                    placeholder="0"
                                    onChange={(event) => setLoose(event.target.value)}
                                />
                            </label>
                        </div>
                        <p className="dlg__total">
                            Cada {presentation.name} trae {presentation.size.toLocaleString("es-PA")} {unit}.
                            {total !== null && Number.isFinite(total) ? ` Total: ${total.toLocaleString("es-PA")} ${unit}.` : ""}
                        </p>
                    </>
                ) : (
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
                )}

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
