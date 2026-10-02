import { FINANCE_MAX_DAYS, FINANCE_PERIODS, getPanamaToday, getPeriodRange } from "./admin";
import type { FinancePeriod } from "./admin";

/** Un atajo ("30 días") o fechas elegidas a mano: un solo día o un rango. */
export type PeriodSelection = { kind: "preset"; period: FinancePeriod } | { kind: "custom"; from: string; to: string };

const STORAGE_KEY = "chunky-admin-period";
/** Las claves de antes, cuando Finanzas y Web elegían cada una su período: se respeta lo último que se eligió. */
const LEGACY_STORAGE_KEYS = ["chunky-admin-finance-period", "chunky-admin-web-period"];
const DEFAULT_SELECTION: PeriodSelection = { kind: "preset", period: "30d" };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isFinancePeriod = (value: unknown): value is FinancePeriod => FINANCE_PERIODS.some((period) => period.id === value);

const getDayCount = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

/** Qué está mal en un rango elegido a mano, o null si se puede pedir. */
export const getRangeError = (from: string, to: string, today: string) => {
    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) return "Elige las fechas.";
    if (from > to) return "La fecha de inicio va antes que la final.";
    if (to > today) return "Todavía no hay datos de días que no han pasado.";
    if (getDayCount(from, to) > FINANCE_MAX_DAYS) return "El rango es de hasta un año.";
    return null;
};

/** El primer y el último día (incluidos) de lo elegido. */
export const getSelectionRange = (selection: PeriodSelection) =>
    selection.kind === "preset" ? getPeriodRange(selection.period) : { from: selection.from, to: selection.to };

export const readStoredSelection = (): PeriodSelection => {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored?.startsWith("{")) {
            const parsed = JSON.parse(stored) as Partial<{ kind: string; period: string; from: string; to: string }>;
            if (parsed.kind === "preset" && isFinancePeriod(parsed.period)) return { kind: "preset", period: parsed.period };
            if (parsed.kind === "custom" && parsed.from && parsed.to && !getRangeError(parsed.from, parsed.to, getPanamaToday())) {
                return { kind: "custom", from: parsed.from, to: parsed.to };
            }
        }

        // Antes se guardaba solo el id del atajo, sin JSON
        const legacy = [stored, ...LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key))].find(isFinancePeriod);
        return legacy ? { kind: "preset", period: legacy } : DEFAULT_SELECTION;
    } catch {
        return DEFAULT_SELECTION;
    }
};

export const storeSelection = (selection: PeriodSelection) => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
        return;
    }
};
