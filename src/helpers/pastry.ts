import { httpDelete, httpGet, httpPost, httpPut } from "./getHttp";

/**
 * Repostería: ingredientes sin inventario y recetas de postres con tamaños y opciones.
 * Los tipos y la fórmula son copia de chunky-api (contrato docs/CONTEXTO-reposteria.md): si
 * cambian, se cambian en los dos lados. La web usa la fórmula solo para la vista previa del editor;
 * el precio que se cobra siempre lo calcula el API.
 */

export type PastryUnit = "g" | "ml" | "u";

export const PASTRY_UNITS: { id: PastryUnit; label: string }[] = [
    { id: "g", label: "g (gramos)" },
    { id: "ml", label: "ml (mililitros)" },
    { id: "u", label: "u (unidades)" },
];

export interface IPastryIngredient {
    id: number;
    name: string;
    unit: PastryUnit;
    packageQty: number;
    packageCost: number;
    unitCost: number;
    archived: boolean;
    /** Recetas distintas que lo usan. */
    usedIn: number;
    updatedAt: string;
    updatedBy: string | null;
}

export interface IPastryIngredientInput {
    name: string;
    unit: PastryUnit;
    packageQty: number;
    packageCost: number;
}

export type IPastryItem = { ingredientId: number; qty: number } | { label: string; fixedCost: number };

export interface IPastrySize {
    id?: number;
    label: string;
    /** Altura u otra versión de la misma medida (ej. "1 altura"). Null: sin variante. */
    variant: string | null;
    scale: number;
    isBase: boolean;
}

export interface IPastryOption {
    id?: number;
    name: string;
    active: boolean;
    items: IPastryItem[];
}

export interface IPastryGroup {
    id?: number;
    name: string;
    min: number;
    max: number;
    /** Cuántas opciones de precio 0 se pueden elegir como máximo. Null: sin límite. */
    freeMax: number | null;
    options: IPastryOption[];
}

export interface IPastryProductInput {
    name: string;
    description: string;
    tab: string;
    factor: number;
    active: boolean;
    needsPhoto: boolean;
    allowsTopper: boolean;
    topperPrice: number;
    sort: number;
    sizes: IPastrySize[];
    base: IPastryItem[];
    groups: IPastryGroup[];
}

export interface IPastryProduct extends IPastryProductInput {
    id: number;
    updatedAt: string;
    updatedBy: string | null;
}

export interface IPastryProductSummary {
    id: number;
    name: string;
    tab: string;
    active: boolean;
    baseSizeLabel: string;
    baseCost: number;
    basePrice: number;
    /** Algún ingrediente que usa cambió después de la última revisión de la receta. */
    stale: boolean;
}

/* ============ Fórmula (igual que en el API) ============ */

export const PASTRY_DEFAULT_FACTOR = 2.95;
export const PASTRY_DEFAULT_TOPPER_PRICE = 10;

type IPastryCostable = Pick<IPastryIngredient, "packageQty" | "packageCost">;

/** Los ingredientes por id, para costear una receta. */
export type PastryIngredientMap = ReadonlyMap<number, IPastryCostable>;

export const getPastryIngredientMap = (ingredients: IPastryIngredient[]): PastryIngredientMap =>
    new Map(ingredients.map((one) => [one.id, one]));

const round2 = (value: number) => Math.round(value * 100) / 100;

export const getUnitCost = (ingredient: IPastryCostable) =>
    ingredient.packageQty > 0 ? ingredient.packageCost / ingredient.packageQty : 0;

export const isIngredientItem = (item: IPastryItem): item is { ingredientId: number; qty: number } => "ingredientId" in item;

/** Un ingrediente que ya no está en la lista cuenta cero: el editor lo marca aparte. */
export const getItemCost = (item: IPastryItem, ingredients: PastryIngredientMap) => {
    if (!isIngredientItem(item)) return item.fixedCost;
    const ingredient = ingredients.get(item.ingredientId);
    return ingredient ? getUnitCost(ingredient) * item.qty : 0;
};

