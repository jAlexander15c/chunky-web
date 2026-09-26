import { useEffect, useMemo, useRef, useState } from "react";

import { getCategories } from "./getCategories";
import { getApiUrl } from "./getHttp";
import { getItems } from "./getItems";
import { getNextOpeningLabel, getOpeningStatusLabel, isWithinOperatingHours } from "./hours";
import type { IWeekHours, StoreOverride } from "./hours";
import { keepIfSame, useLiveRefresh } from "./live-refresh";

import type { ICategory, IItem } from "@/interfaces";

const CATEGORY_CACHE_KEY = "chunky-categories-cache";
const ITEMS_CACHE_PREFIX = "chunky-items-cache:";

type CategoryTone = "mantequilla" | "orquidea" | "sky" | "lima";

interface ICategoryPresentation {
    description: string;
    tone: CategoryTone;
    origin?: string;
    schedule?: string;
}

/** Textos de las categorias conocidas, por nombre normalizado (sin tildes, minusculas). */
const CATEGORY_PRESENTATION: Record<string, ICategoryPresentation> = {
    galletas: {
        description: "Estilo New York, gruesas y suaves por dentro",
        tone: "mantequilla",
        origin: "New York",
    },
    salados: {
        description: "Focaccias, tostadas y pasta",
        tone: "lima",
        origin: "Italia",
    },
    bebidas: {
        description: "Matcha y más, frías o calientes",
        tone: "sky",
        origin: "Japón",
    },
    desayunos: {
        description: "Sabores especiales para comenzar la mañana",
        tone: "orquidea",
    },
    postres: {
        description: "Sabor, textura y dulzura en su mejor forma",
        tone: "mantequilla",
    },
};

/** Tono para categorias sin texto propio (ej. especiales de temporada), segun su color en el POS. */
const COLOR_TONE: Record<string, CategoryTone> = {
    ORANGE: "mantequilla",
    RED: "lima",
    BLUE: "sky",
    PURPLE: "orquidea",
    LIME: "lima",
    // Los que se pueden elegir al crear una categoria desde el tablero
    GREEN: "lima",
    PINK: "orquidea",
    GREY: "sky",
};

const normalizeCategoryName = (name?: string) =>
    (name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// Cuanto tiempo se reutiliza el catalogo antes de volver a pedirlo al API
// (asi un producto activado en Loyverse aparece sin abrir una pestaña nueva).
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

interface ICacheEntry<T> {
    value: T;
    savedAt: number;
}

const isCacheFresh = (entry?: ICacheEntry<unknown> | null) =>
    Boolean(entry) && Date.now() - (entry as ICacheEntry<unknown>).savedAt < SESSION_CACHE_TTL_MS;

/** Lee una entrada de sessionStorage; las vencidas o con el formato anterior (sin savedAt) se ignoran. */
const readSessionEntry = <T,>(key: string): ICacheEntry<T> | null => {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.sessionStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        const isEntry = parsed && typeof parsed === "object" && "value" in parsed && typeof parsed.savedAt === "number";
        return isEntry && isCacheFresh(parsed) ? parsed as ICacheEntry<T> : null;
    } catch {
        return null;
    }
};

const writeSessionEntry = <T,>(key: string, entry: ICacheEntry<T>) => {
    if (typeof window === "undefined") return;

    try {
        window.sessionStorage.setItem(key, JSON.stringify(entry));
    } catch {
        return;
    }
};

let categoriesCache: ICacheEntry<ICategory[]> | null = readSessionEntry<ICategory[]>(CATEGORY_CACHE_KEY);
let categoriesRequest: Promise<ICategory[]> | null = null;

/**
 * El API devuelve otro menu el dia de pasta, asi que la cache de productos se guarda aparte por modo:
 * un menu guardado antes del cambio no se muestra despues.
 */
type CatalogScope = "normal" | "pasta";

export const getCatalogScope = (isPastaMode: boolean): CatalogScope => (isPastaMode ? "pasta" : "normal");

const getItemsCacheKey = (categoryId: string, scope: CatalogScope) => `${scope}:${categoryId}`;

const itemsCache = new Map<string, ICacheEntry<IItem[]>>();
const itemRequests = new Map<string, Promise<IItem[]>>();

/** Categorias en cache si siguen vigentes. */
const getFreshCategories = () => (isCacheFresh(categoriesCache) ? categoriesCache!.value : null);

function normalizeCategoryColor(color?: string) {
    return (color ?? "").trim().toUpperCase();
}

