import { useState } from "react";

import {
    formatCash,
    formatClock,
    getPaymentsSummary,
    getShiftEntries,
    getWebOrderPaymentLabel,
} from "@/helpers";
import type { IShiftDetail, IShiftTicket } from "@/helpers";

/** Cuántas cuentas cobradas se ven de entrada; el resto se abre con "Ver todas". */
const SHIFT_TICKETS_SHOWN = 8;

interface IShiftTicketsCardProps {
    shift: IShiftDetail;
    onRefund: (ticket: IShiftTicket) => void;
}

/** Las cuentas cobradas del turno y los pedidos web, la más reciente arriba, con su reembolso a mano. */
export const ShiftTicketsCard = ({ shift, onRefund }: IShiftTicketsCardProps) => {
    const [showAll, setShowAll] = useState(false);
    const entries = getShiftEntries(shift);
    const shown = showAll ? entries : entries.slice(0, SHIFT_TICKETS_SHOWN);

    return (
        <section className="ges-card">
            <h2>Cuentas cobradas</h2>
            <p className="ges-field__hint">
                Las de este turno y los pedidos web. Si una del local se cobró por error, se reembolsa completa. Lo de la web
                pagado por Yappy no pasa por el cajón; lo de WhatsApp cobrado en efectivo, sí.
            </p>

            <div className="ges-rows">
                {entries.length === 0 ? (
                    <p className="ges-empty">Ninguna todavía.</p>
                ) : (
                    shown.map((entry) => {
                        if (entry.kind === "web") {
                            const order = entry.order;
                            return (
                                <div className="ges-r is-ticket is-web" key={`web-${order.id}`}>
                                    <span>
                                        <span className="ges-tag is-web">Web</span>
                                        {order.customerName} · #{order.id}{" "}
                                        <em>
                                            {getWebOrderPaymentLabel(order)} · {order.isDelivery ? "delivery" : "retiro"} · {formatClock(order.paidAt)}
                                        </em>
                                    </span>
                                    <span className="ges-r__end">
                                        <b>{formatCash(order.total)}</b>
                                    </span>
                                </div>
                            );
                        }

                        const one = entry.ticket;
                        return one.status === "reembolsada" ? (
                            <div className="ges-r is-ticket is-refunded" key={one.id}>
                                <span>
                                    {one.label}{" "}
                                    <em>
                                        {getPaymentsSummary(one.payments)} · reembolsada por {one.refundedByName}
                                        {one.refundedAt ? ` · ${formatClock(one.refundedAt)}` : ""} · “{one.refundReason}”
                                        {one.refundPending ? " · Loyverse pendiente" : ""}
                                    </em>
                                </span>
                                <span className="ges-r__end">
                                    <span className="ges-tag is-crit">Reembolsada</span>
                                    <b>{formatCash(one.total)}</b>
                                </span>
                            </div>
                        ) : (
                            <div className="ges-r is-ticket" key={one.id}>
                                <span>
                                    {one.label}{" "}
                                    <em>
                                        {getPaymentsSummary(one.payments)} · {one.closedByName}
                                        {one.closedAt ? ` · ${formatClock(one.closedAt)}` : ""}
                                    </em>
                                </span>
                                <span className="ges-r__end">
                                    <b>{formatCash(one.total)}</b>
                                    <button type="button" className="ges-btn ges-btn--sm" onClick={() => onRefund(one)}>
                                        Reembolsar
                                    </button>
                                </span>
                            </div>
                        );
                    })
                )}
            </div>

            {entries.length > SHIFT_TICKETS_SHOWN ? (
                <button type="button" className="ges-btn" onClick={() => setShowAll(!showAll)}>
                    {showAll ? "Ver menos" : `Ver todas (${entries.length})`}
                </button>
            ) : null}
        </section>
    );
};
