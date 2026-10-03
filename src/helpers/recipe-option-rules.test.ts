import { afterEach, describe, expect, test, vi } from "vitest";

import { saveOptionRules } from "./inventory";
import type { IOptionRule, IOptionRuleOverride } from "./inventory";
import { getEffectiveOptionRules, setOptionRuleOverride } from "./recipe-option-rules";

const getRule = (quantity: string, optionId = "milk"): IOptionRule => ({
    optionId, supplyId: 1, name: "Leche", unit: "ml",
    replacesSupplyId: 1, replacesName: "Leche", quantity,
});

const globalRules = [getRule("160")];
const overrides: IOptionRuleOverride[] = [
    { variantId: "A", optionId: "milk", rules: [getRule("145")] },
    { variantId: "B", optionId: "milk", rules: [getRule("100")] },
];

afterEach(() => vi.unstubAllGlobals());

describe("reglas de opciones por producto", () => {
    test("cada producto usa su cantidad y los demas conservan la regla global", () => {
        expect(getEffectiveOptionRules(globalRules, overrides, "A", "milk")[0].quantity).toBe("145");
        expect(getEffectiveOptionRules(globalRules, overrides, "B", "milk")[0].quantity).toBe("100");
        expect(getEffectiveOptionRules(globalRules, overrides, "C", "milk")[0].quantity).toBe("160");
        expect(globalRules[0].quantity).toBe("160");
    });

    test("Nada desactiva la regla global solo para ese producto", () => {
        const next = setOptionRuleOverride(overrides, "A", "milk", []);
        expect(getEffectiveOptionRules(globalRules, next, "A", "milk")).toEqual([]);
        expect(getEffectiveOptionRules(globalRules, next, "B", "milk")[0].quantity).toBe("100");
        expect(getEffectiveOptionRules(globalRules, next, "C", "milk")[0].quantity).toBe("160");
    });

    test("guardar conserva las otras variantes y opciones sin mutar el catalogo", () => {
        const other = { variantId: "A", optionId: "extra", rules: [getRule("25", "extra")] };
        const current = [...overrides, other];
        const next = setOptionRuleOverride(current, "A", "milk", [getRule("130")]);
        expect(next).toHaveLength(3);
        expect(next.find((entry) => entry.variantId === "B")).toBe(overrides[1]);
        expect(next.find((entry) => entry.optionId === "extra")).toBe(other);
        expect(getEffectiveOptionRules(globalRules, current, "A", "milk")[0].quantity).toBe("145");
        expect(getEffectiveOptionRules(globalRules, next, "A", "milk")[0].quantity).toBe("130");
    });

    test("agregar una regla local no cambia la regla global", () => {
        const next = setOptionRuleOverride(overrides, "C", "milk", [getRule("90")]);
        expect(next).toHaveLength(3);
        expect(globalRules).toEqual([getRule("160")]);
        expect(overrides).toHaveLength(2);
    });

    test.each(["admin", "gestion"] as const)("el guardado %s envia la variante incluso para Nada", async (scope) => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ rules: [] }), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        await saveOptionRules("token", scope, "milk", [], "A");
        expect(fetchMock.mock.calls[0][0]).toContain(`/${scope}/modifier-options/milk/rules`);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ rules: [], variantId: "A" });
    });
});