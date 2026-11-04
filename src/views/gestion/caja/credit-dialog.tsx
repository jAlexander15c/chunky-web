import { useState } from "react";

import { HttpError, formatCash } from "@/helpers";
import type { ITicket } from "@/helpers";
import { TicketLinePricing } from "../ticket-pricing";

interface ICreditDialogProps {
    ticket: ITicket;
    onCredit: (customerName: string) => Promise<void>;
    onBack: () => void;
}

/**
 * Deja la cuenta a crédito: se la lleva alguien que paga después. No entra dinero, la mesa
 * queda libre y la cuenta pasa a Créditos, donde se cobra completa en el turno que sea.
 */
export const CreditDialog = ({ ticket, onCredit, onBack }: ICreditDialogProps) => {
    const [name, setName] = useState(ticket.customerName ?? "");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async () => {
        if (!name.trim()) {
            setError("Escribe a nombre de quién queda el crédito.");
            return;
        }

        setIsSending(true);
        setError("");
        try {
            await onCredit(name.trim());
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo dejar a crédito.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Dejar a crédito">
            <div className="ges-modal__panel">
                <h3 className="script">Dejar a crédito</h3>

                <div className="ges-total">
                    <span>Queda debiendo</span>
                    <b>{formatCash(ticket.total)}</b>
                </div>

                <div className="ges-rows">
                    {ticket.lines.map((line) => (
                        <div className="ges-tl" key={line.id}>
                            <TicketLinePricing line={line} showQuantity />
                        </div>
                    ))}
                </div>

                <label className="ges-field">
                    <span>¿Quién la debe?</span>
                    <input
                        id="caja-credito-nombre"
                        type="text"
                        autoFocus
                        maxLength={40}
                        value={name}
                        placeholder="Nombre y apellido"
                        onChange={(event) => { setName(event.target.value); setError(""); }}
                    />
                </label>

                <p className="ges-note">
                    No entra dinero ahora. La mesa queda libre y la cuenta pasa a <b>Créditos</b> hasta que se cobre.
                </p>

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onBack} disabled={isSending}>Volver</button>
                    <button
                        type="button"
                        className="ges-btn ges-btn--solid"
                        onClick={() => void submit()}
                        disabled={isSending}
                    >
                        {isSending ? "Guardando…" : "Dejar a crédito"}
                    </button>
                </div>
            </div>
        </div>
    );
};