/** Sin redondear. */
export const getRecipeCost = (items: IPastryItem[], ingredients: PastryIngredientMap) =>
    items.reduce((sum, item) => sum + getItemCost(item, ingredients), 0);

export const getPastryBasePrice = (
    product: Pick<IPastryProductInput, "base" | "factor">,
    size: Pick<IPastrySize, "scale">,
    ingredients: PastryIngredientMap
) => Math.round(getRecipeCost(product.base, ingredients) * size.scale * product.factor);

export const getPastryOptionPrice = (
    option: Pick<IPastryOption, "items">,
    product: Pick<IPastryProductInput, "factor">,
    size: Pick<IPastrySize, "scale">,
    ingredients: PastryIngredientMap
) => Math.round(getRecipeCost(option.items, ingredients) * size.scale * product.factor);

/** El costo del tamaño con la base y las opciones elegidas, sin topper ni multiplicador. */
export const getPastryEstimatedCost = (
    product: Pick<IPastryProductInput, "base">,
    chosen: Pick<IPastryOption, "items">[],
    size: Pick<IPastrySize, "scale">,
    ingredients: PastryIngredientMap
) =>
    round2(
        (getRecipeCost(product.base, ingredients) + chosen.reduce((sum, option) => sum + getRecipeCost(option.items, ingredients), 0)) *
            size.scale
    );

/** El costo de ese tamaño (solo la base), redondeado a centavos, y lo que le queda a la pastelera. */
export const getPastrySizeMargin = (
    product: Pick<IPastryProductInput, "base" | "factor">,
    size: Pick<IPastrySize, "scale">,
    ingredients: PastryIngredientMap
) => {
    const cost = round2(getRecipeCost(product.base, ingredients) * size.scale);
    const price = getPastryBasePrice(product, size, ingredients);
    return { cost, price, margin: round2(price - cost) };
};

/** "$0.0175 por g": con centavos de sobra cuando el costo por unidad es muy chico. */
export const formatUnitCost = (ingredient: IPastryCostable & { unit: PastryUnit }) => {
    const cost = getUnitCost(ingredient);
    const text = cost < 0.1 ? cost.toFixed(4) : cost.toFixed(2);
    return `$${text} por ${ingredient.unit === "u" ? "unidad" : ingredient.unit}`;
};

/** "hoy", "ayer", "hace 5 días", "hace 3 semanas"… de cuándo se tocó por última vez. */
export const formatPastryAge = (value: string, now = Date.now()) => {
    const days = Math.max(0, Math.floor((now - Date.parse(value)) / (24 * 60 * 60 * 1000)));
    if (days === 0) return "hoy";
    if (days === 1) return "ayer";
    if (days < 14) return `hace ${days} días`;
    if (days < 60) return `hace ${Math.floor(days / 7)} semanas`;
    return `hace ${Math.floor(days / 30)} meses`;
};

/** El número que escribió la pastelera, con coma o punto. Vacío o inválido es 0. */
export const parseDecimal = (value: string) => {
    const number = Number(value.trim().replace(",", "."));
    return Number.isFinite(number) ? number : 0;
};

/* ============ Validación del editor (misma que el API) ============ */

const MAX_NAME = 80;
const MAX_VARIANT = 40;

/** `6" doble altura`: la medida con su variante en minúscula, o solo la medida si no tiene. */
export const getPastrySizeText = (size: { label: string; variant?: string | null }) => {
    const label = size.label.trim();
    const variant = size.variant?.trim();
    return variant ? `${label} ${variant.toLowerCase()}` : label;
};

const isValidItem = (item: IPastryItem) =>
    isIngredientItem(item) ? item.qty > 0 : item.label.trim().length > 0 && item.fixedCost >= 0;

