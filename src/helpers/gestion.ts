import type { IMovement, IProductStatus, ISupplyStatus } from "./admin";
import { httpGet, httpPost } from "./getHttp";

/** Lo que el colaborador necesita saber de sí mismo: su nombre para el saludo. */
export interface IGestionSession {
    id: number;
    name: string;
}

const GESTION_TOKEN_STORAGE_KEY = "chunky-gestion-token";
const GESTION_NAME_STORAGE_KEY = "chunky-gestion-nombre";

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

export const setGestionSession = (token: string | null, name = "") => {
    try {
        if (token) {
            window.localStorage.setItem(GESTION_TOKEN_STORAGE_KEY, token);
            window.localStorage.setItem(GESTION_NAME_STORAGE_KEY, name);
        } else {
            window.localStorage.removeItem(GESTION_TOKEN_STORAGE_KEY);
            window.localStorage.removeItem(GESTION_NAME_STORAGE_KEY);
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
