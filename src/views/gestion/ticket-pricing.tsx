import { formatCash, formatQuantity, getTicketLineSubtotal, getTicketLineTotal } from "@/helpers";
import type { ITicket, ITicketLine } from "@/helpers";

/** La Caja muestra los descuentos del API, sin decidir ni recalcular promos. */
export const TicketLinePricing = ({ line, showQuantity = false }: { line: ITicketLine; showQuantity?: boolean }) => {
    const paidQuantity = line.quantity - line.freeQuantity;
    const subtotal = getTicketLineSubtotal(line);
    const hasPercent = line.discount > 0 && line.freeQuantity === 0;

    return (
        <>
            {paidQuantity > 0 ? (
                <>
                    <b>{showQuantity || line.freeQuantity > 0 ? `${formatQuantity(paidQuantity)} × ` : ""}{line.name}</b>
                    <span className="ges-tl__price">
                        {hasPercent ? <del>{formatCash(subtotal)}</del> : null}
                        {formatCash(getTicketLineTotal(line))}
                    </span>
                    {hasPercent ? <span className="ges-promo-chip">{line.promoLabel} · {line.promoName}</span> : null}
                </>
            ) : null}
            {line.freeQuantity > 0 ? (
                <div className="ges-tl__free">
                    <b>{formatQuantity(line.freeQuantity)} × {line.name}</b>
                    <span className="ges-tl__price"><del>{formatCash(line.discount)}</del>{formatCash(0)}</span>
                    <span className="ges-promo-chip">Gratis · {line.promoLabel}</span>
                </div>
            ) : null}
        </>
    );
};

export const TicketTotals = ({ ticket }: { ticket: ITicket }) => {
    const names = [...new Set(ticket.lines.filter((line) => line.discount > 0).map((line) => line.promoName).filter(Boolean))];

    return (
        <>
            <div className="ges-promo-total"><span>Productos</span><span>{formatCash(ticket.subtotal)}</span></div>
            {ticket.discount > 0 ? (
                <div className="ges-promo-total"><span>{names.length === 1 ? `Promo ${names[0]}` : "Promos"}</span><span>−{formatCash(ticket.discount)}</span></div>
            ) : null}
            <div className="ges-total"><span>Total</span><b>{formatCash(ticket.total)}</b></div>
        </>
    );
};
