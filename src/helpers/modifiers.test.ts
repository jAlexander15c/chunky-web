import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ModifierPicker } from "@/components/modifier-picker";
import { getOrderCombos, getOrderLines } from "./payment";
import { getCartLinePrice } from "./order";
import { getLineKey } from "./pasta";
import { isMatchaLatteName, sortMatchaModifiers } from "./matcha-latte";
import {
    MAX_MODIFIER_REPEAT,
    REPEATABLE_MODIFIER_NAMES,
    formatCartModifiers,
    formatModifierOptions,
    formatModifierPhrases,
    getModifiersPrice,
    isRepeatableModifier,
    setRepeatedOption,
    toCartModifier,
} from "./modifiers";
import type { ICartModifier, IModifier } from "./modifiers";
import type { ICartLine } from "./order";

const sweetener: IModifier = { id: "m-sweet", name: "Endulzante", options: [{ id: "o-vanilla", name: "Vainilla", price: 0.2 }] };
const milk: IModifier = { id: "m-milk", name: "leche", options: [{ id: "o-oat", name: "Avena", price: 0.5 }, { id: "o-whole", name: "Entera", price: 0 }] };
const jam: IModifier = { id: "m-jam", name: "Compota", options: [{ id: "o-strawberry", name: "Fresa", price: 0.75 }, { id: "o-mango", name: "Mango", price: 0.75 }] };
const foam: IModifier = { id: "m-foam", name: "Cold foam", options: [{ id: "o-foam", name: "Cold foam", price: 1 }] };

const vanilla = toCartModifier(sweetener, sweetener.options[0]);
const oat = toCartModifier(milk, milk.options[0]);
const strawberry = toCartModifier(jam, jam.options[0]);
const coldFoam = toCartModifier(foam, foam.options[0]);

describe("isRepeatableModifier", () => {
    test("solo el Endulzante se repite, sin importar mayúsculas, acentos ni espacios", () => {
        expect(REPEATABLE_MODIFIER_NAMES).toEqual(["endulzante"]);
        expect(isRepeatableModifier({ name: "Endulzante" })).toBe(true);
        expect(isRepeatableModifier({ name: "  ENDULZANTE " })).toBe(true);
        expect(isRepeatableModifier({ name: "Éndulzante" })).toBe(true);
        expect(isRepeatableModifier({ name: "endulzante   " })).toBe(true);
    });
    test("los demás modificadores siguen con una opción", () => {
        expect(isRepeatableModifier({ name: "Leche" })).toBe(false);
        expect(isRepeatableModifier({ name: "Endulzantes" })).toBe(false);
        expect(isRepeatableModifier({ name: "Endulzante extra" })).toBe(false);
    });
});

describe("formatCartModifiers con repeticiones", () => {
    test("agrupa las repeticiones como ×N y deja una sola sin ×1", () => {
        expect(formatCartModifiers([vanilla, vanilla, vanilla])).toBe("Endulzante: Vainilla ×3");
        expect(formatCartModifiers([vanilla])).toBe("Endulzante: Vainilla");
    });
    test("conserva el orden de la primera aparición aunque las repeticiones no sean seguidas", () => {
        expect(formatCartModifiers([vanilla, oat, vanilla, vanilla])).toBe("Endulzante: Vainilla ×3 · Leche: Avena");
    });
    test("formatModifierOptions y formatModifierPhrases agrupan igual", () => {
        expect(formatModifierOptions([oat, vanilla, vanilla])).toBe("Avena, Vainilla ×2");
        expect(formatModifierPhrases([{ name: "Endulzante", option: "Vainilla" }, { name: "Endulzante", option: "Vainilla" }, { name: "Leche", option: "Avena" }]))
            .toEqual(["Endulzante Vainilla ×2", "Leche Avena"]);
    });
});

describe("precio con repeticiones", () => {
    test("suma N × precio y no arrastra decimales sueltos", () => {
        expect(getModifiersPrice([vanilla, vanilla, vanilla])).toBe(0.6);
        expect(getModifiersPrice(Array(MAX_MODIFIER_REPEAT).fill(vanilla))).toBe(4);
    });
    test("Vainilla ×3 + Avena + Fresa + Cold foam sobre $5.50 da $8.35", () => {
        const line = { lineKey: "x", item: { id: "mt", variants: [{ default_price: 5.5, stores: [] }] }, quantity: 1, modifiers: [vanilla, vanilla, vanilla, oat, strawberry, coldFoam] } as unknown as ICartLine;
        expect(getCartLinePrice(line)).toBeCloseTo(8.35, 10);
    });
});

