import { useState } from "react";

import { HttpError } from "@/helpers";
import { getLowerLabel } from "./helpers";

interface IVoidDialogProps {
    label: string;
    onVoid: (reason: string) => Promise<void>;
    onClose: () => void;
}

/** Anular queda registrado con motivo y con quién lo hizo: es dinero que no se cobra. */
export const VoidDialog = ({ label, onVoid, onClose }: IVoidDialogProps) => {
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async () => {
        if (reason.trim().length < 3) {
            setError("Escribe por qué se anula.");
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onVoid(reason.trim());
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo anular.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Anular la cuenta">
            <div className="ges-modal__panel">
                <h3 className="script">Anular {getLowerLabel(label)}</h3>
                <p className="ges-note">
                    La cuenta se cierra sin cobrar y queda registrada con tu nombre. Si algo ya salió de
                    cocina, se pierde.
                </p>
                <label className="ges-field">
                    <span>Por qué</span>
                    <input
                        id="caja-motivo"
                        type="text"
                        autoFocus
                        value={reason}
                        placeholder="El cliente se fue"
                        onChange={(event) => setReason(event.target.value)}
                    />
                </label>
                {error ? <p className="ges-error" role="alert">{error}</p> : null}
                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Volver</button>
                    <button type="button" className="ges-btn ges-btn--solid" onClick={() => void submit()} disabled={isSending}>
                        {isSending ? "Anulando…" : "Anular la cuenta"}
                    </button>
                </div>
            </div>
        </div>
    );
};
