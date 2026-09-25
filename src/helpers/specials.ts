import { useEffect, useMemo, useState } from "react";

import {
    fetchItemsByCategoryCached,
    getCatalogScope,
    getCategoryImageUrl,
    hasItemAvailableForSale,
    isSpecialCategory,
    shouldDisplayCategory,
    useCategories,
} from "./catalog";
import { getItemPrice } from "./order";
import { useSettings } from "./settings";

import type { ICategory } from "@/interfaces";

/** Lo que se sabe de los productos de una especial. Sin dato todavia, esta cargando. */
interface ISpecialStock {
    count: number;
    /** El precio mas bajo de lo que esta a la venta; null si no hay nada. */
    fromPrice: number | null;
    /** No se pudieron pedir los productos: se muestra como especial, sin cifras ni "Muy pronto". */
    failed?: boolean;
}

export interface ISpecialCategory {
    category: ICategory;
    photo: string | null;
    /** Mientras llegan sus productos. */
    isLoading: boolean;
    /** Sin productos a la venta: se anuncia, pero no se puede pedir. */
    isComingSoon: boolean;
    productCount: number;
    fromPrice: number | null;
}

/** Cuantos productos de la categoria se venden y desde que precio (sin el armador de pasta). */
const getSpecialStock = (items: Awaited<ReturnType<typeof fetchItemsByCategoryCached>>, categoryId: string, pastaItemId?: string): ISpecialStock => {
    const forSale = items.filter((item) => item.category_id === categoryId && item.id !== pastaItemId && hasItemAvailableForSale(item));
    const prices = forSale.map(getItemPrice).filter((price) => price > 0);
    return { count: forSale.length, fromPrice: prices.length > 0 ? Math.min(...prices) : null };
};

/**
 * Las categorias especiales que hoy se muestran (el dia de pasta ninguna), en el orden de Loyverse,
 * con su foto y lo que tienen a la venta. Los productos salen de la misma cache que usa /items.
 */
export const useSpecialCategories = (): ISpecialCategory[] => {
    const { categories } = useCategories();
    const { settings, isReady } = useSettings();
    const scope = getCatalogScope(settings.pastaMode);
    const pastaItemId = settings.pasta?.itemId;

    const specials = useMemo(
        () => (isReady ? categories.filter((category) => isSpecialCategory(category) && shouldDisplayCategory(category, settings)) : []),
        [categories, isReady, settings]
    );
    const [stock, setStock] = useState<Record<string, ISpecialStock>>({});

    useEffect(() => {
        let cancelled = false;

        specials.forEach((category) => {
            fetchItemsByCategoryCached(category.id, scope)
                .then((items) => getSpecialStock(items, category.id, pastaItemId))
                .catch((): ISpecialStock => ({ count: 0, fromPrice: null, failed: true }))
                .then((next) => {
                    if (!cancelled) setStock((current) => ({ ...current, [category.id]: next }));
                });
        });

        return () => {
            cancelled = true;
        };
    }, [specials, scope, pastaItemId]);

    return specials.map((category) => {
        const entry = stock[category.id];
        return {
            category,
            photo: getCategoryImageUrl(category),
            isLoading: !entry,
            isComingSoon: Boolean(entry && !entry.failed && entry.count === 0),
            productCount: entry?.count ?? 0,
            fromPrice: entry?.fromPrice ?? null,
        };
    });
};
