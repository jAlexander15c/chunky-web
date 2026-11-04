import { useEffect, useState } from "react";

import { HttpError, fetchTicket, formatCash, refundTicket } from "@/helpers";
import type { IShiftDetail, IShiftTicket, ITicketLine, ITicketPayment, PaymentMethod } from "@/helpers";
import { OpsSkeleton } from "@/components";
import { TicketLinePricing } from "../ticket-pricing";
import { roundMoney } from "./helpers";

const REFUND_CHANNEL: Record<PaymentMethod, string> = {
    efectivo: "en efectivo del cajón",
    tarjeta: "por tarjeta",
    yappy: "por Yappy",
};

/** "Devuelve $6.00 en efectivo del cajón y $8.00 por Yappy.": lo que el cajero tiene que devolver. */
const getRefundInstructions = (payments: ITicketPayment[]) => {
    const parts = payments.map((one) => `${formatCash(one.amount)} ${REFUND_CHANNEL[one.method]}`);
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0];
    const cash = roundMoney(
        payments.filter((one) => one.method === "efectivo").reduce((sum, one) => sum + one.amount, 0)
    );
    return `Devuelve ${joined}.${cash > 0 ? ` El efectivo esperado baja ${formatCash(cash)}.` : ""}`;
};

interface IRefundDialogProps {
    token: string;
    ticket: IShiftTicket;
    onRefunded: (shift: IShiftDetail | null) => void;
    onClose: () => void;
    onSessionExpired: () => void;
}

/** Devuelve completa una cuenta cobrada por error. Muestra lo que tenía y cuánto vuelve por cada método. */
export const RefundDialog = ({ token, ticket, onRefunded, onClose, onSessionExpired }: IRefundDialogProps) => {
    const [lines, setLines] = useState<ITicketLine[] | null>(null);
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        fetchTicket(token, ticket.id, controller.signal)
            .then((data) => setLines(data.ticket.lines))
            .catch((requestError) => {
                if (controller.signal.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError("No pudimos leer las líneas de la cuenta.");
            });
        return () => controller.abort();
    }, [token, ticket.id, onSessionExpired]);

    const submit = async () => {
        if (reason.trim().length < 3) {
            setError("Escribe por qué se reembolsa.");
            return;
        }

        setIsSending(true);
        setError("");
        try {
            const data = await refundTicket(token, ticket.id, reason.trim());
            onRefunded(data.shift);
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo reembolsar.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Reembolsar ${ticket.label}`}>
            <div className="ges-modal__panel">
                <h3 className="script">Reembolsar {ticket.label}</h3>

                <div className="ges-rows">
                    {lines === null ? (
                        <OpsSkeleton label="Cargando la cuenta…" />
                    ) : (
                        lines.map((line) => (
                            <div className="ges-tl" key={line.id}>
                                <TicketLinePricing line={line} showQuantity />
                            </div>
                        ))
                    )}
                    <div className="ges-r is-big"><span>Se devuelve</span><b>{formatCash(ticket.total)}</b></div>
                </div>

                {ticket.payments?.length ? (
                    <p className="ges-warn">{getRefundInstructions(ticket.payments)}</p>
                ) : null}

                <label className="ges-field">
                    <span>Motivo</span>
                    <input
                        id="turno-reembolso-motivo"
                        type="text"
                        autoFocus
                        value={reason}
                        placeholder="Se cobró a la mesa equivocada"
                        onChange={(event) => setReason(event.target.value)}
                    />
                </label>

                <p className="ges-note">
                    En Loyverse queda un recibo de reembolso ligado al original y los productos vuelven al stock.
                    Si algo sí se entregó, regístralo como merma en Inventario. No se puede deshacer.
                </p>

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button
                        type="button"
                        className="ges-btn ges-btn--danger"
                        onClick={() => void submit()}
                        disabled={isSending}
                    >
                        {isSending ? "Reembolsando…" : `Reembolsar ${formatCash(ticket.total)}`}
                    </button>
                </div>
            </div>
        </div>
    );
};
