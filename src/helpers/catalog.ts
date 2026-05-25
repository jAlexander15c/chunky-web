import { useEffect, useMemo, useState } from "react";

import { getCategories } from "./getCategories";
import { getItems } from "./getItems";

import type { ICategory, IItem } from "@/interfaces";

const CATEGORY_CACHE_KEY = "chunky-categories-cache";
const ITEMS_CACHE_PREFIX = "chunky-items-cache:";

const CATEGORY_PRESENTATION: Record<string, { image: string; description: string }> = {
    ORANGE: {
        image: "cGalleta.jpeg",
        description: "Galletas crujientes por fuera y suaves por dentro, al estilo New York",
    },
    RED: {
        image: "cSalado.jpeg",
        description: "Deliciosas opciones saladas para cualquier hora del dia",
    },
    BLUE: {
        image: "cBebida.jpeg",
        description: "Bebidas pensadas para acompanar cada bite, frias o calientes",
    },
    PURPLE: {
        image: "cDesayuno.jpeg",
        description: "Sabores especiales para comenzar la mañana",
    },
    DEFAULT: {
        image: "cPostre.jpeg",
        description: "Sabor, textura y dulzura en su mejor forma",
    },
};

let categoriesCache: ICategory[] | null = readSessionValue<ICategory[]>(CATEGORY_CACHE_KEY);
let categoriesRequest: Promise<ICategory[]> | null = null;

const itemsCache = new Map<string, IItem[]>();
const itemRequests = new Map<string, Promise<IItem[]>>();

function normalizeCategoryColor(color?: string) {
    return (color ?? "").trim().toUpperCase();
}

function readSessionValue<T>(key: string): T | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : null;
    } catch {
        return null;
    }
}

function writeSessionValue<T>(key: string, value: T) {
    if (typeof window === "undefined") return;

    try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
        return;
    }
}

export async function fetchCategoriesCached() {
    if (categoriesCache) return categoriesCache;

    if (!categoriesRequest) {
        categoriesRequest = getCategories()
            .then((response: any) => {
                const nextCategories = response.data.categories as ICategory[];
                categoriesCache = nextCategories;
                writeSessionValue(CATEGORY_CACHE_KEY, nextCategories);
                return nextCategories;
            })
            .finally(() => {
                categoriesRequest = null;
            });
    }

    return categoriesRequest;
}

function readCachedItems(categoryId: string) {
    const memoryValue = itemsCache.get(categoryId);
    if (memoryValue) return memoryValue;

    const sessionValue = readSessionValue<IItem[]>(`${ITEMS_CACHE_PREFIX}${categoryId}`);

    // If session storage has an array with items, use it. If it's an empty
    // array (likely from a previous failed fetch), ignore it so we attempt
    // a fresh fetch from the API.
    if (Array.isArray(sessionValue) && sessionValue.length > 0) {
        itemsCache.set(categoryId, sessionValue);
        return sessionValue;
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

                itemsCache.set(categoryId, nextItems);
                writeSessionValue(`${ITEMS_CACHE_PREFIX}${categoryId}`, nextItems);
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
    const [categories, setCategories] = useState<ICategory[]>(categoriesCache ?? []);
    const [loading, setLoading] = useState(!categoriesCache);
    const [error, setError] = useState<string>("");

    useEffect(() => {
        let cancelled = false;

        if (categoriesCache) {
            setCategories(categoriesCache);
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

export function getCategoryPresentation(color?: string) {
    return CATEGORY_PRESENTATION[normalizeCategoryColor(color)] ?? CATEGORY_PRESENTATION.DEFAULT;
}

export function shouldDisplayCategory(category: ICategory, date = new Date()) {
    const hour = date.getHours();
    const categoryColor = normalizeCategoryColor(category.color);

    return !(categoryColor === "PURPLE" && (hour < 8 || hour > 11));
}

export function getCategoryName(categoryId?: string) {
    if (!categoryId || !categoriesCache) return "Items";
    return categoriesCache.find((category) => category.id === categoryId)?.name ?? "Items";
}

export function hasItemAvailableForSale(item: IItem) {
    const stores = Array.isArray(item.variants[0]?.stores) ? item.variants[0].stores : [];
    return stores.some((store: any) => store?.available_for_sale);
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