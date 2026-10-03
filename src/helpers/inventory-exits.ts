import { httpGet, httpPost } from "./getHttp";
import type { IItem } from "@/interfaces";
import type { ICartModifier } from "./modifiers";

export type InventoryExitReason = "pruebas" | "marketing" | "pedidos_externos";
export const INVENTORY_EXIT_LABELS: Record<InventoryExitReason, string> = { pruebas: "Pruebas", marketing: "Marketing", pedidos_externos: "Pedidos externos" };
export interface IInventoryExitPayload {
    reason: InventoryExitReason;
    note: string | null;
    lines: { variantId: string; quantity: number; modifierOptionIds: string[] }[];
}
export interface IInventoryExitRequest extends IInventoryExitPayload { requestId: string }
export interface IInventoryExit {
    id: number;
    requestId: string;
    reason: InventoryExitReason;
    note: string | null;
    actorId: number | null;
    actorName: string;
    createdAt: string;
    lines: { variantId: string; name: string; quantity: number; modifiers: ICartModifier[] }[];
}

/** Un reintento del mismo contenido conserva su identificador para evitar descontar dos veces. */
export const prepareInventoryExitRequest = (payload: IInventoryExitPayload, previous?: IInventoryExitRequest | null): IInventoryExitRequest => {
    if (previous) {
        const { requestId, ...previousPayload } = previous;
        if (JSON.stringify(previousPayload) === JSON.stringify(payload)) return { ...payload, requestId };
    }
    return { ...payload, requestId: crypto.randomUUID() };
};
export const fetchInventoryExits = (token: string, signal?: AbortSignal) =>
    httpGet<{ exits: IInventoryExit[] }>("/gestion/caja/salidas", { signal, headers: { "x-gestion-token": token } });
export const registerInventoryExit = (token: string, payload: IInventoryExitRequest) =>
    httpPost<{ exit: IInventoryExit; alreadyRegistered: boolean }>("/gestion/caja/salidas", payload, { headers: { "x-gestion-token": token } });

export const fetchInventoryExitCatalog = (token: string, signal?: AbortSignal) =>
    httpGet<{ items: IItem[] }>("/gestion/caja/salidas/catalogo", { signal, headers: { "x-gestion-token": token } });
