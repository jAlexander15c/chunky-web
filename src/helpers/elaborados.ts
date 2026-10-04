import { formatQuantity } from "./admin";

/** Cómo se lee la unidad de un elaborado. */
export const getIntermediateUnitLabel = (unit: string) => (unit === "portion" ? "porciones" : unit === "unit" ? "u" : unit);

export interface IBatchShortcut {
    batches: number;
    /** En la unidad del elaborado, listo para el campo. */
    value: string;
    label: string;
}

/** Los atajos de "¿Cuánto preparaste?": 1, 2 y 3 tandas de la receta. */
export const getBatchShortcuts = (yieldQuantity: string | null | undefined, unit: string): IBatchShortcut[] => {
    const perBatch = Number(yieldQuantity);
    if (!(perBatch > 0)) return [];
    const unitLabel = getIntermediateUnitLabel(unit);
    return [1, 2, 3].map((batches) => {
        const value = formatQuantity(perBatch * batches);
        return { batches, value, label: `${batches} tanda${batches === 1 ? "" : "s"} · ${value} ${unitLabel}` };
    });
};

/** Una cantidad escrita en el campo, o null si todavía no es un número positivo. */
export const parsePositiveAmount = (value: string) => {
    const amount = Number(value.replace(",", "."));
    return value.trim() && Number.isFinite(amount) && amount > 0 ? amount : null;
};