export const createEmptyPastryProduct = (): IPastryProductInput => ({
    name: "",
    description: "",
    tab: "",
    factor: PASTRY_DEFAULT_FACTOR,
    active: false,
    needsPhoto: false,
    allowsTopper: false,
    topperPrice: PASTRY_DEFAULT_TOPPER_PRICE,
    sort: 0,
    sizes: [{ label: "", variant: null, scale: 1, isBase: true }],
    base: [],
    groups: [],
});

/** Lo que falta para guardar la receta, en palabras de la pastelera. Vacío es listo. */
export const getPastryProductMissing = (product: IPastryProductInput) => {
    const missing: string[] = [];
    const name = product.name.trim();
    const tab = product.tab.trim();
    if (!name) missing.push("Escribe el nombre del postre");
    else if (name.length > MAX_NAME) missing.push("El nombre es muy largo");
    if (!tab) missing.push("Elige la pestaña del cotizador");
    else if (tab.length > MAX_NAME) missing.push("El nombre de la pestaña es muy largo");
    if (!(product.factor > 0)) missing.push("El multiplicador tiene que ser mayor que 0");
    if (!(product.topperPrice >= 0)) missing.push("El precio del topper no puede ser negativo");

    if (!product.sizes.length) missing.push("Agrega al menos un tamaño");
    else {
        if (product.sizes.filter((size) => size.isBase).length !== 1) missing.push("Marca un solo tamaño como base");
        if (product.sizes.some((size) => !size.label.trim())) missing.push("Cada tamaño necesita su nombre");
        if (product.sizes.some((size) => !(size.scale > 0))) missing.push("Cada tamaño necesita una escala mayor que 0");
        if (product.sizes.some((size) => (size.variant?.trim().length ?? 0) > MAX_VARIANT)) missing.push("Una variante es muy larga");
        const keys = product.sizes.filter((size) => size.label.trim()).map((size) => getPastrySizeText(size).toLowerCase());
        if (new Set(keys).size !== keys.length) missing.push("Hay dos tamaños con la misma medida y variante");
    }

    if (!product.base.every(isValidItem)) missing.push("Revisa los ingredientes de la receta base");
    if (product.active && !product.base.length) missing.push("Para publicarla, la receta base necesita al menos un ingrediente");

    product.groups.forEach((group) => {
        const label = group.name.trim() || "Un grupo de opciones";
        if (!group.name.trim()) missing.push("Cada grupo de opciones necesita su nombre");
        if (!(Number.isInteger(group.min) && group.min >= 0 && Number.isInteger(group.max) && group.max >= Math.max(1, group.min)))
            missing.push(`${label}: el máximo tiene que ser 1 o más y no menor que el mínimo`);
        if (group.freeMax !== null && !(Number.isInteger(group.freeMax) && group.freeMax >= 0))
            missing.push(`${label}: las incluidas tienen que ser un número entero`);
        if (group.options.some((option) => !option.name.trim())) missing.push(`${label}: cada opción necesita su nombre`);
        if (!group.options.every((option) => option.items.every(isValidItem))) missing.push(`${label}: revisa los ingredientes de sus opciones`);
        if (group.options.filter((option) => option.active).length < group.min)
            missing.push(`${label}: necesita al menos ${group.min} opciones activas`);
    });

    return missing;
};

/* ============ Catálogo público ============ */

export interface ICatalogOption {
    id: number;
    name: string;
    /** Precio de la opción en cada tamaño, por id de tamaño. */
    prices: Record<string, number>;
}

export interface ICatalogGroup {
    id: number;
    name: string;
    min: number;
    max: number;
    freeMax: number | null;
    options: ICatalogOption[];
}

export interface ICatalogSize {
    id: number;
    label: string;
    variant: string | null;
    price: number;
    /** Si el API lo manda, marca el tamaño base; si no, el primero hace de base. */
    isBase?: boolean;
}

