import { useEffect, useState } from "react";
import { httpGet } from "./getHttp";
import { getCartLinePrice, getItemPrice } from "./order";
import type { ICartLine } from "./order";
import type { IItem } from "@/interfaces";

export type PromoKind = "two_for_one" | "percent";
export type PromoChannel = "web" | "caja" | "both";
export interface IPublicPromo {
    id: number; name: string; kind: PromoKind; percent: number | null;
    itemIds: string[]; categoryIds: string[]; endsOn: string | null;
}
export interface IPromoInput {
    name: string; kind: PromoKind; percent: number | null;
    itemIds: string[]; categoryIds: string[]; channel: PromoChannel;
    startsOn: string | null; endsOn: string | null; isEnabled: boolean;
}
export interface IPromo extends IPromoInput { id: number; createdAt: string; updatedAt: string }
export interface IPromoAdmin extends IPromo { isActiveNow: boolean; todayUses: number; todayDiscount: number }
export interface IPromoLinePrice { subtotal: number; discount: number; total: number; promo: IPublicPromo | null; hasOddUnit: boolean }

const round2 = (value: number) => Math.round(value * 100) / 100;
export const hasPromoForItem = (promo: IPublicPromo, item: Pick<IItem, "id" | "category_id">) =>
    promo.itemIds.includes(item.id) || Boolean(item.category_id && promo.categoryIds.includes(item.category_id));
export const getPromoLabel = (promo: Pick<IPublicPromo, "kind" | "percent">) => promo.kind === "two_for_one" ? "2x1" : `-${promo.percent}%`;
export const formatPromoDate = (date: string) => new Date(`${date}T12:00:00-05:00`).toLocaleDateString("es-PA", { day: "numeric", month: "long" });

/** Se agrupan variantes y modificadores del mismo producto antes de elegir la mejor promo. */
export const getPromoCart = (lines: ICartLine[], promos: IPublicPromo[]) => {
    const prices: Record<string, IPromoLinePrice> = {};
    const groups = new Map<string, ICartLine[]>();
    lines.forEach((line) => {
        prices[line.lineKey] = { subtotal: round2(getCartLinePrice(line) * line.quantity), discount: 0, total: round2(getCartLinePrice(line) * line.quantity), promo: null, hasOddUnit: false };
        groups.set(line.item.id, [...(groups.get(line.item.id) ?? []), line]);
    });
    groups.forEach((group) => {
        let best: { promo: IPublicPromo; discounts: Record<string, number>; discount: number } | null = null;
        promos.filter((promo) => hasPromoForItem(promo, group[0].item)).sort((a, b) => a.id - b.id).forEach((promo) => {
            const discounts: Record<string, number> = Object.fromEntries(group.map((line) => [line.lineKey, 0]));
            if (promo.kind === "percent") {
                const factor = (100 - (promo.percent ?? 0)) / 100;
                group.forEach((line) => {
                    const unit = round2(getItemPrice(line.item) * factor) + (line.modifiers ?? []).reduce((sum, modifier) => sum + round2(modifier.price * factor), 0);
                    discounts[line.lineKey] = round2(prices[line.lineKey].subtotal - unit * line.quantity);
                });
            } else {
                const units = group.flatMap((line) => Array.from({ length: line.quantity }, () => ({ key: line.lineKey, price: getCartLinePrice(line) })));
                units.sort((a, b) => b.price - a.price);
                units.forEach((unit, index) => { if (index % 2 === 1) discounts[unit.key] = round2(discounts[unit.key] + unit.price); });
            }
            const discount = round2(Object.values(discounts).reduce((sum, value) => sum + value, 0));
            if (!best || discount > best.discount) best = { promo, discounts, discount };
        });
        if (best) {
            const chosen = best as { promo: IPublicPromo; discounts: Record<string, number>; discount: number };
            group.forEach((line, index) => {
                const price = prices[line.lineKey];
                price.promo = chosen.promo;
                price.discount = chosen.discounts[line.lineKey];
                price.total = round2(price.subtotal - price.discount);
                price.hasOddUnit = index === 0 && chosen.promo.kind === "two_for_one" && group.reduce((sum, entry) => sum + entry.quantity, 0) % 2 === 1;
            });
        }
    });
    const subtotal = round2(Object.values(prices).reduce((sum, price) => sum + price.subtotal, 0));
    const discount = round2(Object.values(prices).reduce((sum, price) => sum + price.discount, 0));
    return { prices, subtotal, discount, total: round2(subtotal - discount) };
};

let cache: { promos: IPublicPromo[]; savedAt: number } | null = null;
let request: Promise<IPublicPromo[]> | null = null;
const listeners = new Set<(promos: IPublicPromo[]) => void>();
export const fetchPromosCached = (force = false): Promise<IPublicPromo[]> => {
    if (!force && cache && Date.now() - cache.savedAt < 60000) return Promise.resolve(cache.promos);
    if (!request) request = httpGet<{ promos: IPublicPromo[] }>("/promos").then(({ promos }) => {
        cache = { promos, savedAt: Date.now() };
        listeners.forEach((listener) => listener(promos));
        return promos;
    }).finally(() => { request = null; });
    return request;
};
export const usePromos = () => {
    const [promos, setPromos] = useState<IPublicPromo[]>(cache?.promos ?? []);
    useEffect(() => {
        listeners.add(setPromos);
        const refresh = () => { void fetchPromosCached().catch(() => undefined); };
        refresh();
        const timer = window.setInterval(refresh, 60000);
        return () => { listeners.delete(setPromos); window.clearInterval(timer); };
    }, []);
    return { promos };
};