describe("setRepeatedOption", () => {
    test("deja la opción N veces y respeta el resto del carrito", () => {
        const next = setRepeatedOption([oat], sweetener, sweetener.options[0], 3);
        expect(next).toEqual([oat, vanilla, vanilla, vanilla]);
    });
    test("baja y quita con 0, y nunca pasa del tope", () => {
        const three = setRepeatedOption([], sweetener, sweetener.options[0], 3);
        expect(setRepeatedOption(three, sweetener, sweetener.options[0], 2)).toHaveLength(2);
        expect(setRepeatedOption(three, sweetener, sweetener.options[0], 0)).toEqual([]);
        expect(setRepeatedOption(three, sweetener, sweetener.options[0], -4)).toEqual([]);
        expect(setRepeatedOption(three, sweetener, sweetener.options[0], 99)).toHaveLength(MAX_MODIFIER_REPEAT);
    });
    test("elegir otra opción del mismo modificador reemplaza las anteriores", () => {
        const twoOptions: IModifier = { id: "m-sweet", name: "Endulzante", options: [{ id: "o-vanilla", name: "Vainilla", price: 0.2 }, { id: "o-honey", name: "Miel", price: 0.3 }] };
        const honey = toCartModifier(twoOptions, twoOptions.options[1]);
        const next = setRepeatedOption([vanilla, vanilla, oat], twoOptions, twoOptions.options[1], 1);
        expect(next).toEqual([oat, honey]);
    });
});

describe("el carrito y el pedido no colapsan las repeticiones", () => {
    test("la clave de línea distingue Vainilla ×3 de Vainilla ×1", () => {
        expect(getLineKey("mt", undefined, [vanilla, vanilla, vanilla])).not.toBe(getLineKey("mt", undefined, [vanilla]));
        expect(getLineKey("mt", undefined, [vanilla, oat, vanilla])).toBe(getLineKey("mt", undefined, [oat, vanilla, vanilla]));
    });
    test("el pedido lleva el id de Vainilla tres veces", () => {
        const line = { lineKey: "x", item: { id: "mt", variants: [{ variant_id: "v-mt" }] }, quantity: 1, modifiers: [vanilla, vanilla, vanilla, oat] } as unknown as ICartLine;
        expect(getOrderLines([line])[0].modifierOptionIds).toEqual(["o-vanilla", "o-vanilla", "o-vanilla", "o-oat"]);
    });
    test("un combo también conserva las repeticiones por hueco", () => {
        const comboLine = { lineKey: "c", item: { id: "mt", variants: [{ variant_id: "v-mt" }] }, quantity: 1, combo: { comboId: 1, name: "C", price: 6, choices: [{ item: { id: "mt", variants: [{ variant_id: "v-mt" }] }, modifiers: [vanilla, vanilla] }] } } as unknown as ICartLine;
        expect(getOrderCombos([comboLine])?.[0].choices[0].modifierOptionIds).toEqual(["o-vanilla", "o-vanilla"]);
    });
});

describe("ModifierPicker con el Endulzante", () => {
    const markup = (chosen: ICartModifier[], theme?: "matcha") => renderToStaticMarkup(createElement(ModifierPicker, { modifiers: [sweetener], chosen, onChange: () => {}, theme }));

    test("un Endulzante con una sola opción muestra contador, no casilla", () => {
        const html = markup([vanilla, vanilla]);
        expect(html).toContain("Cantidad de Vainilla");
        expect(html).toContain(">2<");
        expect(html).not.toContain('type="checkbox"');
    });
    test("sin elegir, el − queda deshabilitado y el + no", () => {
        const html = markup([]);
        expect(html).toMatch(/aria-label="Quitar Vainilla"[^>]*disabled|disabled=""[^>]*aria-label="Quitar Vainilla"/);
        expect(html).not.toMatch(/disabled=""[^>]*aria-label="Agregar Vainilla"|aria-label="Agregar Vainilla"[^>]*disabled/);
    });
    test("en el tope el + se deshabilita", () => {
        const html = markup(Array(MAX_MODIFIER_REPEAT).fill(vanilla));
        expect(html).toMatch(/aria-label="Agregar Vainilla"[^>]*disabled|disabled=""[^>]*aria-label="Agregar Vainilla"/);
    });
    test("la hoja de matcha usa sus clases y dice el precio de cada una", () => {
        const html = markup([], "matcha");
        expect(html).toContain("mx-sweet");
        expect(html).toContain("+$0.20 cada una");
        expect(html).toContain("hasta 20");
    });
});

describe("hoja del Matcha Latte", () => {
    test("solo el Matcha Latte a secas toma la hoja temática", () => {
        expect(isMatchaLatteName("Matcha Latte")).toBe(true);
        expect(isMatchaLatteName("  matcha   LATTE ")).toBe(true);
        expect(isMatchaLatteName("Matcha Latte Caliente")).toBe(false);
        expect(isMatchaLatteName("Matcha")).toBe(false);
    });
    test("los grupos salen en el orden de la maqueta y los desconocidos al final", () => {
        const extra: IModifier = { id: "m-x", name: "Otro", options: [{ id: "o-x", name: "X", price: 0 }] };
        const matchaExtra: IModifier = { id: "m-mx", name: "Matcha Extra", options: [{ id: "o-mx", name: "Matcha Extra", price: 1 }] };
        expect(sortMatchaModifiers([foam, extra, matchaExtra, sweetener, jam, milk]).map((modifier) => modifier.name))
            .toEqual(["leche", "Compota", "Endulzante", "Matcha Extra", "Cold foam", "Otro"]);
    });
});
