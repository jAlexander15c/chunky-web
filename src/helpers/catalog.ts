import { useEffect, useMemo, useState } from "react";

import { getCategories } from "./getCategories";
import { getItems } from "./getItems";

import type { ICategory, IItem } from "@/interfaces";

const CATEGORY_CACHE_KEY = "chunky-categories-cache";
const ITEMS_CACHE_PREFIX = "chunky-items-cache:";

export const CATEGORY_IMAGE_ROUTE = "https://pub-159df1e57b1a433fa45a449347b9a4ac.r2.dev/categorias/";

export type CategoryTone = "mantequilla" | "orquidea" | "sky" | "lima";

interface ICategoryPresentation {
    image: string;
    description: string;
    tone: CategoryTone;
    origin?: string;
    schedule?: string;
}

/** Textos de las categorias conocidas, por nombre normalizado (sin tildes, minusculas). */
const CATEGORY_PRESENTATION: Record<string, ICategoryPresentation> = {
    galletas: {
        image: "cGalleta.jpeg",
        description: "Estilo New York, gruesas y suaves por dentro",
        tone: "mantequilla",
        origin: "New York",
    },
    salados: {
        image: "cSalado.jpeg",
        description: "Focaccias, tostadas y pasta",
        tone: "lima",
        origin: "Italia",
    },
    bebidas: {
        image: "cBebida.jpeg",
        description: "Matcha y más, frías o calientes",
        tone: "sky",
        origin: "Japón",
    },
    desayunos: {
        image: "cDesayuno.jpeg",
        description: "Sabores especiales para comenzar la mañana",
        tone: "orquidea",
        schedule: "8 a 11 am",
    },
    postres: {
        image: "cPostre.jpeg",
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

const itemsCache = new Map<string, ICacheEntry<IItem[]>>();
const itemRequests = new Map<string, Promise<IItem[]>>();

/** Categorias en cache si siguen vigentes. */
const getFreshCategories = () => (isCacheFresh(categoriesCache) ? categoriesCache!.value : null);

function normalizeCategoryColor(color?: string) {
    return (color ?? "").trim().toUpperCase();
}

export async function fetchCategoriesCached() {
    const freshCategories = getFreshCategories();
    if (freshCategories) return freshCategories;

    if (!categoriesRequest) {
        categoriesRequest = getCategories()
            .then((response: any) => {
                const nextCategories = response.data.categories as ICategory[];
                categoriesCache = { value: nextCategories, savedAt: Date.now() };
                writeSessionEntry(CATEGORY_CACHE_KEY, categoriesCache);
                return nextCategories;
            })
            .finally(() => {
                categoriesRequest = null;
            });
    }

    return categoriesRequest;
}

function readCachedItems(categoryId: string) {
    const memoryEntry = itemsCache.get(categoryId);
    if (isCacheFresh(memoryEntry)) return memoryEntry!.value;

    const sessionEntry = readSessionEntry<IItem[]>(`${ITEMS_CACHE_PREFIX}${categoryId}`);

    // If session storage has an array with items, use it. If it's an empty
    // array (likely from a previous failed fetch), ignore it so we attempt
    // a fresh fetch from the API.
    if (sessionEntry && Array.isArray(sessionEntry.value) && sessionEntry.value.length > 0) {
        itemsCache.set(categoryId, sessionEntry);
        return sessionEntry.value;
    }

    return undefined;
}

export async function fetchItemsByCategoryCached(categoryId: string) {
    if (!categoryId) return [];

    const cached = readCachedItems(categoryId);
    if (cached) return cached;

    let request = itemRequests.get(categoryId);

    if (!request) {
        request = getItems({ categoryId })
            .then((response: any) => {
                // `getItems` may return either an array of items or an object with `items`.
                const nextItems: IItem[] = Array.isArray(response)
                    ? response
                    : (response?.items ?? []);

                const entry = { value: nextItems, savedAt: Date.now() };
                itemsCache.set(categoryId, entry);
                writeSessionEntry(`${ITEMS_CACHE_PREFIX}${categoryId}`, entry);
                return nextItems;
            })
            .finally(() => {
                itemRequests.delete(categoryId);
            });

        itemRequests.set(categoryId, request);
    }

    return request;
}

export function useCategories() {
    const [categories, setCategories] = useState<ICategory[]>(() => getFreshCategories() ?? []);
    const [loading, setLoading] = useState(() => !getFreshCategories());
    const [error, setError] = useState<string>("");

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
            } catch (e: any) {
                if (!cancelled) {
                    setError(e?.message ?? "Error");
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

export function useItems(categoryId?: string) {
    const initialItems = useMemo(() => (categoryId ? readCachedItems(categoryId) ?? [] : []), [categoryId]);
    const [items, setItems] = useState<IItem[]>(initialItems);
    const [loading, setLoading] = useState(Boolean(categoryId) && initialItems.length === 0);
    const [error, setError] = useState<string>("");

    useEffect(() => {
        let cancelled = false;

        if (!categoryId) {
            setItems([]);
            setLoading(false);
            setError("");
            return;
        }

        const cached = readCachedItems(categoryId);
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
                const nextItems = await fetchItemsByCategoryCached(categoryId);

                if (!cancelled) {
                    setItems(nextItems);
                }
            } catch (e: any) {
                if (!cancelled) {
                    setError(e?.message ?? "Error");
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
    }, [categoryId]);

    return { items, loading, error };
}

/** Presentacion por nombre de categoria; las desconocidas solo toman el tono de su color. */
export const getCategoryPresentation = (category?: Pick<ICategory, "name" | "color">): ICategoryPresentation => {
    const known = CATEGORY_PRESENTATION[normalizeCategoryName(category?.name)];
    if (known) return known;

    return {
        image: CATEGORY_PRESENTATION.postres.image,
        description: "",
        tone: COLOR_TONE[normalizeCategoryColor(category?.color)] ?? "mantequilla",
    };
};

/** Foto de la categoria en el bucket de R2 (galletas, salados, bebidas, desayunos, postres). */
export const getCategoryImageUrl = (name: string) =>
    `${CATEGORY_IMAGE_ROUTE}${(CATEGORY_PRESENTATION[name] ?? CATEGORY_PRESENTATION.postres).image}`;

export const getCategoryByName =(categories: ICategory[], name: string) =>
    categories.find((category) => normalizeCategoryName(category.name) === name);

export const getCategoryById = (categoryId?: string) => {
    if (!categoryId || !categoriesCache) return undefined;
    // Para nombres sirve aunque la cache este vencida
    return categoriesCache.value.find((category) => category.id === categoryId);
};

export function shouldDisplayCategory(category: ICategory, date = new Date()) {
    const hour = date.getHours();
    const categoryColor = normalizeCategoryColor(category.color);

    return !(categoryColor === "PURPLE" && (hour < 8 || hour > 11));
}

export function getCategoryName(categoryId?: string) {
    if (!categoryId || !categoriesCache) return "Items";
    return categoriesCache.value.find((category) => category.id === categoryId)?.name ?? "Items";
}

export function hasItemAvailableForSale(item: IItem) {
    if (!Array.isArray(item.variants) || item.variants.length === 0) return false;

    return item.variants.some((variant: any) => {
        const stores = Array.isArray(variant?.stores) ? variant.stores : [];
        return stores.some((store: any) => store?.available_for_sale === true);
    });
}

export const isWithinOperatingHours = (date = new Date()) => {
    const dayOfWeek = date.getDay();
    const hour = date.getHours();

    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (isSunday) return false;

    if (isWeekday) {
        return hour >= 8 && hour < 20;
    }

    if (isSaturday) {
        return hour >= 8 && hour < 18;
    }

    return false;
}