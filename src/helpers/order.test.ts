import { describe, expect, test } from "vitest";

import { getCartCount, getCartLinePrice, getCartTotal, getItemPrice } from "./order";
import type { ICartLine } from "./order";
import type { IItem } from "@/interfaces";

const getItem = (storePrice: number, defaultPrice = 99): IItem =>
    ({
        id: `item-${storePrice}`,
        item_name: "Galleta",
        variants: [{ variant_id: "v-1", default_price: defaultPrice, stores: [{ store_id: "s-1", price: storePrice, available_for_sale: true }] }],
    }) as unknown as IItem;

const getLine = (item: IItem, quantity: number, modifierPrices: number[] = []): ICartLine => ({
    lineKey: `${item.id}-${modifierPrices.join("-")}`,
    item,
    quantity,
    modifiers: modifierPrices.map((price, index) => ({
        modifierId: "m-1",
        modifierOptionId: `o-${index}`,
        name: "Leche",
        option: "Avena",
        price,
    })),
});

describe("precio del carrito", () => {
    test("cobra el precio de la tienda, no el general, como el API", () => {
        expect(getItemPrice(getItem(3.5, 4))).toBe(3.5);
    });

    test("suma los modificadores a cada unidad", () => {
        const line = getLine(getItem(3), 2, [0.5, 0.25]);
        expect(getCartLinePrice(line)).toBe(3.75);
        expect(getCartTotal([line])).toBe(7.5);
    });

    test("total y cantidad de varias líneas", () => {
        const lines = [getLine(getItem(3), 2), getLine(getItem(2.5), 1, [1])];
        expect(getCartTotal(lines)).toBe(9.5);
        expect(getCartCount(lines)).toBe(3);
    });
});
