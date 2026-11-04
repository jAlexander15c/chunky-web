import { formatCash, formatQuantity } from "@/helpers";
import type { ITicketLine } from "@/helpers";
import { TicketLinePricing } from "../ticket-pricing";
import { ComboTicketRow } from "./combo-ticket-row";
import { getTicketRows } from "./helpers";

interface ITicketLinesProps {
    lines: ITicketLine[];
    pending: ITicketLine[];
    sent: ITicketLine[];
    isDelivered: boolean;
    tableNumber: number | null;
    onChangeQuantity: (lineId: number, quantity: number) => void;
    onMove: (line: ITicketLine) => void;
    onNote: (line: ITicketLine) => void;
}

/** Lo que lleva la cuenta: primero lo que falta enviar a cocina, luego lo ya enviado. */
export const TicketLines = ({ lines, pending, sent, isDelivered, tableNumber, onChangeQuantity, onMove, onNote }: ITicketLinesProps) => (
        <div className="ges-ticket__list">
            {lines.length === 0 ? (
                <p className="ges-empty">Toca un producto para agregarlo.</p>
            ) : (
                <>
                    {pending.length > 0 ? (
                        <>
                            <p className="ges-grp is-pend">Por enviar a cocina</p>
                            {getTicketRows(pending).map((row) => {
                                if ("lines" in row) {
                                    return (
                                        <ComboTicketRow
                                            key={row.combo.groupKey}
                                            combo={row.combo}
                                            lines={row.lines}
                                            isSent={false}
                                            canMove={tableNumber !== null}
                                            onQuantity={(quantity) => onChangeQuantity(row.lines[0].id, quantity)}
                                            onMove={() => onMove({ ...row.lines[0], name: `Combo ${row.combo.comboName}` })}
                                            onNote={onNote}
                                        />
                                    );
                                }
                                const { line } = row;
                                return (
                                <div className="ges-tl" key={line.id}>
                                    <TicketLinePricing line={line} />
                                    <small>
                                        <button
                                            type="button"
                                            aria-label={`Quitar uno de ${line.name}`}
                                            onClick={() => onChangeQuantity(line.id, line.quantity - 1)}
                                        >
                                            −
                                        </button>
                                        <em>{formatQuantity(line.quantity)}</em>
                                        <button
                                            type="button"
                                            aria-label={`Agregar uno de ${line.name}`}
                                            onClick={() => onChangeQuantity(line.id, line.quantity + 1)}
                                        >
                                            +
                                        </button>
                                        {line.modifiers.length > 0
                                            ? line.modifiers.map((one) => one.option).join(", ")
                                            : `× ${formatCash(line.unitPrice)}`}
                                        <span className="ges-tl__acts">
                                            <button
                                                type="button"
                                                className={`ges-tl__move${line.note ? " has-note" : ""}`}
                                                onClick={() => onNote(line)}
                                            >
                                                Nota
                                            </button>
                                            {tableNumber !== null ? (
                                                <button type="button" className="ges-tl__move" onClick={() => onMove(line)}>
                                                    Pasar a…
                                                </button>
                                            ) : null}
                                        </span>
                                    </small>
                                    {line.note ? <p className="ges-tl__note">{line.note}</p> : null}
                                </div>
                                );
                            })}
                        </>
                    ) : null}

                    {sent.length > 0 ? (
                        <>
                            <p className="ges-grp">{isDelivered ? "Entregado · pendiente de pago" : "Ya está en cocina"}</p>
                            {getTicketRows(sent).map((row) => {
                                if ("lines" in row) {
                                    return (
                                        <ComboTicketRow
                                            key={row.combo.groupKey}
                                            combo={row.combo}
                                            lines={row.lines}
                                            isSent
                                            canMove={tableNumber !== null}
                                            onQuantity={() => undefined}
                                            onMove={() => onMove({ ...row.lines[0], name: `Combo ${row.combo.comboName}` })}
                                            onNote={onNote}
                                        />
                                    );
                                }
                                const { line } = row;
                                return (
                                <div className="ges-tl is-sent" key={line.id}>
                                    <TicketLinePricing line={line} />
                                    <small>
                                        <em>{formatQuantity(line.quantity)}</em> × {formatCash(line.unitPrice)}
                                        {line.modifiers.length > 0 ? ` · ${line.modifiers.map((one) => one.option).join(", ")}` : ""}
                                        {tableNumber !== null ? (
                                            <button type="button" className="ges-tl__move" onClick={() => onMove(line)}>
                                                Pasar a…
                                            </button>
                                        ) : null}
                                    </small>
                                    {line.note ? <p className="ges-tl__note">{line.note}</p> : null}
                                </div>
                                );
                            })}
                        </>
                    ) : null}
                </>
            )}
        </div>
);
