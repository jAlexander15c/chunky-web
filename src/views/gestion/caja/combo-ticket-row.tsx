import { formatCash, formatQuantity, getTicketLineTotal } from "@/helpers";
import type { ITicketLine } from "@/helpers";

interface IComboTicketRowProps {
    combo: NonNullable<ITicketLine["combo"]>;
    lines: ITicketLine[];
    isSent: boolean;
    canMove: boolean;
    onQuantity: (quantity: number) => void;
    onMove: () => void;
    onNote: (line: ITicketLine) => void;
}

/** Un combo en la cuenta: la cantidad, quitar y pasar a otra cuenta van por el grupo entero. */
export const ComboTicketRow = ({ combo, lines, isSent, canMove, onQuantity, onMove, onNote }: IComboTicketRowProps) => {
    const quantity = lines[0].quantity;
    const total = lines.reduce((sum, line) => sum + getTicketLineTotal(line), 0);

    return (
        <div className={`ges-tl ges-tl--combo${isSent ? " is-sent" : ""}`}>
            <b>{formatQuantity(quantity)} × Combo {combo.comboName}</b>
            <span className="ges-tl__price">{formatCash(total)}</span>
            <ul className="ges-tl__parts">
                {lines.map((line) => (
                    <li key={line.id}>
                        {line.name}
                        {line.modifiers.length > 0 ? ` · ${line.modifiers.map((one) => one.option).join(", ")}` : ""}
                        {line.note ? <em> · Nota: {line.note}</em> : null}
                        {!isSent ? (
                            <button type="button" className={`ges-tl__part-note${line.note ? " has-note" : ""}`} onClick={() => onNote(line)}>
                                Nota
                            </button>
                        ) : null}
                    </li>
                ))}
            </ul>
            <small>
                {!isSent ? (
                    <>
                        <button type="button" aria-label={`Quitar un combo ${combo.comboName}`} onClick={() => onQuantity(quantity - 1)}>
                            −
                        </button>
                        <em>{formatQuantity(quantity)}</em>
                        <button type="button" aria-label={`Agregar un combo ${combo.comboName}`} onClick={() => onQuantity(quantity + 1)}>
                            +
                        </button>
                    </>
                ) : (
                    <em>{formatQuantity(quantity)}</em>
                )}
                × {formatCash(combo.comboPrice)}
                {canMove ? (
                    <button type="button" className="ges-tl__move" onClick={onMove}>
                        Pasar a…
                    </button>
                ) : null}
            </small>
        </div>
    );
};
