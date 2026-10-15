import { describe, expect, test } from "vitest";
import { getPromoCart } from "./promos";
import type { IPublicPromo } from "./promos";
import type { ICartLine } from "./order";
import type { IItem } from "@/interfaces";

const getLine = (price: number, quantity = 1, key = String(price), id = "cookie", modifiers: number[] = []): ICartLine => ({
    lineKey: key, quantity,
    item: { id, category_id: "cookies", variants: [{ default_price: price, stores: [] }] } as unknown as IItem,
    modifiers: modifiers.map((value, index) => ({ modifierId: "m", modifierOptionId: String(index), name: "Extra", option: "Extra", price: value })),
});
const two: IPublicPromo = { id: 2, name: "Doble", kind: "two_for_one", percent: null, itemIds: ["cookie"], categoryIds: [], endsOn: null };
const percent: IPublicPromo = { ...two, id: 1, name: "Menos", kind: "percent", percent: 20 };

describe("promos del carrito", () => {
    test("2x1 agrupa variantes y regala la unidad más barata: 4.25 + 3.50", () => {
        const result = getPromoCart([getLine(4.25), getLine(3.5)], [two]);
        expect(result.total).toBe(4.25);
        expect(result.prices["3.5"].discount).toBe(3.5);
    });
    test("2x1 con tres unidades paga dos y avisa de la impar", () => {
        const result = getPromoCart([getLine(3.75, 3)], [two]);
        expect(result.total).toBe(7.5);
        expect(result.prices["3.75"].hasOddUnit).toBe(true);
    });
    test("20% de 3.50 paga 2.80", () => expect(getPromoCart([getLine(3.5)], [percent]).total).toBe(2.8));
    test("gana la mejor promo por producto sin sumarlas", () => {
        expect(getPromoCart([getLine(3.5, 2)], [percent, two]).total).toBe(3.5);
        expect(getPromoCart([getLine(3.5)], [two, percent]).prices["3.5"].promo?.id).toBe(1);
    });
    test("aplica por categoría y no afecta otros productos", () => {
        const promo = { ...percent, itemIds: [], categoryIds: ["cookies"] };
        const other = getLine(5, 1, "other", "other"); other.item.category_id = "drinks";
        expect(getPromoCart([getLine(3.5), other], [promo]).total).toBe(7.8);
    });
    test("redondea la base y cada modificador por separado", () => {
        expect(getPromoCart([getLine(0.03, 1, "round", "cookie", [0.03, 0.03])], [percent]).total).toBe(0.06);
    });
    test("empate se resuelve por menor id", () => {
        const result = getPromoCart([getLine(4, 2)], [two, { ...percent, percent: 50 }]);
        expect(result.prices["4"].promo?.id).toBe(1);
    });
    test("2x1 suma modificadores y conserva el descuento por línea", () => {
        const result = getPromoCart([getLine(3, 1, "expensive", "cookie", [1.25]), getLine(3.5)], [two]);
        expect(result.total).toBe(4.25);
        expect(result.discount).toBe(3.5);
        expect(Object.values(result.prices).reduce((sum, line) => sum + line.total, 0)).toBe(result.total);
    });
});
