import { httpGet, httpPost } from "./getHttp";

export type SupplyState = "comprar" | "pedir" | "contar" | "bien";
export type ProductState = "agotado" | "poco" | "disponible" | "sin-control";
export type MovementType = "compra" | "conteo" | "produccion" | "venta" | "merma" | "ajuste";
export type MovementSource = "local" | "loyverse" | "web";

export interface ISupplyStatus {
    id: number;
    name: string;
    unit: string;
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
    reference: string | null;
    note: string | null;
    createdAt: string;
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

export const createSupply = (
    token: string,
    supply: { name: string; unit: string; minStock: number; supplier?: string; purchaseUnit?: string; purchaseSize?: number }
) => httpPost<{ supply: ISupplyStatus }>("/admin/supplies", supply, { headers: getAdminHeaders(token) });

/** Enciende o apaga el modo pasta: el menu de todos los clientes cambia al instante. */
export const setPastaMode = (token: string, enabled: boolean) =>
    httpPost<{ pastaMode: boolean }>("/admin/pasta-mode", { enabled }, { headers: getAdminHeaders(token) });

export const syncReceiptsNow = (token: string) =>
    httpPost<{ applied: number; skipped: number; synced: number }>("/admin/sync", {}, { headers: getAdminHeaders(token) });

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
