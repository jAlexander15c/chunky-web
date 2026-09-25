import { COLLABORATOR_ROLES } from "./admin";
import type {
    CollaboratorRole,
    IFund,
    IFundMovementInput,
    IMovement,
    IProductStatus,
    ISupplyStatus,
} from "./admin";
import { httpGet, httpPost } from "./getHttp";
import type { IModifier } from "./modifiers";

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
    /** Quién pagó esa parte, cuando la cuenta se paga por partes. Opcional. */
    payerName?: string | null;
    /** Cuándo se registró el pago por partes y quién lo cargó. */
    paidAt?: string;
    byName?: string;
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

/** Lo que vale la línea con sus modificadores. */
export const getTicketLineTotal = (line: Pick<ITicketLine, "unitPrice" | "modifiers" | "quantity">) =>
    (line.unitPrice + line.modifiers.reduce((sum, one) => sum + one.price, 0)) * line.quantity;

/**
 * anulada: se cerró sin cobrar. reembolsada: se cobró y luego se devolvió completa.
 * credito: se la llevó alguien que paga después; no entra a caja hasta que se cobra.
 */
export type TicketStatus = "abierta" | "cobrada" | "anulada" | "reembolsada" | "credito";

/** Una de las cuentas abiertas de la mesa, para cambiar entre ellas. */
export interface ITableAccount {
    id: number;
    label: string;
    customerName: string | null;
    total: number;
}

export interface ITicket {
    id: number;
    /** Null en una cuenta para llevar. */
    tableNumber: number | null;
    /** A nombre de quién va la cuenta: opcional en las de para llevar y en las de una mesa con varias. */
    customerName: string | null;
    status: TicketStatus;
    openedByName: string;
    openedAt: string;
    total: number;
    /** Mientras está abierta, los pagos por partes; al cobrarla, cómo se pagó. */
    payments: ITicketPayment[] | null;
    /** Lo ya pagado por partes. En una cobrada, todo. */
    paidAmount: number;
    loyverseReceiptNumber: string | null;
    receiptPending: boolean;
    lines: ITicketLine[];
    /** Las cuentas abiertas de la misma mesa, esta incluida. Vacío en las de para llevar. */
    tableAccounts: ITableAccount[];
    /** Comandas de la mesa que la cocina aún no entrega. En 0 con platos enviados: pendiente de pago. */
    inKitchen: number;
    /** Cuándo se dejó a crédito y quién. Siguen puestos después de cobrarla. */
    creditAt: string | null;
    creditByName: string | null;
}

/** Una cuenta a crédito por cobrar, a nombre de quien la debe. */
export interface ICreditTicket {
    id: number;
    label: string;
    tableNumber: number | null;
    customerName: string | null;
    total: number;
    openedAt: string;
    creditAt: string | null;
    creditByName: string | null;
}

export interface ICreditTotals {
    count: number;
    total: number;
}

export interface ITableSummary {
    tableNumber: number | null;
    label: string;
    customerName: string | null;
    ticketId: number | null;
    total: number;
    /** Lo ya pagado por partes en las cuentas abiertas de la mesa. */
    paidAmount: number;
    items: number;
    pending: number;
    /** Comandas enviadas que la cocina aún no entrega. En 0 con platos: pendiente de pago. */
    inKitchen: number;
    /** Cuentas abiertas en la mesa. Total, platos y pendientes suman las de todas. */
    accounts: number;
    openedAt: string | null;
}

/** "Mesa 3", "Mesa 3 · Ana", "Para llevar · Ana" o "Para llevar · #18", igual que en cocina y en el recibo. */
export const getTicketLabel = (ticket: Pick<ITicket, "id" | "tableNumber" | "customerName">) =>
    ticket.tableNumber !== null
        ? `Mesa ${ticket.tableNumber}${ticket.customerName ? ` · ${ticket.customerName}` : ""}`
        : `Para llevar · ${ticket.customerName || `#${ticket.id}`}`;

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
    /** Solo quien abrió el turno lo cierra en caja; si no está, lo cierra el admin. */
    openedById: number | null;
    openedByName: string;
    openedAt: string;
    startingCash: number;
    closedByName: string | null;
    closedAt: string | null;
    expectedCash: number | null;
    countedCash: number | null;
    difference: number | null;
}

/** Una cuenta cobrada (o ya reembolsada) del turno, sin sus líneas. */
export interface IShiftTicket {
    id: number;
    label: string;
    status: TicketStatus;
    total: number;
    payments: ITicketPayment[] | null;
    closedAt: string | null;
    closedByName: string | null;
    refundedAt: string | null;
    refundedByName: string | null;
    refundReason: string | null;
    /** Se reembolsó aquí pero Loyverse aún no tiene el recibo de reembolso: se reintenta solo. */
    refundPending: boolean;
}

