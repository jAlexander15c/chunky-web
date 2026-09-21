import { httpGet, httpPost, httpPut } from "./getHttp";

export type SupplyState = "comprar" | "pedir" | "contar" | "bien";
export type ProductState = "agotado" | "poco" | "disponible" | "sin-control";
export type MovementType = "compra" | "conteo" | "produccion" | "venta" | "merma" | "ajuste";
export type MovementSource = "local" | "loyverse" | "web";
export type SupplyCategory = "alimento" | "limpieza" | "mantenimiento";

export const SUPPLY_CATEGORY_LABEL: Record<SupplyCategory, string> = {
    alimento: "Alimentos",
    limpieza: "Limpieza",
    mantenimiento: "Mantenimiento",
};

export interface ISupplyStatus {
    id: number;
    name: string;
    unit: string;
    category: SupplyCategory;
    stock: number;
    minStock: number;
    supplier: string | null;
    purchaseUnit: string | null;
    purchaseSize: number | null;
    countedAt: string | null;
    /** Gasto diario entre los dos ultimos conteos. null si aun no hay dos. */
    dailyUse: number | null;
    daysLeft: number | null;
    countAge: number | null;
    suggestedPurchase: number | null;
    state: SupplyState;
}

export interface IProductStatus {
    variantId: string;
    itemId: string;
    name: string;
    stock: number;
    producedToday: number;
    lowStock: number;
    isTracked: boolean;
    soldOutAt: string | null;
    loyverseSynced: boolean;
    state: ProductState;
}

export interface IMovement {
    id: number;
    kind: "supply" | "product";
    name: string;
    type: MovementType;
    quantity: number;
    balance: number | null;
    unit: string;
    source: MovementSource;
    /** Quién lo cargó. "Admin" si fue desde el tablero, null si vino de un recibo. */
    actorName: string | null;
    actorId: number | null;
    reference: string | null;
    note: string | null;
    createdAt: string;
}

/** Una persona puede tener varios: quien cuenta insumos también puede estar en caja. */
export type CollaboratorRole = "inventario" | "caja" | "pastelera";

export const COLLABORATOR_ROLES: CollaboratorRole[] = ["inventario", "caja", "pastelera"];

export const ROLE_LABEL: Record<CollaboratorRole, string> = {
    inventario: "Inventario",
    caja: "Caja",
    pastelera: "Pastelera",
};

export interface ICollaborator {
    id: number;
    name: string;
    roles: CollaboratorRole[];
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    movementsToday: number;
}

