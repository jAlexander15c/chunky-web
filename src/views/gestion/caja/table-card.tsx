import { formatCash, formatQuantity } from "@/helpers";
import type { ITableSummary } from "@/helpers";
import { formatWaiting } from "./helpers";

interface ITableCardProps {
    table: ITableSummary;
    hasShift: boolean;
    onOpen: () => void;
}

/** Una mesa (o una cuenta para llevar) del mapa. */
export const TableCard = ({ table, hasShift, onOpen }: ITableCardProps) => {
    const busy = table.ticketId !== null;
    const isTogo = table.tableNumber === null;
    // Todo enviado y entregado, pero la cuenta sigue abierta: falta cobrarla
    const isDue = busy && table.items > 0 && table.pending === 0 && table.inKitchen === 0;
    const tone =
        busy && table.items > 0 ? (table.pending > 0 ? " is-busy" : isDue ? " is-due" : " is-ready") : busy ? " is-busy" : "";

    return (
        <button
            key={table.ticketId ?? table.label}
            type="button"
            className={`ges-table${tone}${isTogo ? " ges-table--togo" : ""}`}
            // Sin turno no se abre una cuenta nueva; una que quedó abierta sí, para anularla
            disabled={!hasShift && !busy}
            onClick={onOpen}
        >
            <span className="ges-table__n">{isTogo ? "Para llevar" : table.label}</span>
            {isTogo ? <span className="ges-table__who">{table.customerName || `#${table.ticketId}`}</span> : null}
            {table.accounts > 1 ? <span className="ges-table__accounts">{table.accounts} cuentas</span> : null}
            {busy ? (
                <>
                    <span className="ges-table__t">{formatCash(table.total)}</span>
                    {table.paidAmount > 0 ? (
                        <span className="ges-table__paid">Pagado {formatCash(table.paidAmount)}</span>
                    ) : null}
                    <span className="ges-table__m">
                        {formatQuantity(table.items)} platos
                        {table.openedAt ? ` · ${formatWaiting(table.openedAt)}` : ""}
                    </span>
                    {table.pending > 0 ? (
                        <span className="ges-table__pend">{table.pending} por enviar</span>
                    ) : isDue ? (
                        <span className="ges-table__due">Pendiente de pago</span>
                    ) : table.items > 0 ? (
                        <span className="ges-table__ok">En cocina</span>
                    ) : null}
                </>
            ) : (
                <span className="ges-table__free">Libre</span>
            )}
        </button>
    );
};
