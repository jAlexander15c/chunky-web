import type { CollaboratorRole, IMovement, IProductStatus, ISupplyStatus } from "./admin";
import { httpGet, httpPost } from "./getHttp";

/** Quién entró: su nombre para el saludo y qué secciones puede ver. */
export interface IGestionSession {
    id: number;
    name: string;
    roles: CollaboratorRole[];
}

/* ============ Caja ============ */

export type PaymentMethod = "efectivo" | "tarjeta" | "yappy";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    yappy: "Yappy",
};

export interface ITicketPayment {
    method: PaymentMethod;
    amount: number;
}

export interface ITicketLine {
    id: number;
    variantId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    modifiers: { modifierOptionId: string; name: string; option: string; price: number }[];
    note: string | null;
    /** Null mientras no se haya mandado a cocina. Lo enviado ya no se edita. */
    sentAt: string | null;
    addedByName: string;
}

export interface ITicket {
    id: number;
    /** Null en una cuenta para llevar. */
    tableNumber: number | null;
    status: "abierta" | "cobrada" | "anulada";
    openedByName: string;
    openedAt: string;
    total: number;
    payments: ITicketPayment[] | null;
    loyverseReceiptNumber: string | null;
    receiptPending: boolean;
    lines: ITicketLine[];
}

export interface ITableSummary {
    tableNumber: number | null;
    label: string;
    ticketId: number | null;
    total: number;
    items: number;
    pending: number;
    openedAt: string | null;
}

export interface ICashMovement {
    id: number;
    type: "entrada" | "salida";
    amount: number;
    reason: string;
    actorName: string;
    createdAt: string;
}

export interface IShift {
    id: number;
    openedByName: string;
    openedAt: string;
    startingCash: number;
    closedByName: string | null;
    closedAt: string | null;
    expectedCash: number | null;
    countedCash: number | null;
    difference: number | null;
}

/** El turno en curso con todo lo que hace falta para cuadrarlo. */
export interface IShiftDetail extends IShift {
    movements: ICashMovement[];
    salesTotal: number;
    salesCount: number;
    /** Solo la parte en efectivo: es la única que toca el cajón. */
    salesCash: number;
    cashIn: number;
    cashOut: number;
    expected: number;
}

const GESTION_TOKEN_STORAGE_KEY = "chunky-gestion-token";
const GESTION_NAME_STORAGE_KEY = "chunky-gestion-nombre";
const GESTION_ROLES_STORAGE_KEY = "chunky-gestion-roles";

const getGestionHeaders = (token: string) => ({ "x-gestion-token": token });