export interface ICatalogProduct {
    id: number;
    name: string;
    description: string;
    tab: string;
    needsPhoto: boolean;
    allowsTopper: boolean;
    topperPrice: number;
    sizes: ICatalogSize[];
    groups: ICatalogGroup[];
}

export interface ICatalog {
    tabs: string[];
    products: ICatalogProduct[];
}

/** El tamaño con que arranca la receta: el base si se sabe, si no el primero. */
export const getCatalogDefaultSizeId = (product: ICatalogProduct) =>
    (product.sizes.find((size) => size.isBase) ?? product.sizes[0])?.id ?? null;

/** Las medidas únicas, en el orden de los tamaños. */
export const getCatalogMeasures = (product: ICatalogProduct) => {
    const measures = [...new Set(product.sizes.map((size) => size.label))];
    // Si todas son pulgadas (4.5", 6"…) van de menor a mayor; si no, en el orden de la receta
    const inches = measures.map((label) => parseFloat(label));
    if (inches.some((value) => Number.isNaN(value))) return measures;
    return measures.sort((a, b) => parseFloat(a) - parseFloat(b));
};

/** Las variantes únicas (1 altura, doble altura…), en el orden en que aparecen. Vacío: la receta no usa variantes. */
export const getCatalogVariants = (product: ICatalogProduct) => [
    ...new Set(product.sizes.flatMap((size) => (size.variant ? [size.variant] : []))),
];

/** El tamaño de esa medida en esa variante, si existe. */
export const getCatalogSizeFor = (product: ICatalogProduct, label: string, variant: string | null) =>
    product.sizes.find((size) => size.label === label && (size.variant ?? null) === variant);

/** `6" doble altura`: como se nombra el tamaño en el resumen. */
export const getCatalogSizeText = (size: ICatalogSize) => getPastrySizeText(size);

/** El dibujo de dos capas cuando la variante habla de doble altura. */
export const isDoubleVariant = (variant: string | null | undefined) => Boolean(variant && variant.toLowerCase().includes("doble"));

/**
 * El tamaño que queda al tocar una medida: la misma variante si existe ahí; si no (el 4.5" solo en doble
 * altura), cambia a la variante donde sí existe.
 */
export const resolveMeasureChange = (product: ICatalogProduct, sizeId: number | null, measure: string) => {
    const current = product.sizes.find((size) => size.id === sizeId);
    return (current && getCatalogSizeFor(product, measure, current.variant ?? null)) ?? product.sizes.find((size) => size.label === measure) ?? null;
};

/**
 * El tamaño que queda al cambiar de variante: la misma medida si existe en esa variante; si no, la
 * primera medida disponible en ella.
 */
export const resolveVariantChange = (product: ICatalogProduct, sizeId: number | null, variant: string) => {
    const current = product.sizes.find((size) => size.id === sizeId);
    return (
        (current && getCatalogSizeFor(product, current.label, variant)) ?? product.sizes.find((size) => (size.variant ?? null) === variant) ?? null
    );
};

export const getCatalogOptionPrice = (option: ICatalogOption, sizeId: number | null) =>
    sizeId === null ? 0 : option.prices[String(sizeId)] ?? 0;

const getChosenOptions = (group: ICatalogGroup, optionIds: number[]) => group.options.filter((option) => optionIds.includes(option.id));

/** Cuántas de las elegidas del grupo no cuestan nada en ese tamaño. */
const getFreeCount = (group: ICatalogGroup, optionIds: number[], sizeId: number | null) =>
    getChosenOptions(group, optionIds).filter((option) => getCatalogOptionPrice(option, sizeId) === 0).length;