/** Con `force` se ignora la cache (la caja revalida en segundo plano). */
async function fetchCategoriesCached(force = false) {
    const freshCategories = force ? null : getFreshCategories();
    if (freshCategories) return freshCategories;

    if (!categoriesRequest) {
        categoriesRequest = getCategories()
            .then((response) => {
                const nextCategories = response.data.categories;
                categoriesCache = { value: nextCategories, savedAt: Date.now() };
                writeSessionEntry(CATEGORY_CACHE_KEY, categoriesCache);
                return nextCategories;
            })
            .catch((error) => {
                console.error("[get-categories] error:", error?.status, error?.message);
                throw error;
            })
            .finally(() => {
                categoriesRequest = null;
            });
    }

    return categoriesRequest;
}

function readCachedItems(categoryId: string, scope: CatalogScope) {
    const cacheKey = getItemsCacheKey(categoryId, scope);
    const memoryEntry = itemsCache.get(cacheKey);
    if (isCacheFresh(memoryEntry)) return memoryEntry!.value;

    const sessionEntry = readSessionEntry<IItem[]>(`${ITEMS_CACHE_PREFIX}${cacheKey}`);

    // If session storage has an array with items, use it. If it's an empty
    // array (likely from a previous failed fetch), ignore it so we attempt
    // a fresh fetch from the API.
    if (sessionEntry && Array.isArray(sessionEntry.value) && sessionEntry.value.length > 0) {
        itemsCache.set(cacheKey, sessionEntry);
        return sessionEntry.value;
    }

    return undefined;
}

export async function fetchItemsByCategoryCached(categoryId: string, scope: CatalogScope = "normal", force = false) {
    if (!categoryId) return [];

    const cacheKey = getItemsCacheKey(categoryId, scope);
    const cached = force ? undefined : readCachedItems(categoryId, scope);
    if (cached) return cached;

    let request = itemRequests.get(cacheKey);

    if (!request) {
        request = getItems({ categoryId })
            .then((response) => {
                // `getItems` may return either an array of items or an object with `items`.
                const nextItems: IItem[] = Array.isArray(response)
                    ? response
                    : (response?.items ?? []);

                const entry = { value: nextItems, savedAt: Date.now() };
                itemsCache.set(cacheKey, entry);
                writeSessionEntry(`${ITEMS_CACHE_PREFIX}${cacheKey}`, entry);
                return nextItems;
            })
            .catch((error) => {
                console.error(`[get-items] error category_id=${categoryId}:`, error?.status, error?.message);
                throw error;
            })
            .finally(() => {
                itemRequests.delete(cacheKey);
            });

        itemRequests.set(cacheKey, request);
    }

    return request;
}

/** `live`: para la caja, que queda abierta todo el dia y tiene que ver los cambios del tablero. */
interface ICatalogHookOptions {
    live?: boolean;
}