export interface IShiftRow {
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

export interface IDaySales {
    date: string;
    web: number;
    mostrador: number;
    total: number;
    tickets: number;
}

export interface ISalesReport {
    days: IDaySales[];
    topProducts: { name: string; units: number; webUnits: number; webShare: number }[];
    today: { web: number; mostrador: number; total: number; tickets: number; averageTicket: number };
    range: { web: number; mostrador: number; total: number; tickets: number; webShare: number };
}

export interface IDashboard {
    /** null cuando Loyverse no respondio: el inventario sigue disponible igual. */
    sales: ISalesReport | null;
    salesError: string | null;
    inventory: {
        suppliesToBuy: number;
        suppliesToCount: number;
        productsSoldOut: number;
        productsLow: number;
    };
    serverTime: string;
}

const ADMIN_TOKEN_STORAGE_KEY = "chunky-admin-token";

const getAdminHeaders = (token: string) => ({ "x-admin-token": token });

export const getAdminToken = () => {
    try {
        return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
};

export const setAdminToken = (token: string | null) => {
    try {
        if (token) window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
        else window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    } catch {
        return;
    }
};

export const loginAdmin = (pin: string) => httpPost<{ token: string }>("/admin/login", { pin });

export const fetchDashboard = (token: string, days = 14, signal?: AbortSignal) =>
    httpGet<IDashboard>(`/admin/dashboard?days=${days}`, { signal, headers: getAdminHeaders(token) });

export const fetchSupplies = (token: string, signal?: AbortSignal) =>
    httpGet<{ supplies: ISupplyStatus[] }>("/admin/supplies", { signal, headers: getAdminHeaders(token) });

export const fetchProducts = (token: string, signal?: AbortSignal) =>
    httpGet<{ products: IProductStatus[] }>("/admin/products", { signal, headers: getAdminHeaders(token) });

export const fetchMovements = (token: string, limit = 40, signal?: AbortSignal) =>
    httpGet<{ movements: IMovement[] }>(`/admin/movements?limit=${limit}`, { signal, headers: getAdminHeaders(token) });

export const registerPurchase = (token: string, supplyId: number, quantity: number, reference?: string) =>
    httpPost<{ supply: ISupplyStatus }>(
        `/admin/supplies/${supplyId}/purchase`,
        { quantity, reference: reference || null },
        { headers: getAdminHeaders(token) }
    );

export const registerCount = (token: string, supplyId: number, counted: number) =>
    httpPost<{ supply: ISupplyStatus }>(
        `/admin/supplies/${supplyId}/count`,
        { counted },
        { headers: getAdminHeaders(token) }
    );

export const registerProduction = (token: string, variantId: string, quantity: number) =>
    httpPost<{ product: IProductStatus }>(
        `/admin/products/${encodeURIComponent(variantId)}/production`,
        { quantity },
        { headers: getAdminHeaders(token) }
    );

export const registerWaste = (token: string, supplyId: number, quantity: number) =>
    httpPost<{ supply: ISupplyStatus }>(
        `/admin/supplies/${supplyId}/waste`,
        { quantity },
        { headers: getAdminHeaders(token) }
    );

export const createSupply = (
    token: string,
    supply: {
        name: string;
        unit: string;
        category: SupplyCategory;
        minStock: number;
        supplier?: string;
        purchaseUnit?: string;
        purchaseSize?: number;
    }
) => httpPost<{ supply: ISupplyStatus }>("/admin/supplies", supply, { headers: getAdminHeaders(token) });

/* ============ Colaboradores ============ */

export const fetchCollaborators = (token: string, signal?: AbortSignal) =>
    httpGet<{ collaborators: ICollaborator[] }>("/admin/collaborators", { signal, headers: getAdminHeaders(token) });

/** El PIN viene en claro solo en esta respuesta: después únicamente queda su hash. */
export const createCollaborator = (token: string, name: string, roles: CollaboratorRole[]) =>
    httpPost<{ collaborator: ICollaborator; pin: string }>(
        "/admin/collaborators",
        { name, roles },
        { headers: getAdminHeaders(token) }
    );

/** Cambia nombre y roles. El PIN se toca aparte, con resetCollaboratorPin. */
export const updateCollaborator = (token: string, id: number, name: string, roles: CollaboratorRole[]) =>
    httpPut<{ collaborator: ICollaborator }>(
        `/admin/collaborators/${id}`,
        { name, roles },
        { headers: getAdminHeaders(token) }
    );

/* ============ Caja ============ */

export const fetchShifts = (token: string, signal?: AbortSignal) =>
    httpGet<{ shifts: IShiftRow[]; tables: number }>("/admin/shifts", { signal, headers: getAdminHeaders(token) });

export const setTablesCount = (token: string, tables: number) =>
    httpPost<{ tables: number }>("/admin/tables", { tables }, { headers: getAdminHeaders(token) });

/** Además cierra las sesiones abiertas de esa persona. */
export const resetCollaboratorPin = (token: string, id: number) =>
    httpPost<{ collaborator: ICollaborator; pin: string }>(
        `/admin/collaborators/${id}/reset-pin`,
        {},
        { headers: getAdminHeaders(token) }
    );

export const setCollaboratorActive = (token: string, id: number, isActive: boolean) =>
    httpPost<{ collaborator: ICollaborator }>(
        `/admin/collaborators/${id}/active`,
        { isActive },
        { headers: getAdminHeaders(token) }
    );

/** Enciende o apaga el modo pasta: el menu de todos los clientes cambia al instante. */
export const setPastaMode = (token: string, enabled: boolean) =>
    httpPost<{ pastaMode: boolean }>("/admin/pasta-mode", { enabled }, { headers: getAdminHeaders(token) });

export const syncReceiptsNow = (token: string) =>
    httpPost<{ applied: number; skipped: number; synced: number }>("/admin/sync", {}, { headers: getAdminHeaders(token) });

/* ============ Descuadres de pago ============ */

export type IncidentKind = "RECEIPT_MISSING" | "IPN_UNMATCHED" | "LATE_PAYMENT" | "IPN_INVALID_HASH";
export type IncidentStatus = "open" | "resolved";

export const INCIDENT_LABEL: Record<IncidentKind, string> = {
    RECEIPT_MISSING: "Cobrado sin recibo",
    LATE_PAYMENT: "Pago tardío",
    IPN_UNMATCHED: "Pago sin pedido",
    IPN_INVALID_HASH: "Firma inválida",
};

/** Cuánto pesa cada tipo: un pago sin pedido es plata cobrada sin nada que entregar; uno tardío solo avisa. */
export const INCIDENT_TONE: Record<IncidentKind, "warn" | "crit" | "idle"> = {
    RECEIPT_MISSING: "warn",
    LATE_PAYMENT: "idle",
    IPN_UNMATCHED: "crit",
    IPN_INVALID_HASH: "crit",
};

export interface IIncident {
    id: number;
    orderId: string;
    kind: IncidentKind;
    status: IncidentStatus;
    detail: string | null;
    lastError: string | null;
    attempts: number;
    lastAttemptAt: string | null;
    firstDetectedAt: string;
    resolvedAt: string | null;
    /** "auto" si el sistema lo cerró solo; si no, quien lo resolvió. */
    resolvedBy: string | null;
    resolution: string | null;
    /** Llegó al límite de reintentos: solo se sale reintentando desde aquí o resolviéndolo a mano. */
    needsManualAction: boolean;
    /** Cuándo vuelve a intentarlo el sistema. null si ya no reintenta solo o no aplica. */
    nextRetryAt: string | null;
    order: {
        customerName: string;
        total: number;
        status: string;
        paidAt: string | null;
        acceptedAt: string | null;
        deliveredAt: string | null;
        loyverseReceiptNumber: string | null;
    } | null;
}

export interface IIncidentList {
    incidents: IIncident[];
    /** Abiertos en total, sin importar qué pestaña se esté mirando. */
    openCount: number;
    maxReceiptAttempts: number;
}

export const fetchIncidents = (token: string, status: IncidentStatus, signal?: AbortSignal) =>
    httpGet<IIncidentList>(`/admin/incidents?status=${status}`, { signal, headers: getAdminHeaders(token) });

/** Reintenta ya el recibo. isCreated es false si Loyverse sigue rechazándolo. */
export const retryIncidentReceipt = (token: string, id: number) =>
    httpPost<{ incident: IIncident; isCreated: boolean }>(
        `/admin/incidents/${id}/retry-receipt`,
        {},
        { headers: getAdminHeaders(token) }
    );

/** Con un recibo faltante, el pedido deja de reintentarse: con el número si se hizo a mano, o sin él si no hace falta. */
export const resolveIncident = (token: string, id: number, input: { note: string; receiptNumber?: string }) =>
    httpPost<{ incident: IIncident }>(`/admin/incidents/${id}/resolve`, input, { headers: getAdminHeaders(token) });

/* ============ Formato ============ */

export const formatMoney = (value: number) =>
    value.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cantidades sin decimales inutiles: 6 en vez de 6.000, pero 6.2 se conserva. */
export const formatQuantity = (value: number) =>
    Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));

export const formatDayLabel = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    const weekday = parsed.toLocaleDateString("es-PA", { weekday: "short" });
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1, 3)} ${day}`;
};

export const formatClock = (value: string) =>
    new Date(value).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false });

/** "hoy", "ayer" o "hace N d": lo que importa es si el conteo ya envejecio. */
export const formatCountAge = (days: number | null) => {
    if (days === null) return "sin contar";
    if (days <= 0) return "hoy";
    if (days === 1) return "ayer";
    return `hace ${days} d`;
};
