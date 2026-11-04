import { formatCash } from "@/helpers";
import type { IPublicCombo, ITableAccount, ITicketLine, PaymentMethod } from "@/helpers";

export const PAYMENT_METHODS: PaymentMethod[] = ["efectivo", "tarjeta", "yappy"];

/** "Mesa 3" -> "mesa 3" y "Para llevar · Ana" -> "para llevar · Ana": el nombre se respeta. */
export const getLowerLabel = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

const getMinutesSince = (value: string) => Math.floor((Date.now() - new Date(value).getTime()) / 60000);

/** "hace 5 min" o "hace 1 h 10", que es como se mira si una mesa lleva rato esperando. */
export const formatWaiting = (value: string) => {
    const minutes = getMinutesSince(value);
    if (minutes < 1) return "recién";
    if (minutes < 60) return `hace ${minutes} min`;
    return `hace ${Math.floor(minutes / 60)} h ${minutes % 60}`;
};

/** "Galleta New York" -> "GN". Va en lugar de la foto cuando el producto no tiene una en Loyverse. */
export const getItemInitials = (name: string) => {
    const words = name.split(/\s+/).filter((word) => word.length > 2);
    return (words.length ? words : [name]).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
};

export const roundMoney =(value: number) => Math.round(value * 100) / 100;

export const parseAmount = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
};

/** "8:12 p. m.": a qué hora se registró un pago por partes. */
export const formatPaymentTime = (value?: string) =>
    value ? new Date(value).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", hour12: true }) : "";

/** "Desde $4.73 · −10 %" (sin "Desde" si el precio no cambia según lo que se elija). */
export const formatComboFrom = (combo: IPublicCombo) =>
    `${combo.priceVaries ? "Desde " : ""}${formatCash(combo.price)}${combo.discountPercent > 0 ? ` · −${combo.discountPercent} %` : ""}`;

/** Cómo se nombra una cuenta dentro de su mesa: su nombre, o "Sin nombre" la primera. */
export const getAccountName = (account: Pick<ITableAccount, "customerName">) => account.customerName || "Sin nombre";

/** Largo máximo de la nota de un plato (lo mismo que acepta la API). */
export const LINE_NOTE_MAX = 120;

type TicketRow = { line: ITicketLine } | { combo: NonNullable<ITicketLine["combo"]>; lines: ITicketLine[] };

/** Las líneas de un mismo combo se muestran juntas, en el lugar de la primera. */
export const getTicketRows = (lines: ITicketLine[]) =>
    lines.reduce<TicketRow[]>((rows, line) => {
        if (!line.combo) return [...rows, { line }];
        const group = rows.find((row) => "lines" in row && row.combo.groupKey === line.combo!.groupKey);
        if (group && "lines" in group) {
            group.lines.push(line);
            return rows;
        }
        return [...rows, { combo: line.combo, lines: [line] }];
    }, []);
