import { useSectionTab } from "./use-section-tab";
import type { ISectionTab } from "./use-section-tab";

export type SalesTab = "ventas" | "cierres";

export const SALES_TABS: ISectionTab<SalesTab>[] = [
    { id: "ventas", label: "Ventas" },
    { id: "cierres", label: "Cierres" },
];

/** La pestaña abierta de Ventas: el encabezado la usa para mostrar el período solo donde sirve. */
export const useSalesTab = () => useSectionTab(SALES_TABS);
