import { httpGet, httpPost, httpPut, httpDelete } from "./getHttp";
import type { ISupplyStatus } from "./admin";
import type { IModifier } from "./modifiers";
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
type Scope = "admin" | "gestion";
const productPath = (variantId: string, scope: Scope = "admin") =>
    "/" + scope + "/products/" + encodeURIComponent(variantId);
export const fetchRecipe = (token: string, variantId: string, signal?: AbortSignal, scope: Scope = "admin") =>
    httpGet<{ recipe: Recipe | null; availability: ProductAvailability | null }>(
        productPath(variantId, scope) + "/recipe",
        { ...inventoryHeaders(token, scope), signal },
    );
export const saveRecipe = (token: string, variantId: string, recipe: Recipe, scope: Scope = "admin") =>
    httpPut<{ recipe: Recipe }>(productPath(variantId, scope) + "/recipe", recipe, inventoryHeaders(token, scope));
export const deleteRecipe = (token: string, variantId: string, scope: Scope = "admin") =>
    httpDelete(productPath(variantId, scope) + "/recipe", inventoryHeaders(token, scope));

/** Lo que hace una opción de modificador en las recetas. Sin `replacesSupplyId` suma; con él, cambia ese insumo. */
export interface IOptionRule {
    optionId: string;
    supplyId: number;
    name: string;
    unit: string;
    replacesSupplyId: number | null;
    replacesName: string | null;
    /** Por unidad vendida. En un cambio, null = la misma cantidad de cada receta. */
    quantity: string | null;
}
export interface IOptionRuleInput {
    supplyId: number;
    replacesSupplyId?: number | null;
    quantity?: string | null;
    unit?: string;
}
export interface IRecipeCatalogProduct {
    itemId: string;
    variantId: string;
    name: string;
    variantName: string;
    categoryName: string;
    modifierIds: string[];
    hasRecipe: boolean;
    productionMode?: ProductionMode;
    availabilityMode?: AvailabilityMode;
    isAvailable: boolean;
    usableStock?: string;
    maxProducible?: string;
    limitingIngredient?: string | null;
}
export interface IRecipeCatalog {
    products: IRecipeCatalogProduct[];
    modifiers: IModifier[];
    rules: IOptionRule[];
}
export const fetchRecipeCatalog = (token: string, scope: Scope, signal?: AbortSignal) =>
    httpGet<IRecipeCatalog>("/" + scope + "/recipes/catalog", { ...inventoryHeaders(token, scope), signal });
export const fetchOptionRules = (token: string, scope: Scope, signal?: AbortSignal) =>
    httpGet<{ rules: IOptionRule[] }>("/" + scope + "/modifier-option-rules", {
        ...inventoryHeaders(token, scope),
        signal,
    });
export const saveOptionRules = (token: string, scope: Scope, optionId: string, rules: IOptionRuleInput[]) =>
    httpPut<{ rules: IOptionRule[] }>(
        "/" + scope + "/modifier-options/" + encodeURIComponent(optionId) + "/rules",
        { rules },
        inventoryHeaders(token, scope),
    );
/** La receta de una línea ya resuelta con sus opciones. `removed`: lo que una opción cambió. */
export interface IRecipeView {
    variantId: string;
    name: string;
    productionMode: ProductionMode;
    quantity: string;
    lines: {
        supplyId: number;
        name: string;
        unit: string;
        quantity: string;
        fromRecipe: string;
        fromOptions: string;
        replaces: string | null;
    }[];
    removed: { name: string; unit: string; quantity: string }[];
}
export const fetchRecipeView = (
    token: string,
    variantId: string,
    optionIds: string[],
    quantity: number,
    signal?: AbortSignal,
) =>
    httpGet<{ recipe: IRecipeView }>(
        "/gestion/recipes/" +
            encodeURIComponent(variantId) +
            "/view?quantity=" +
            quantity +
            (optionIds.length ? "&options=" + encodeURIComponent(optionIds.join(",")) : ""),
        { ...inventoryHeaders(token, "gestion"), signal },
    );
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
    /** Días que dura cada lote; null para que no venza. Sin mandarlo se conservan los guardados. */
    shelfLifeDays?: number | null,
) =>
    httpPost<{
        batchId: number;
        quantity: string;
        receivedAt: string;
        expirationDate: string | null;
        usableStock: string;
    }>(
        "/" + scope + "/products/" + encodeURIComponent(variantId) + "/receive",
        { quantity, requestId, ...(shelfLifeDays !== undefined && { shelfLifeDays }) },
        inventoryHeaders(token, scope),
    );
