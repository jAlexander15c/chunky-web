import { describe, expect, test } from "vitest";
import {
    formatComboSchedule,
    formatComboUntil,
    getComboError,
    getComboLineKey,
    getComboNextStart,
    getComboSlotsText,
    getVisibleCombos,
    groupOrderLines,
} from "./combos";
import type { IComboChoice, IComboInput, IPublicCombo } from "./combos";
import { getCartLinePrice } from "./order";
import type { ICartLine } from "./order";
import { getOrderCombos, getOrderLines } from "./payment";
import { getPromoCart } from "./promos";
import type { IPublicPromo } from "./promos";
import type { IItem } from "@/interfaces";

const getItem = (id: string, price: number): IItem =>
    ({ id, item_name: id, category_id: "c", variants: [{ variant_id: `v-${id}`, default_price: price, stores: [] }] }) as unknown as IItem;
const avena = { modifierId: "leche", modifierOptionId: "avena", name: "leche", option: "Avena", price: 0.5 };
const choices: IComboChoice[] = [{ item: getItem("cookie", 2.75), modifiers: [] }, { item: getItem("cafe", 3), modifiers: [avena] }];
const comboLine: ICartLine = {
    lineKey: getComboLineKey(1, choices),
    item: choices[0].item,
    quantity: 2,
    combo: { comboId: 1, name: "Merienda", price: 5.5, choices },
};

describe("horario de los combos", () => {
    test("días y horas", () => {
        expect(formatComboSchedule([1, 2, 3, 4, 5], "15:00", "18:00")).toBe("Lun a Vie · 3 a 6 pm");
        expect(formatComboSchedule([6, 0], "08:00", "11:00")).toBe("Sáb y Dom · 8 a 11 am");
        expect(formatComboSchedule([2], "11:00", "14:00")).toBe("Mar · 11 am a 2 pm");
        expect(formatComboSchedule([1, 3, 5], "15:30", "18:00")).toBe("Lun, Mié y Vie · 3:30 a 6 pm");
        expect(formatComboSchedule([0, 1, 2, 3, 4, 5, 6], "15:00", "18:00")).toBe("Todos los días · 3 a 6 pm");
    });
    test("hasta qué hora", () => {
        expect(formatComboUntil("18:00")).toBe("Hasta las 6 pm");
        expect(formatComboUntil("18:30")).toBe("Hasta las 6:30 pm");
    });
    test("estado en el admin, en hora de Panamá", () => {
        const base = { days: [2], timeFrom: "17:00", timeTo: "21:00", startsOn: null, endsOn: null, isEnabled: true };
        // Lunes 2026-10-19 12:00 en Panamá
        const monday = new Date("2026-10-19T17:00:00Z");
        expect(getComboNextStart(base, monday).label).toBe("Empieza mañana a las 5 pm");
        expect(getComboNextStart({ ...base, days: [3] }, monday).label).toBe("Empieza el miércoles a las 5 pm");
        expect(getComboNextStart({ ...base, days: [1] }, monday).label).toBe("Empieza hoy a las 5 pm");
        expect(getComboNextStart({ ...base, days: [1], timeFrom: "11:00" }, monday).label).toBe("A la venta ahora");
        expect(getComboNextStart({ ...base, endsOn: "2026-10-12" }, monday).label).toBe("Terminó el 12 oct");
        expect(getComboNextStart({ ...base, isEnabled: false }, monday).label).toBe("Apagado");
    });
    test("la web esconde el combo que ya pasó su hora", () => {
        const combo = { id: 1, timeTo: "18:00" } as IPublicCombo;
        const fetched = new Date("2026-10-19T22:30:00Z"); // 5:30 pm Panamá
        expect(getVisibleCombos([combo], fetched, fetched)).toHaveLength(1);
        expect(getVisibleCombos([combo], new Date("2026-10-19T23:01:00Z"), fetched)).toHaveLength(0);
    });
    test("lo que lleva", () => {
        expect(getComboSlotsText([{ label: "Galleta", itemIds: ["a", "b"] }, { label: "Bebida", itemIds: ["c", "d"] }])).toBe("1 galleta a elegir + 1 bebida a elegir");
    });
});

describe("combos en el carrito", () => {
    test("precio de la unidad = combo + modificadores", () => {
        expect(getCartLinePrice(comboLine)).toBe(6);
    });
    test("las promos no se aplican a un combo", () => {
        const promo: IPublicPromo = { id: 1, name: "Doble", kind: "two_for_one", percent: null, itemIds: ["cookie"], categoryIds: [], endsOn: null };
        const result = getPromoCart([comboLine], [promo]);
        expect(result.discount).toBe(0);
        expect(result.total).toBe(12);
        expect(result.prices[comboLine.lineKey].promo).toBeNull();
    });
    test("el pedido separa lines y combos, con una elección por hueco", () => {
        const single: ICartLine = { lineKey: "x", item: getItem("brownie", 3), quantity: 1 };
        expect(getOrderLines([single, comboLine])).toEqual([{ variantId: "v-brownie", quantity: 1, options: undefined, modifierOptionIds: undefined }]);
        expect(getOrderCombos([single, comboLine])).toEqual([
            { comboId: 1, quantity: 2, choices: [{ variantId: "v-cookie", modifierOptionIds: undefined }, { variantId: "v-cafe", modifierOptionIds: ["avena"] }] },
        ]);
        expect(getOrderCombos([single])).toBeUndefined();
    });
});

describe("combos en /pedido", () => {
    test("agrupa por groupKey: precio del combo por cantidad más modificadores", () => {
        const combo = { comboId: 1, comboName: "Merienda", groupKey: "g1", comboPrice: 5.5 };
        const rows = groupOrderLines([
            { name: "Chocochip", quantity: 2, price: 0, discount: -3, promoName: null, combo },
            { name: "Café frío", quantity: 2, price: 0.5, modifiers: [{ name: "leche", option: "Avena", price: 0.5 }], combo },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ kind: "combo", name: "Merienda", quantity: 2, total: 12 });
    });
});

describe("validación del combo", () => {
    const valid: IComboInput = {
        name: "Merienda", description: null, price: 5.5, slots: [{ label: "Galleta", itemIds: ["a"] }], channel: "both",
        days: [1], timeFrom: "15:00", timeTo: "18:00", startsOn: null, endsOn: null, isEnabled: true,
    };
    test("acepta uno correcto y rechaza lo inválido", () => {
        expect(getComboError(valid)).toBeNull();
        expect(getComboError({ ...valid, price: 0.5 })).not.toBeNull();
        expect(getComboError({ ...valid, price: 5.555 })).not.toBeNull();
        expect(getComboError({ ...valid, timeTo: "15:00" })).not.toBeNull();
        expect(getComboError({ ...valid, slots: [{ label: "Galleta", itemIds: [] }] })).not.toBeNull();
    });
});
