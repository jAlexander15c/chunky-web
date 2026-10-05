import { useRef, useState } from "react";

import { HttpError, formatQuantity } from "@/helpers";
import { discardExpiredLots } from "@/helpers/inventory";
import { getExpiredAgoLabel, groupExpiredLots } from "@/helpers/product-waste";
import type { IExpiredLot } from "@/helpers/product-waste";

interface IExpiredLotsDialogProps {
    token: string;
    /** Los lotes que se ven en el aviso: esos mismos son los que se botan. */
    lots: IExpiredLot[];
    onDiscarded: () => Promise<void>;
    onSessionExpired: () => void;
    onClose: () => void;
}

/** Confirmación antes de botar: nada se bota solo, y se ve cuántas unidades de qué. */
export const ExpiredLotsDialog = ({ token, lots, onDiscarded, onSessionExpired, onClose }: IExpiredLotsDialogProps) => {
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [skipped, setSkipped] = useState<number | null>(null);
    // Un reintento tras perder la respuesta no bota dos veces
    const requestId = useRef(crypto.randomUUID());
    const groups = groupExpiredLots(lots);
    const total = groups.reduce((sum, group) => sum + group.quantity, 0);

    const submit = async () => {
        setIsSending(true);
        setError("");
        try {
            const result = await discardExpiredLots(
                token,
                lots.map((lot) => lot.batchId),
                requestId.current
            );
            await onDiscarded();
            if (result.skipped.length > 0) {
                setSkipped(result.skipped.length);
                setIsSending(false);
                return;
            }
            onClose();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos botar los lotes. Puedes reintentar.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Botar como vencido">
            <div className="ges-modal__panel">
                <h3 className="script">Botar como vencido</h3>

                {skipped !== null ? (
                    <p className="ges-note" role="status">
                        Listo. {skipped === 1 ? "1 lote ya no estaba" : `${skipped} lotes ya no estaban`} pendiente (alguien lo botó o cambió), así que se dejó como estaba.
                    </p>
                ) : (
                    <>
                        <p className="ges-note">Se restan estas unidades y quedan como merma por vencimiento. Esto no se deshace.</p>
                        <ul className="ges-expired__list" aria-label="Lo que se bota">
                            {groups.map((group) => (
                                <li key={group.variantId}>
                                    <span>
                                        <b>{formatQuantity(group.quantity)}</b> {group.name}
                                    </span>
                                    <small>{getExpiredAgoLabel(group.expirationDate)}</small>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                {skipped !== null ? (
                    <div className="ges-modal__acts ges-modal__acts--one">
                        <button type="button" className="ges-btn ges-btn--solid" onClick={onClose}>
                            Cerrar
                        </button>
                    </div>
                ) : (
                    <div className="ges-modal__acts">
                        <button type="button" className="ges-btn" disabled={isSending} onClick={onClose}>
                            Cancelar
                        </button>
                        <button type="button" className="ges-btn ges-btn--danger" disabled={isSending} onClick={() => void submit()}>
                            {isSending ? "Botando…" : `Botar ${formatQuantity(total)} ${total === 1 ? "unidad" : "unidades"}`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