/** El turno en curso con todo lo que hace falta para cuadrarlo. */
export interface IShiftDetail extends IShift {
    movements: ICashMovement[];
    salesTotal: number;
    salesCount: number;
    /** Solo la parte en efectivo: es la única que toca el cajón. */
    salesCash: number;
    /** Tarjeta y Yappy no pasan por el cajón: solo se muestran. */
    salesCard: number;
    salesYappy: number;
    /** Cuentas reembolsadas: ya no cuentan en las ventas de arriba. */
    refundsTotal: number;
    refundsCount: number;
    /** Las cuentas cobradas y reembolsadas del turno, la más reciente primero. */
    tickets: IShiftTicket[];
    cashIn: number;
    cashOut: number;
    expected: number;
    /** Cuentas dejadas a crédito en el turno: no entró dinero, solo se muestran. */
    creditsGiven: ICreditTotals;
    /** Créditos cobrados en el turno: ya están en las ventas por método. */
    creditsCollected: ICreditTotals;
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
        return Array.isArray(parsed) ? parsed.filter((role) => COLLABORATOR_ROLES.includes(role)) : [];
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

/** Una variante del menú con su estado de venta en Loyverse. */
export interface ISaleAvailability {
    itemId: string;
    variantId: string;
    name: string;
    /** Vacío si el producto tiene una sola variante sin opciones. */
    variantName: string;
    categoryId: string | null;
    categoryName: string;
    price: number | null;
    isAvailable: boolean;
}

export const fetchGestionAvailability = (token: string, signal?: AbortSignal) =>
    httpGet<{ products: ISaleAvailability[] }>("/gestion/availability", { signal, headers: getGestionHeaders(token) });

export const changeGestionAvailability = (token: string, itemId: string, variantId: string, isAvailable: boolean) =>
    httpPost<{ product: Pick<ISaleAvailability, "variantId" | "isAvailable"> }>(
        `/gestion/availability/${encodeURIComponent(variantId)}`,
        { itemId, isAvailable },
        { headers: getGestionHeaders(token) }
    );

/** Modificadores con cada opcion marcada disponible o agotada (se guarda en nuestra base). */
export const fetchGestionModifierAvailability = (token: string, signal?: AbortSignal) =>
    httpGet<{ modifiers: IModifier[] }>("/gestion/modifier-availability", { signal, headers: getGestionHeaders(token) });

export const changeGestionModifierAvailability = (token: string, optionId: string, isAvailable: boolean) =>
    httpPost<{ optionId: string; isAvailable: boolean }>(
        `/gestion/modifier-options/${encodeURIComponent(optionId)}/availability`,
        { isAvailable },
        { headers: getGestionHeaders(token) }
    );

/* ============ Caja: mesas y cuentas ============ */

/** El mapa de mesas y, de paso, el turno en curso: la caja necesita los dos a la vez. */
export const fetchTables = (token: string, signal?: AbortSignal) =>
    httpGet<{ tables: ITableSummary[]; shift: IShiftDetail | null }>("/gestion/caja/mesas", {
        signal,
        headers: getGestionHeaders(token),
    });

/** Trae la cuenta abierta de la mesa, o la abre. El cero abre una cuenta para llevar nueva. */
export const openTable = (token: string, tableNumber: number, customerName?: string) =>
    httpPost<{ ticket: ITicket }>("/gestion/caja/mesas", { tableNumber, customerName }, { headers: getGestionHeaders(token) });

/** Otra cuenta en una mesa que ya tiene alguna, para un grupo que paga por separado. */
export const openTableAccount = (token: string, tableNumber: number, customerName: string) =>
    httpPost<{ ticket: ITicket }>(
        `/gestion/caja/mesas/${tableNumber}/cuentas`,
        { customerName: customerName || null },
        { headers: getGestionHeaders(token) }
    );

export const renameTicket = (token: string, ticketId: number, customerName: string) =>
    httpPost<{ ticket: ITicket }>(
        `/gestion/caja/cuentas/${ticketId}/nombre`,
        { customerName: customerName || null },
        { headers: getGestionHeaders(token) }
    );

/** Pasa unidades de un plato a otra cuenta de la misma mesa. Devuelve la cuenta de origen. */
export const moveTicketLine = (token: string, ticketId: number, lineId: number, toTicketId: number, quantity: number) =>
    httpPost<{ ticket: ITicket }>(
        `/gestion/caja/cuentas/${ticketId}/lineas/${lineId}/mover`,
        { toTicketId, quantity },
        { headers: getGestionHeaders(token) }
    );

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

/**
 * Registra lo que paga una persona de la cuenta (cobro Mixto por partes). El pago que
 * completa el total cierra la cuenta: la respuesta llega ya cobrada.
 */
export const addTicketPayment = (
    token: string,
    ticketId: number,
    payment: { method: PaymentMethod; amount: number; payerName: string | null }
) =>
    httpPost<{ ticket: ITicket }>(`/gestion/caja/cuentas/${ticketId}/pagos`, payment, {
        headers: getGestionHeaders(token),
    });

/** Quita un pago por partes cargado por error, mientras la cuenta sigue abierta. */
export const removeTicketPayment = (token: string, ticketId: number, index: number) =>
    httpPost<{ ticket: ITicket }>(`/gestion/caja/cuentas/${ticketId}/pagos/${index}/quitar`, {}, {
        headers: getGestionHeaders(token),
    });

/** Cierra una mesa abierta por error. El API la rechaza si ya mandó algo a cocina. */
export const releaseTicket = (token: string, ticketId: number) =>
    httpPost<{ released: boolean }>(`/gestion/caja/cuentas/${ticketId}/liberar`, {}, { headers: getGestionHeaders(token) });

export const voidTicket = (token: string, ticketId: number, reason: string) =>
    httpPost<{ ticket: ITicket }>(
        `/gestion/caja/cuentas/${ticketId}/anular`,
        { reason },
        { headers: getGestionHeaders(token) }
    );

/** Devuelve completa una cuenta cobrada del turno abierto. Trae el turno con las ventas ya ajustadas. */
export const refundTicket = (token: string, ticketId: number, reason: string) =>
    httpPost<{ ticket: ITicket; shift: IShiftDetail | null }>(
        `/gestion/caja/cuentas/${ticketId}/reembolsar`,
        { reason },
        { headers: getGestionHeaders(token) }
    );

/* ============ Caja: créditos ============ */

/** Deja la cuenta a crédito a nombre de quien la debe: libera la mesa y no entra a caja. */
export const giveTicketCredit = (token: string, ticketId: number, customerName: string) =>
    httpPost<{ ticket: ITicket }>(
        `/gestion/caja/cuentas/${ticketId}/credito`,
        { customerName },
        { headers: getGestionHeaders(token) }
    );

export const fetchCredits = (token: string, signal?: AbortSignal) =>
    httpGet<{ credits: ICreditTicket[] }>("/gestion/caja/creditos", { signal, headers: getGestionHeaders(token) });

/** Cobra el crédito completo con un solo método, en el turno abierto. Trae los que quedan. */
export const payCreditTicket = (token: string, ticketId: number, method: PaymentMethod) =>
    httpPost<{ ticket: ITicket; credits: ICreditTicket[] }>(
        `/gestion/caja/creditos/${ticketId}/cobrar`,
        { method },
        { headers: getGestionHeaders(token) }
    );

/* ============ Caja: turno ============ */

/** canClose: solo quien abrió el turno lo cierra en caja. */
export const fetchShift = (token: string, signal?: AbortSignal) =>
    httpGet<{ shift: IShiftDetail | null; canClose: boolean }>("/gestion/caja/turno", {
        signal,
        headers: getGestionHeaders(token),
    });

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

/* ============ Caja: fondo aparte ============ */

export const fetchFund = (token: string, signal?: AbortSignal) =>
    httpGet<{ fund: IFund }>("/gestion/caja/fondo", { signal, headers: getGestionHeaders(token) });

export const registerFundMovement = (token: string, movement: IFundMovementInput) =>
    httpPost<{ fund: IFund }>("/gestion/caja/fondo/movimiento", movement, { headers: getGestionHeaders(token) });

/** Dinero con dos decimales y signo de dólar, como lo lee el cajero. */
export const formatCash = (value: number) =>
    `$${value.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "23/09": el día en que se dio un crédito. */
export const formatCreditDay = (value: string) => {
    const date = new Date(value);
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
};

/** Pasada una semana, un crédito se marca para ir a cobrarlo. */
const CREDIT_OLD_DAYS = 7;

/** "hoy", "ayer" o "hace 9 días", contando días de calendario. */
export const getCreditAge = (value: string) => {
    const given = new Date(value);
    const today = new Date();
    const days = Math.round(
        (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
            new Date(given.getFullYear(), given.getMonth(), given.getDate()).getTime()) /
            86_400_000
    );
    const label = days <= 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`;
    return { label, isOld: days >= CREDIT_OLD_DAYS };
};
