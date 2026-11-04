import { useState } from "react";

import { HttpError } from "@/helpers";
import { getLowerLabel } from "./helpers";

interface INewAccountDialogProps {
    tableLabel: string;
    /** La mesa tenía una sola cuenta sin nombre: se ofrece ponérselo de paso. */
    askCurrentName: boolean;
    onOpen: (customerName: string, currentName: string) => Promise<void>;
    onClose: () => void;
}

export const NewAccountDialog = ({ tableLabel, askCurrentName, onOpen, onClose }: INewAccountDialogProps) => {
    const [customerName, setCustomerName] = useState("");
    const [currentName, setCurrentName] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async () => {
        setIsSending(true);
        setError("");
        try {
            await onOpen(customerName.trim(), currentName.trim());
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo abrir la cuenta.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Nueva cuenta en ${tableLabel}`}>
            <form
                className="ges-modal__panel"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <h3 className="script">Nueva cuenta en {getLowerLabel(tableLabel)}</h3>
                <p className="ges-note">Para un grupo que paga por separado. Cada cuenta se cobra sola.</p>
                <label className="ges-field">
                    <span>A nombre de</span>
                    <input
                        id="caja-cuenta-nombre"
                        type="text"
                        autoFocus
                        maxLength={40}
                        autoComplete="off"
                        value={customerName}
                        placeholder="Luis"
                        onChange={(event) => setCustomerName(event.target.value)}
                    />
                    <small className="ges-field__hint">Opcional. Sin nombre sale con su número de cuenta.</small>
                </label>
                {askCurrentName ? (
                    <label className="ges-field">
                        <span>Y la cuenta que ya estaba, a nombre de</span>
                        <input
                            id="caja-cuenta-actual"
                            type="text"
                            maxLength={40}
                            autoComplete="off"
                            value={currentName}
                            placeholder="Ana"
                            onChange={(event) => setCurrentName(event.target.value)}
                        />
                        <small className="ges-field__hint">Opcional, para distinguirlas en cocina y en el recibo.</small>
                    </label>
                ) : null}
                {error ? <p className="ges-error" role="alert">{error}</p> : null}
                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="ges-btn ges-btn--solid" disabled={isSending}>
                        {isSending ? "Abriendo…" : "Abrir cuenta"}
                    </button>
                </div>
            </form>
        </div>
    );
};
