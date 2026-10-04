import { describe, expect, it } from "vitest";

import { getBatchShortcuts, getIntermediateUnitLabel, parsePositiveAmount } from "./elaborados";

describe("getBatchShortcuts", () => {
    it("da 1, 2 y 3 tandas en la unidad del elaborado", () => {
        expect(getBatchShortcuts("550", "g")).toEqual([
            { batches: 1, value: "550", label: "1 tanda · 550 g" },
            { batches: 2, value: "1100", label: "2 tandas · 1100 g" },
            { batches: 3, value: "1650", label: "3 tandas · 1650 g" },
        ]);
    });

    it("redondea a tres decimales y nombra las porciones", () => {
        expect(getBatchShortcuts("0.3333", "portion")[2]).toEqual({ batches: 3, value: "1", label: "3 tandas · 1 porciones" });
    });

    it("sin rendimiento no hay atajos", () => {
        expect(getBatchShortcuts(null, "g")).toEqual([]);
        expect(getBatchShortcuts("0", "g")).toEqual([]);
    });
});

describe("parsePositiveAmount", () => {
    it("acepta coma decimal y rechaza vacío, cero o texto", () => {
        expect(parsePositiveAmount("1,5")).toBe(1.5);
        expect(parsePositiveAmount("")).toBeNull();
        expect(parsePositiveAmount("0")).toBeNull();
        expect(parsePositiveAmount("abc")).toBeNull();
    });
});

describe("getIntermediateUnitLabel", () => {
    it("traduce porciones y unidades", () => {
        expect(getIntermediateUnitLabel("portion")).toBe("porciones");
        expect(getIntermediateUnitLabel("unit")).toBe("u");
        expect(getIntermediateUnitLabel("ml")).toBe("ml");
    });
});