export function useCategories({ live = false }: ICatalogHookOptions = {}) {
    const [categories, setCategories] = useState<ICategory[]>(() => getFreshCategories() ?? []);
    const [loading, setLoading] = useState(() => !getFreshCategories());
    const [error, setError] = useState<string>("");

    useLiveRefresh(() => {
        fetchCategoriesCached(true)
            .then((next) => setCategories((current) => keepIfSame(current, next)))
            .catch(() => undefined);
    }, live);

    useEffect(() => {
        let cancelled = false;

        const freshCategories = getFreshCategories();
        if (freshCategories) {
            setCategories(freshCategories);
            setLoading(false);
            return;
        }

        (async () => {
            try {
                setLoading(true);
                setError("");
                const nextCategories = await fetchCategoriesCached();

                if (!cancelled) {
                    setCategories(nextCategories);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : "Error");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return { categories, loading, error };
}

export function useItems(categoryId?: string, scope: CatalogScope = "normal", { live = false }: ICatalogHookOptions = {}) {
    const initialItems = useMemo(() => (categoryId ? readCachedItems(categoryId, scope) ?? [] : []), [categoryId, scope]);
    const [items, setItems] = useState<IItem[]>(initialItems);
    const [loading, setLoading] = useState(Boolean(categoryId) && initialItems.length === 0);
    const [error, setError] = useState<string>("");

    // Si se cambio de categoria mientras llegaba la respuesta, esa respuesta ya no se muestra
    const currentKeyRef = useRef("");
    useEffect(() => {
        currentKeyRef.current = categoryId ? getItemsCacheKey(categoryId, scope) : "";
    }, [categoryId, scope]);

    useLiveRefresh(() => {
        if (!categoryId) return;
        const requestedKey = getItemsCacheKey(categoryId, scope);
        fetchItemsByCategoryCached(categoryId, scope, true)
            .then((next) => {
                if (currentKeyRef.current === requestedKey) setItems((current) => keepIfSame(current, next));
            })
            .catch(() => undefined);
    }, live);

    useEffect(() => {
        let cancelled = false;

        if (!categoryId) {
            setItems([]);
            setLoading(false);
            setError("");
            return;
        }

        const cached = readCachedItems(categoryId, scope);
        if (cached) {
            setItems(cached);
            setLoading(false);
            setError("");
            return;
        }

        (async () => {
            try {
                setLoading(true);
                setError("");
                const nextItems = await fetchItemsByCategoryCached(categoryId, scope);

                if (!cancelled) {
                    setItems(nextItems);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : "Error");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [categoryId, scope]);

    return { items, loading, error };
}

/**
 * Las categorias del menu fijo son las de CATEGORY_PRESENTATION. Cualquier otra que se cree en el
 * tablero es especial (temporada, fecha, campaña) y la web la destaca para venderla.
 */
export const isSpecialCategory = (category?: Pick<ICategory, "name">) =>
    Boolean(category) && !CATEGORY_PRESENTATION[normalizeCategoryName(category?.name)];

/** Loyverse no guarda descripcion de categoria: todas las especiales usan este texto. */
const SPECIAL_CATEGORY_DESCRIPTION = "Edición especial, por tiempo limitado";

/** Presentacion por nombre de categoria; las desconocidas solo toman el tono de su color. */
export const getCategoryPresentation = (category?: Pick<ICategory, "name" | "color">): ICategoryPresentation => {
    const known = CATEGORY_PRESENTATION[normalizeCategoryName(category?.name)];
    if (known) return known;

    return {
        description: category ? SPECIAL_CATEGORY_DESCRIPTION : "",
        tone: COLOR_TONE[normalizeCategoryColor(category?.color)] ?? "mantequilla",
    };
};

/**
 * Foto de la categoria, guardada en nuestra API (se sube desde el tablero). La version va en la URL:
 * si la foto cambia, cambia la URL y el navegador no se queda con la vieja. Null si no tiene foto.
 */
export const getCategoryImageUrl = (category?: Pick<ICategory, "id" | "image_version">) =>
    category?.image_version
        ? getApiUrl(`/categories/${encodeURIComponent(category.id)}/image?v=${category.image_version}`)
        : null;

export const getCategoryByName =(categories: ICategory[], name: string) =>
    categories.find((category) => normalizeCategoryName(category.name) === name);

export const getCategoryById = (categoryId?: string) => {
    if (!categoryId || !categoriesCache) return undefined;
    // Para nombres sirve aunque la cache este vencida
    return categoriesCache.value.find((category) => category.id === categoryId);
};

/** El dia de pasta solo se muestra la categoria de bebidas (la pasta tiene su propia entrada). */
interface IPastaModeContext {
    pastaMode: boolean;
    beveragesCategoryId: string | null;
}

export const shouldDisplayCategory = (category: ICategory, pastaContext?: IPastaModeContext) => {
    if (pastaContext?.pastaMode) return category.id === pastaContext.beveragesCategoryId;
    return true;
};

export function getCategoryName(categoryId?: string) {
    if (!categoryId || !categoriesCache) return "Items";
    return categoriesCache.value.find((category) => category.id === categoryId)?.name ?? "Items";
}

export function hasItemAvailableForSale(item: IItem) {
    if (!Array.isArray(item.variants) || item.variants.length === 0) return false;

    return item.variants.some((variant) => {
        const stores = Array.isArray(variant?.stores) ? variant.stores : [];
        return stores.some((store) => store?.available_for_sale === true);
    });
}

/** Lo que decide si hoy se reciben pedidos: sale de GET /settings/public (ver useSettings). */
interface IOrderingContext {
    pastaMode: boolean;
    openingHours: IWeekHours;
    storeOverride: StoreOverride | null;
}

/**
 * Cerrado a mano desde el tablero gana a todo, incluso al modo pasta; abierto a mano abre todo el dia.
 * Si no, el dia de pasta manda el interruptor (se puede pedir aunque el horario diga cerrado) y el
 * resto de los dias, el horario de la semana.
 */
export const isAcceptingOrders = (context: IOrderingContext, date = new Date()) => {
    if (context.storeOverride === "closed") return false;
    if (context.storeOverride === "open" || context.pastaMode) return true;
    return isWithinOperatingHours(context.openingHours, date);
};

/** Estado de la barra en una frase; abierto a mano o el dia de pasta no hay hora de cierre que anunciar. */
export const getOrderingStatusLabel = (context: IOrderingContext, isOpen: boolean, date = new Date()) => {
    if (context.storeOverride === "closed") return `Cerrado hoy · ${getNextOpeningLabel(context.openingHours, date, true)}`;
    if (context.storeOverride === "open") return "Abierto hoy";
    if (context.pastaMode) return "Pedidos abiertos hoy";
    return getOpeningStatusLabel(context.openingHours, isOpen, date);
};

/** Cuando vuelve a abrir, para las tarjetas y avisos de cerrado. */
export const getClosedLabel = (context: IOrderingContext, date = new Date()) =>
    getNextOpeningLabel(context.openingHours, date, context.storeOverride === "closed");