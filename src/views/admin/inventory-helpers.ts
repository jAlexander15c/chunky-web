import { useEffect, useState } from "react";
import type { IMovement, ISupplyStatus, MovementType, ProductState, SupplyCategory, SupplyState } from "@/helpers";

/** La cocina carga producción mientras alguien mira: se refresca solo. */
export const REFRESH_MS = 60000;
export const TABLE_PAGE_SIZE = 8;
export const MOVEMENTS_PAGE_SIZE = 10;
export const SEARCH_DEBOUNCE_MS = 300;

export const SUPPLY_CATEGORIES: SupplyCategory[] = ["alimento", "limpieza", "mantenimiento"];

export const SUPPLY_STATE_LABEL: Record<SupplyState, string> = {
    comprar: "Comprar",
    pedir: "Pedir pronto",
    contar: "Contar",
    bien: "Bien",
};

export const SUPPLY_STATE_TONE: Record<SupplyState, string> = {
    comprar: "crit",
    pedir: "warn",
    contar: "warn",
    bien: "ok",
};

/** Lo urgente primero: así se leen en "Primero lo urgente". */
export const SUPPLY_STATE_ORDER: SupplyState[] = ["comprar", "pedir", "contar", "bien"];

/** La barra de "Alcanza" se llena del todo con esta cantidad de días: más que eso ya no preocupa. */
export const COVERAGE_FULL_DAYS = 14;

type CoverageTone = "crit" | "warn" | "ok";

/**
 * De qué color va la barra de "Alcanza" según los días que quedan al ritmo de consumo actual.
 * TODO(usuario): decidir los cortes. Dependen de cuánto tarda cada proveedor en entregar.
 */
export const getCoverageTone = (daysLeft: number): CoverageTone => {
    if (daysLeft < 3) return "crit";
    if (daysLeft < 7) return "warn";
    return "ok";
};

export const PRODUCT_STATE_LABEL: Record<ProductState, string> = {
    agotado: "Agotado",
    poco: "Queda poco",
    disponible: "A la venta",
    "sin-control": "Sin control",
};

export const PRODUCT_STATE_TONE: Record<ProductState, string> = {
    agotado: "crit",
    poco: "warn",
    disponible: "ok",
    "sin-control": "idle",
};

export const PRODUCT_STATES: ProductState[] = ["agotado", "poco", "disponible", "sin-control"];

export const MOVEMENT_LABEL: Record<MovementType, string> = {
    compra: "Compra",
    conteo: "Conteo",
    produccion: "Producción",
    venta: "Venta",
    merma: "Merma",
    ajuste: "Ajuste",
    consumo:"Consumo de receta",vencimiento:"Vencimiento",faltante:"Faltante",
};

export const MOVEMENT_TYPES: MovementType[] = ["compra", "conteo", "produccion", "venta", "merma", "ajuste","consumo","vencimiento","faltante"];

export const getMovementOrigin = (movement: IMovement) => {
    const from = movement.source === "web" ? "web" : movement.source === "loyverse" ? "mostrador" : "local";
    return movement.reference ? `${movement.reference} · ${from}` : from;
};

export type SupplySort = "urgente" | "nombre" | "dias" | "conteo";

export const SUPPLY_SORTS: { id: SupplySort; label: string }[] = [
    { id: "urgente", label: "Primero lo urgente" },
    { id: "nombre", label: "Nombre A–Z" },
    { id: "dias", label: "Alcanza menos días" },
    { id: "conteo", label: "Conteo más viejo" },
];

/** Sin dato se va al final: un insumo sin conteos no es el que menos dura. */
const compareNullable = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);

export const getSortedSupplies = (supplies: ISupplyStatus[], sort: SupplySort) =>
    [...supplies].sort((a, b) => {
        if (sort === "nombre") return a.name.localeCompare(b.name, "es");
        if (sort === "dias") return compareNullable(a.daysLeft, b.daysLeft) || a.name.localeCompare(b.name, "es");
        // El conteo más viejo primero; nunca contado es lo más viejo que hay
        if (sort === "conteo") return (b.countAge ?? Infinity) - (a.countAge ?? Infinity) || a.name.localeCompare(b.name, "es");
        return (
            SUPPLY_STATE_ORDER.indexOf(a.state) - SUPPLY_STATE_ORDER.indexOf(b.state) ||
            compareNullable(a.daysLeft, b.daysLeft) ||
            a.name.localeCompare(b.name, "es")
        );
    });

/** Sin tildes ni mayúsculas: "azucar" encuentra "Azúcar". */
export const getSearchKey = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();

export const useDebouncedValue = (value: string, delay: number) => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);

    return debounced;
};