/** Lo que ve el cliente: base, cada opción elegida con su grupo, topper y la suma exacta. */
export const getCatalogBreakdown = (product: ICatalogProduct, sizeId: number | null, optionIds: number[], topper: boolean) => {
    const base = product.sizes.find((size) => size.id === sizeId)?.price ?? 0;
    const lines = product.groups.flatMap((group) =>
        getChosenOptions(group, optionIds).map((option) => ({
            group: group.name,
            name: option.name,
            price: getCatalogOptionPrice(option, sizeId),
        }))
    );
    const topperPrice = topper && product.allowsTopper ? product.topperPrice : 0;
    const total = base + lines.reduce((sum, line) => sum + line.price, 0) + topperPrice;
    return { base, lines, topperPrice, total };
};

export const getCatalogTotal = (product: ICatalogProduct, sizeId: number | null, optionIds: number[], topper: boolean) =>
    getCatalogBreakdown(product, sizeId, optionIds, topper).total;

/** "Elige 1", "Elige 1 o 2", "Elige hasta 3"… para el título del grupo. */
export const getCatalogGroupRule = (group: ICatalogGroup) => {
    if (group.min === group.max) return `Elige ${group.min}`;
    if (group.min === 0) return group.max === 1 ? "Opcional" : `Opcional, hasta ${group.max}`;
    return `Elige de ${group.min} a ${group.max}`;
};

/** Si una opción se puede sumar a lo elegido: sin pasar del máximo ni de las incluidas permitidas. */
export const canAddCatalogOption = (group: ICatalogGroup, optionIds: number[], sizeId: number | null, optionId: number) => {
    if (optionIds.includes(optionId)) return true;
    const option = group.options.find((one) => one.id === optionId);
    if (!option) return false;
    // Con un solo lugar, elegir otra reemplaza a la anterior
    if (group.max === 1) return true;
    if (getChosenOptions(group, optionIds).length >= group.max) return false;
    if (group.freeMax !== null && getCatalogOptionPrice(option, sizeId) === 0) return getFreeCount(group, optionIds, sizeId) < group.freeMax;
    return true;
};

/** Marca o quita una opción respetando las reglas del grupo. */
export const toggleCatalogOption = (group: ICatalogGroup, optionIds: number[], sizeId: number | null, optionId: number) => {
    const inGroup = group.options.map((one) => one.id);
    if (optionIds.includes(optionId)) {
        // Un grupo de un solo lugar que ya pide una elección no se desmarca: se cambia por otra
        if (group.max === 1 && group.min >= 1) return optionIds;
        return optionIds.filter((one) => one !== optionId);
    }
    if (!canAddCatalogOption(group, optionIds, sizeId, optionId)) return optionIds;
    if (group.max === 1) return [...optionIds.filter((one) => !inGroup.includes(one)), optionId];
    return [...optionIds, optionId];
};

/** Lo que falta elegir en los grupos, en palabras del cliente. Vacío es listo. */
export const getCatalogGroupsMissing = (product: ICatalogProduct, sizeId: number | null, optionIds: number[]) => {
    const missing: string[] = [];
    product.groups.forEach((group) => {
        const count = getChosenOptions(group, optionIds).length;
        if (count < group.min)
            missing.push(group.min === 1 ? `Elige ${group.name.toLowerCase()}` : `Elige al menos ${group.min} en ${group.name.toLowerCase()}`);
        else if (count > group.max) missing.push(`En ${group.name.toLowerCase()} elige máximo ${group.max}`);
        else if (group.freeMax !== null && getFreeCount(group, optionIds, sizeId) > group.freeMax)
            missing.push(
                group.freeMax === 0
                    ? `En ${group.name.toLowerCase()} solo caben opciones especiales`
                    : `En ${group.name.toLowerCase()} solo puedes elegir ${group.freeMax} incluida: la otra tiene que ser especial`
            );
    });
    return missing;
};

/** Los grupos de una sola opción obligatoria arrancan con la primera, como la masa de antes. */
export const getCatalogDefaultOptionIds = (product: ICatalogProduct) =>
    product.groups.filter((group) => group.min === 1 && group.max === 1 && group.options.length).map((group) => group.options[0].id);

