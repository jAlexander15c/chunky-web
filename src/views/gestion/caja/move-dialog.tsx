import { useState } from "react";

import { HttpError, formatCash } from "@/helpers";
import type { ITableAccount, ITicketLine } from "@/helpers";
import { getAccountName } from "./helpers";

/** A dónde va el plato: otra cuenta de la mesa, o una nueva con este nombre. */
type IMoveTarget = { ticketId: number } | { newName: string };

interface IMoveDialogProps {
    line: ITicketLine;
    accounts: ITableAccount[];
    onMove: (target: IMoveTarget, quantity: number) => Promise<void>;
    onClose: () => void;
}

/** Pasa un plato, o parte de sus unidades, a otra cuenta de la misma mesa. */
export const MoveDialog = ({ line, accounts, onMove, onClose }: IMoveDialogProps) => {
    const [quantity, setQuantity] = useState(1);
    const [targetId, setTargetId] = useState<number | "new">(accounts[0]?.id ?? "new");
    const [newName, setNewName] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    // Cantidades con decimales (ej. por peso) se pasan completas
    const isWhole = Number.isInteger(line.quantity);
    const units = isWhole ? quantity : line.quantity;
    const target = accounts.find((one) => one.id === targetId);
    const targetName = target ? getAccountName(target) : newName.trim() || "la cuenta nueva";

    const submit = async () => {
        setIsSending(true);
        setError("");
        try {
            await onMove(targetId === "new" ? { newName: newName.trim() } : { ticketId: targetId }, units);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo pasar.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Pasar ${line.name}`}>
            <div className="ges-modal__panel">
                <h3 className="script">Pasar {line.name}</h3>

                {isWhole && line.quantity > 1 ? (
                    <div className="ges-field">
                        <span>Cuántas</span>
                        <div className="ges-qty">
                            <button type="button" aria-label="Una menos" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)}>−</button>
                            <b>{quantity}</b>
                            <button type="button" aria-label="Una más" disabled={quantity >= line.quantity} onClick={() => setQuantity(quantity + 1)}>+</button>
                            <em>de {line.quantity}</em>
                        </div>
                    </div>
                ) : null}

                <div className="ges-field">
                    <span>A la cuenta de</span>
                    <div className="ges-accounts" role="group" aria-label="Cuenta de destino">
                        {accounts.map((one) => (
                            <button
                                key={one.id}
                                type="button"
                                className="ges-account-chip"
                                aria-pressed={targetId === one.id}
                                onClick={() => setTargetId(one.id)}
                            >
                                <b>{getAccountName(one)}</b>
                                <span>{formatCash(one.total)}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            className="ges-account-chip is-add"
                            aria-pressed={targetId === "new"}
                            onClick={() => setTargetId("new")}
                        >
                            + Cuenta nueva
                        </button>
                    </div>
                </div>

                {targetId === "new" ? (
                    <label className="ges-field">
                        <span>A nombre de</span>
                        <input
                            id="caja-pasar-nombre"
                            type="text"
                            maxLength={40}
                            autoComplete="off"
                            value={newName}
                            placeholder="Opcional"
                            onChange={(event) => setNewName(event.target.value)}
                        />
                    </label>
                ) : null}

                <p className="ges-note">
                    Al pasar el plato se actualizarán los totales y las promos de ambas cuentas.
                </p>

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="button" className="ges-btn ges-btn--solid" onClick={() => void submit()} disabled={isSending}>
                        {isSending ? "Pasando…" : `Pasar a ${targetName}`}
                    </button>
                </div>
            </div>
        </div>
    );
};
