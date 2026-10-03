import { describe, expect, test } from "vitest";

import { getAvailableQuantity, getLineMax, getStockNote } from "./stock";
import type { ICartLine } from "./order";
import type { IItem } from "@/interfaces";

const getItem = (inventoryAvailability?: object): IItem =>
    ({ id: "bites", item_name: "Chunky Bites Original", variants: [{ variant_id: "v-1", inventoryAvailability }] }) as unknown as IItem;

const lot = (usableStock: string, availabilityMode = "AUTOMATIC") => ({ productionMode: "BATCH", availabilityMode, usableStock });

const getLine = (item: IItem, lineKey: string, quantity: number) => ({ lineKey, item, quantity }) as ICartLine;

describe("stock de productos por lotes", () => {
    test("solo los lotes automáticos tienen tope", () => {
        expect(getAvailableQuantity(getItem(lot("15")))).toBe(15);
        expect(getAvailableQuantity(getItem(lot("0")))).toBe(0);
        expect(getAvailableQuantity(getItem())).toBeNull();
        expect(getAvailableQuantity(getItem(lot("15", "MANUAL_ON")))).toBeNull();
        expect(getAvailableQuantity(getItem({ productionMode: "MADE_TO_ORDER", availabilityMode: "AUTOMATIC", usableStock: "0" }))).toBeNull();
    });

    test("las líneas del mismo producto comparten el lote", () => {
        const item = getItem(lot("5"));
        const lines = [getLine(item, "bites-avena", 2), getLine(item, "bites", 1)];
        expect(getLineMax(lines, item, "bites")).toBe(3);
        expect(getLineMax(lines, item, "")).toBe(2);
        expect(getLineMax([getLine(item, "bites-avena", 7)], item, "bites")).toBe(0);
    });

    test("sin tope de stock rige el máximo por línea", () => {
        expect(getLineMax([], getItem(), "bites")).toBe(99);
    });

    test("el aviso sale solo al llegar al tope", () => {
        expect(getStockNote(3, 3)).toBe("Solo quedan 3");
        expect(getStockNote(1, 1)).toBe("Solo queda 1");
        expect(getStockNote(3, 2)).toBeNull();
        expect(getStockNote(null, 5)).toBeNull();
        expect(getStockNote(0, 0)).toBeNull();
    });
});
