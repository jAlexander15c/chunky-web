import { httpGet, httpPost, httpPut, httpDelete } from "./getHttp";
import type { ISupplyStatus } from "./admin";
export type InventoryType = "RAW_MATERIAL" | "PACKAGED_ITEM" | "PREPARED_PRODUCT";
export type ProductionMode = "MADE_TO_ORDER" | "BATCH";
export type AvailabilityMode = "AUTOMATIC" | "MANUAL_ON" | "MANUAL_OFF";
export interface ProductAvailability {
    isPerishable?: boolean;
    shelfLifeDays?: number | null;
    availabilityMode: AvailabilityMode;
    productionMode: ProductionMode;
    isAvailable: boolean;
    usableStock: string;
    maxProducible: string;
    limitingIngredient: string | null;
    nextExpiration: string | null;
    warning: string | null;
}
export interface InventoryBatch {
    id: number;
    quantityInitial: string;
    quantityRemaining: string;
    purchasedAt: string | null;
    producedAt: string | null;
    expirationDate: string | null;
    status: "ACTIVE" | "EXPIRED" | "DEPLETED" | "DISCARDED";
    origin: string | null;
    createdAt: string;
}
export interface BatchDetail {
    batches: InventoryBatch[];
    usableStock: string;
    expiredStock: string;
    discardedStock: string;
    nextExpiration: string | null;
}
export interface Recipe {
    variantId: string;
    itemId: string;
    name: string;
    productionMode: ProductionMode;
    availabilityMode: AvailabilityMode;
    outputSupplyId: number | null;
    yieldQuantity: string;
    isPerishable: boolean;
    shelfLifeDays: number | null;
    ingredients: { inventoryItemId: number; name?: string; quantity: string; unit: string; baseUnit?: string }[];
}
export interface ProductionPreview {
    quantity: string;
    sufficient: boolean;
    ingredients: {
        inventoryItemId: number;
        name: string;
        needed: string;
        available: string;
        unit: string;
        sufficient: boolean;
    }[];
}
export interface PurchaseInput {
    quantity: string;
    quantityMode: "BASE" | "PURCHASE";
    unitsPerPurchase?: string;
    contentUnit?: string;
    purchasedAt: string;
    expirationDate?: string;
    reference?: string;
}
export const inventoryHeaders = (token: string, scope: "admin" | "gestion" = "admin") => ({
    headers: { [scope === "admin" ? "x-admin-token" : "x-gestion-token"]: token },
});
const productPath = (variantId: string) => "/admin/products/" + encodeURIComponent(variantId);
export const fetchRecipe = (token: string, variantId: string, signal?: AbortSignal) =>
    httpGet<{ recipe: Recipe | null; availability: ProductAvailability | null }>(productPath(variantId) + "/recipe", {
        ...inventoryHeaders(token),
        signal,
    });
export const saveRecipe = (token: string, variantId: string, recipe: Recipe) =>
    httpPut<{ recipe: Recipe }>(productPath(variantId) + "/recipe", recipe, inventoryHeaders(token));
export const deleteRecipe = (token: string, variantId: string) =>
    httpDelete(productPath(variantId) + "/recipe", inventoryHeaders(token));
export const changeAvailabilityMode = (token: string, variantId: string, availabilityMode: AvailabilityMode) =>
    httpPut<{ availability: ProductAvailability }>(
        productPath(variantId) + "/availability-mode",
        { availabilityMode },
        inventoryHeaders(token),
    );
export const previewProduction = (token: string, variantId: string, quantity: string) =>
    httpPost<ProductionPreview>(productPath(variantId) + "/production-preview", { quantity }, inventoryHeaders(token));
export const produceBatch = (
    token: string,
    variantId: string,
    quantity: string,
    producedAt: string,
    expirationDate?: string,
) => httpPost(productPath(variantId) + "/batches", { quantity, producedAt, expirationDate }, inventoryHeaders(token));
export const fetchBatches = (token: string, id: number, signal?: AbortSignal) =>
    httpGet<BatchDetail>("/admin/supplies/" + id + "/batches", { ...inventoryHeaders(token), signal });
export const discardBatch = (token: string, id: number, batchId: number) =>
    httpPost<BatchDetail>("/admin/supplies/" + id + "/batches/" + batchId + "/discard", {}, inventoryHeaders(token));
export const purchaseInventory = (
    token: string,
    id: number,
    input: PurchaseInput,
    scope: "admin" | "gestion" = "admin",
) =>
    httpPost<{ supply: ISupplyStatus }>(
        "/" + scope + "/supplies/" + id + "/purchase",
        input,
        inventoryHeaders(token, scope),
    );
export const previewPurchase = (
    token: string,
    id: number,
    input: PurchaseInput,
    scope: "admin" | "gestion" = "admin",
) =>
    httpPost<{ quantity: string; unit: string }>(
        "/" + scope + "/supplies/" + id + "/purchase-preview",
        input,
        inventoryHeaders(token, scope),
    );
export const availabilityLabel = (a: ProductAvailability) =>
    a.availabilityMode === "MANUAL_OFF"
        ? "Apagado manualmente"
        : a.availabilityMode === "MANUAL_ON"
          ? "Disponible manualmente"
          : a.isAvailable
            ? "Disponible"
            : "Agotado automáticamente";
export const expirationLabel = (value?: string | null) => {
    if (!value) return "Sin vencimiento";
    const remaining = new Date(value).getTime() - Date.now();
    if (remaining <= 0) return "Vencido";
    const days = Math.ceil(remaining / 86400000);
    return days === 1 ? "Vence en menos de un día" : "Vence en " + days + " días";
};
export const panamaDateTime = (date: string) => date + "T00:00:00-05:00";
export const compatibleUnits = (unit: string) =>
    ["g", "kg"].includes(unit) ? ["g", "kg"] : ["ml", "l", "L"].includes(unit) ? ["ml", "l"] : [unit];

export interface InventoryReceiptFailure {
    receiptNumber: string;
    error: string;
    attempts: number;
    updatedAt: string;
}
export const fetchInventoryReceiptFailures = (token: string, signal?: AbortSignal) =>
    httpGet<{ failures: InventoryReceiptFailure[] }>("/admin/inventory-receipt-failures", {
        ...inventoryHeaders(token),
        signal,
    });

export const receiveProductBatch = (
    token: string,
    variantId: string,
    quantity: string,
    scope: "admin" | "gestion" = "admin",
    requestId?: string,
) =>
    httpPost<{
        batchId: number;
        quantity: string;
        receivedAt: string;
        expirationDate: string | null;
        usableStock: string;
    }>(
        "/" + scope + "/products/" + encodeURIComponent(variantId) + "/receive",
        { quantity, requestId },
        inventoryHeaders(token, scope),
    );