export const getGestionToken = () => {
    try {
        return window.localStorage.getItem(GESTION_TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
};

/** El nombre solo se guarda para saludar antes de la primera respuesta del API. */
export const getGestionName = () => {
    try {
        return window.localStorage.getItem(GESTION_NAME_STORAGE_KEY) ?? "";
    } catch {
        return "";
    }
};

/**
 * Los roles guardados solo deciden qué secciones se ofrecen. Quien manda es el API:
 * si alguien los editara aquí, sus peticiones igual volverían con 403.
 */
export const getGestionRoles = (): CollaboratorRole[] => {
    try {
        const raw = window.localStorage.getItem(GESTION_ROLES_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((role) => role === "inventario" || role === "caja") : [];
    } catch {
        return [];
    }
};

export const setGestionSession = (token: string | null, name = "", roles: CollaboratorRole[] = []) => {
    try {
        if (token) {
            window.localStorage.setItem(GESTION_TOKEN_STORAGE_KEY, token);
            window.localStorage.setItem(GESTION_NAME_STORAGE_KEY, name);
            window.localStorage.setItem(GESTION_ROLES_STORAGE_KEY, JSON.stringify(roles));
        } else {
            window.localStorage.removeItem(GESTION_TOKEN_STORAGE_KEY);
            window.localStorage.removeItem(GESTION_NAME_STORAGE_KEY);
            window.localStorage.removeItem(GESTION_ROLES_STORAGE_KEY);
        }
    } catch {
        return;
    }
};

export const loginGestion = (pin: string) =>
    httpPost<{ token: string; collaborator: IGestionSession }>("/gestion/login", { pin });

export const fetchGestionSupplies = (token: string, signal?: AbortSignal) =>
    httpGet<{ supplies: ISupplyStatus[] }>("/gestion/supplies", { signal, headers: getGestionHeaders(token) });

export const fetchGestionProducts = (token: string, signal?: AbortSignal) =>
    httpGet<{ products: IProductStatus[] }>("/gestion/products", { signal, headers: getGestionHeaders(token) });

/** Solo lo que esta persona cargó hoy: el colaborador no ve el libro completo. */
export const fetchGestionMovements = (token: string, signal?: AbortSignal) =>
    httpGet<{ collaborator: IGestionSession; movements: IMovement[] }>("/gestion/movements", {
        signal,
        headers: getGestionHeaders(token),
    });

export const registerGestionPurchase = (token: string, supplyId: number, quantity: number) =>
    httpPost<{ supply: ISupplyStatus }>(
        `/gestion/supplies/${supplyId}/purchase`,
        { quantity },
        { headers: getGestionHeaders(token) }
    );

export const registerGestionCount = (token: string, supplyId: number, counted: number) =>
    httpPost<{ supply: ISupplyStatus }>(
        `/gestion/supplies/${supplyId}/count`,
        { counted },
        { headers: getGestionHeaders(token) }
    );

export const registerGestionWaste = (token: string, supplyId: number, quantity: number) =>
    httpPost<{ supply: ISupplyStatus }>(
        `/gestion/supplies/${supplyId}/waste`,
        { quantity },
        { headers: getGestionHeaders(token) }
    );

export const registerGestionProduction = (token: string, variantId: string, quantity: number) =>
    httpPost<{ product: IProductStatus }>(
        `/gestion/products/${encodeURIComponent(variantId)}/production`,
        { quantity },
        { headers: getGestionHeaders(token) }
    );

/* ============ Caja: mesas y cuentas ============ */

/** El mapa de mesas y, de paso, el turno en curso: la caja necesita los dos a la vez. */
export const fetchTables = (token: string, signal?: AbortSignal) =>
    httpGet<{ tables: ITableSummary[]; shift: IShiftDetail | null }>("/gestion/caja/mesas", {
        signal,
        headers: getGestionHeaders(token),
    });

/** Trae la cuenta abierta de la mesa, o la abre. El cero es la cuenta para llevar. */
export const openTable = (token: string, tableNumber: number) =>
    httpPost<{ ticket: ITicket }>("/gestion/caja/mesas", { tableNumber }, { headers: getGestionHeaders(token) });

export const fetchTicket = (token: string, ticketId: number, signal?: AbortSignal) =>
    httpGet<{ ticket: ITicket }>(`/gestion/caja/cuentas/${ticketId}`, {
        signal,
        headers: getGestionHeaders(token),
    });

export const addTicketLine = (
    token: string,
    ticketId: number,
    line: { variantId: string; quantity: number; modifierOptionIds?: string[] }
) => httpPost<{ ticket: ITicket }>(`/gestion/caja/cuentas/${ticketId}/lineas`, line, { headers: getGestionHeaders(token) });

/** Cantidad cero borra la línea. Solo sirve con lo que no se haya mandado a cocina. */
export const changeTicketLine = (token: string, ticketId: number, lineId: number, quantity: number) =>
    httpPost<{ ticket: ITicket }>(
        `/gestion/caja/cuentas/${ticketId}/lineas/${lineId}`,
        { quantity },
        { headers: getGestionHeaders(token) }
    );

export const sendTicketToKitchen = (token: string, ticketId: number) =>
    httpPost<{ ticket: ITicket }>(`/gestion/caja/cuentas/${ticketId}/cocina`, {}, { headers: getGestionHeaders(token) });

export const payTicket = (token: string, ticketId: number, payments: ITicketPayment[]) =>
    httpPost<{ ticket: ITicket }>(
        `/gestion/caja/cuentas/${ticketId}/cobrar`,
        { payments },
        { headers: getGestionHeaders(token) }
    );

export const voidTicket = (token: string, ticketId: number, reason: string) =>
    httpPost<{ ticket: ITicket }>(
        `/gestion/caja/cuentas/${ticketId}/anular`,
        { reason },
        { headers: getGestionHeaders(token) }
    );

/* ============ Caja: turno ============ */

export const fetchShift = (token: string, signal?: AbortSignal) =>
    httpGet<{ shift: IShiftDetail | null }>("/gestion/caja/turno", { signal, headers: getGestionHeaders(token) });

export const openShift = (token: string, startingCash: number) =>
    httpPost<{ shift: IShiftDetail }>("/gestion/caja/turno", { startingCash }, { headers: getGestionHeaders(token) });

export const registerCashMovement = (
    token: string,
    movement: { type: "entrada" | "salida"; amount: number; reason: string }
) => httpPost<{ shift: IShiftDetail }>("/gestion/caja/turno/movimiento", movement, { headers: getGestionHeaders(token) });

export const closeShift = (token: string, countedCash: number, note?: string) =>
    httpPost<{ shift: IShiftDetail }>(
        "/gestion/caja/turno/cierre",
        { countedCash, note: note || null },
        { headers: getGestionHeaders(token) }
    );

/** Dinero con dos decimales y signo de dólar, como lo lee el cajero. */
export const formatCash = (value: number) =>
    `$${value.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
