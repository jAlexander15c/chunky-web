import type { IMovement, IProductStatus } from "./admin";

/** Por qué se perdió una unidad de un producto por lotes. "vencido" lo pone el aviso de lotes vencidos. */
export type WasteReason = "vencido" | "danado" | "consumo_interno";

/** Los motivos que se eligen a mano al registrar merma (vencido sale del aviso). */
export type ManualWasteReason = Exclude<WasteReason, "vencido">;

export const WASTE_REASON_LABEL: Record<WasteReason, string> = {
    vencido: "Vencido",
    danado: "Se dañó",
    consumo_interno: "Consumo interno",
};

/** Motivos elegibles en el diálogo, con el texto largo de los chips. */
export const MANUAL_WASTE_CHOICES: { id: ManualWasteReason; label: string }[] = [
    { id: "danado", label: "Se dañó o se cayó" },
    { id: "consumo_interno", label: "Consumo interno" },
];

/** Producto por lotes tal como lo devuelve /gestion/products (campos extra de la merma). */
export type IBatchProductStatus = IProductStatus & {
    /** Costo por unidad del último lote; null si nunca se anotó. */
    unitCost?: number | null;
    /** Unidades vencidas que todavía no se botan, como texto ("0" si no hay). */
    expiredStock?: string;
};

/** Movimiento con el motivo de merma cuando es de un producto por lotes. */
export type IWasteMovement = IMovement & { wasteReason?: WasteReason | null };

export interface IExpiredLot {
    batchId: number;
    variantId: string;
    name: string;
    quantity: string;
    expirationDate: string;
}

export interface IExpiredLotsResponse {
    lots: IExpiredLot[];
}

export interface IDiscardedLot {
    batchId: number;
    variantId: string;
    name: string;
    quantity: string;
}

export interface IDiscardExpiredResponse {
    discarded: IDiscardedLot[];
    skipped: number[];
}

export interface IProductWasteInput {
    quantity: number;
    reason: ManualWasteReason;
    note?: string;
    requestId: string;
}

export interface IProductWasteResponse {
    variantId: string;
    quantity: number;
    reason: ManualWasteReason;
    usableStock: string;
    referenceId: string;
}

export type WasteByReason = Record<WasteReason, number>;

export interface IWasteTotals {
    produced: number;
    waste: number;
    percent: number | null;
    cost: number;
    unitsWithoutCost: number;
    byReason: WasteByReason;
}

export interface IWasteProduct {
    variantId: string;
    name: string;
    produced: number;
    waste: number;
    percent: number | null;
    cost: number | null;
    unitsWithoutCost: number;
    byReason: WasteByReason;
}

export interface IWasteReport {
    from: string;
    to: string;
    totals: IWasteTotals;
    products: IWasteProduct[];
}

/** Color del % de merma: desde 10 es crítico, desde 5 es aviso. Sin producción no hay % que juzgar. */
export const getWasteTone = (percent: number | null): "crit" | "warn" | "ok" | "idle" => {
    if (percent === null) return "idle";
    if (percent >= 10) return "crit";
    if (percent >= 5) return "warn";
    return "ok";
};

export const formatWastePercent = (percent: number | null) => (percent === null ? "—" : `${Number(percent.toFixed(1))}%`);

const getPanamaDayNumber = (date: Date) => {
    const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" })
        .format(date)
        .split("-")
        .map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
};

/** "venció hoy", "venció ayer" o "venció hace N días", contando días del calendario de Panamá. */
export const getExpiredAgoLabel = (expirationDate: string, now: Date = new Date()) => {
    const days = getPanamaDayNumber(now) - getPanamaDayNumber(new Date(expirationDate));
    if (days <= 0) return "venció hoy";
    if (days === 1) return "venció ayer";
    return `venció hace ${days} días`;
};

/** Las unidades vencidas llegan como texto ("6" o "6.000"). */
export const getExpiredUnits = (product: { expiredStock?: string }) => {
    const units = Number(product.expiredStock ?? 0);
    return Number.isFinite(units) ? units : 0;
};

/** "1 lote vencido" / "N lotes vencidos". */
export const getExpiredLotsTitle = (count: number) => `${count} ${count === 1 ? "lote vencido" : "lotes vencidos"}`;

/** Lotes vencidos juntos por producto, con la suma de unidades, en el orden en que aparece cada producto. */
export const groupExpiredLots = (lots: IExpiredLot[]) => {
    const groups = new Map<string, { variantId: string; name: string; quantity: number; expirationDate: string }>();
    lots.forEach((lot) => {
        const current = groups.get(lot.variantId);
        const quantity = Number(lot.quantity);
        if (!current) groups.set(lot.variantId, { variantId: lot.variantId, name: lot.name, quantity, expirationDate: lot.expirationDate });
        else {
            current.quantity += quantity;
            // Se muestra lo más viejo: es lo que lleva más tiempo sin botarse
            if (lot.expirationDate < current.expirationDate) current.expirationDate = lot.expirationDate;
        }
    });
    return [...groups.values()];
};