/** Lo que el cliente (o la pastelera) tiene elegido, antes de cruzarlo con el catálogo vigente. */
export interface ICatalogPick {
    productId: number | null;
    sizeId: number | null;
    optionIds: number[];
}

/**
 * Cruza lo elegido con el catálogo: sin elección (o si la receta ya no está publicada) arranca con la
 * primera receta, su primer tamaño y las opciones obligatorias de un solo lugar; si el catálogo cambió,
 * se quedan solo el tamaño y las opciones que todavía existen.
 */
export const resolveCatalogPick = (catalog: ICatalog | null, pick: ICatalogPick) => {
    const first = catalog?.products[0];
    const chosen = catalog?.products.find((one) => one.id === pick.productId);
    if (!chosen) {
        return { product: first, sizeId: first ? getCatalogDefaultSizeId(first) : null, optionIds: first ? getCatalogDefaultOptionIds(first) : [] };
    }
    const existing = new Set(chosen.groups.flatMap((group) => group.options.map((option) => option.id)));
    return {
        product: chosen,
        sizeId: chosen.sizes.some((size) => size.id === pick.sizeId) ? pick.sizeId : getCatalogDefaultSizeId(chosen),
        optionIds: pick.optionIds.filter((id) => existing.has(id)),
    };
};

/** Al elegir otra receta: su primer tamaño y las opciones obligatorias de un solo lugar. */
export const getCatalogPickFor = (product: ICatalogProduct): ICatalogPick => ({
    productId: product.id,
    sizeId: getCatalogDefaultSizeId(product),
    optionIds: getCatalogDefaultOptionIds(product),
});

/* ============ API de gestión ============ */

const getHeaders = (token: string) => ({ "x-gestion-token": token });

export const fetchPastryIngredients = (token: string, includeArchived = false, signal?: AbortSignal) =>
    httpGet<IPastryIngredient[]>(`/gestion/pastry/ingredients${includeArchived ? "?archived=1" : ""}`, {
        signal,
        headers: getHeaders(token),
    });

export const createPastryIngredient = (token: string, input: IPastryIngredientInput) =>
    httpPost<IPastryIngredient>("/gestion/pastry/ingredients", input, { headers: getHeaders(token) });

export const updatePastryIngredient = (token: string, id: number, input: IPastryIngredientInput) =>
    httpPut<IPastryIngredient>(`/gestion/pastry/ingredients/${id}`, input, { headers: getHeaders(token) });

export const archivePastryIngredient = (token: string, id: number, archived: boolean) =>
    httpPost<IPastryIngredient>(`/gestion/pastry/ingredients/${id}/archive`, { archived }, { headers: getHeaders(token) });

export const deletePastryIngredient = (token: string, id: number) =>
    httpDelete<void>(`/gestion/pastry/ingredients/${id}`, { headers: getHeaders(token) });

export const fetchPastryProducts = (token: string, signal?: AbortSignal) =>
    httpGet<IPastryProductSummary[]>("/gestion/pastry/products", { signal, headers: getHeaders(token) });

export const fetchPastryProduct = (token: string, id: number, signal?: AbortSignal) =>
    httpGet<IPastryProduct>(`/gestion/pastry/products/${id}`, { signal, headers: getHeaders(token) });

export const createPastryProduct = (token: string, input: IPastryProductInput) =>
    httpPost<IPastryProduct>("/gestion/pastry/products", input, { headers: getHeaders(token) });

export const updatePastryProduct = (token: string, id: number, input: IPastryProductInput) =>
    httpPut<IPastryProduct>(`/gestion/pastry/products/${id}`, input, { headers: getHeaders(token) });

export const deletePastryProduct = (token: string, id: number) =>
    httpDelete<void>(`/gestion/pastry/products/${id}`, { headers: getHeaders(token) });

/** Lo que el cotizador y el registro manual ofrecen: solo lo publicado. */
export const fetchCatalog = (signal?: AbortSignal) => httpGet<ICatalog>("/quotes/catalog", { signal });
