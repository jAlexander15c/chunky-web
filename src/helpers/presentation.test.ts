import { describe, expect, it } from "vitest";

import { formatInPresentation, getPlural, getPresentation, splitInPresentation } from "./presentation";

const milk = { unit: "ml", purchaseUnit: "cartón", purchaseSize: 946, contentUnit: "ml" };

describe("presentación de un insumo", () => {
    it("pluraliza como se dice", () => {
        expect(getPlural("cartón")).toBe("cartones");
        expect(getPlural("bolsa")).toBe("bolsas");
        expect(getPlural("paquete")).toBe("paquetes");
        expect(getPlural("galón")).toBe("galones");
    });

    it("lleva el contenido a la unidad de consumo y descarta lo que no se convierte", () => {
        expect(getPresentation(milk)?.size).toBe(946);
        expect(getPresentation({ ...milk, purchaseSize: 1, contentUnit: "l" })?.size).toBe(1000);
        expect(getPresentation({ unit: "ml", purchaseUnit: "caja", purchaseSize: 12, contentUnit: "u" })).toBeNull();
        expect(getPresentation({ unit: "ml", purchaseUnit: null, purchaseSize: null })).toBeNull();
    });

    it("parte el stock en cartones enteros y lo suelto", () => {
        const presentation = getPresentation(milk)!;
        expect(splitInPresentation(3238, presentation)).toEqual({ whole: 3, loose: 400 });
        expect(formatInPresentation(3238, presentation, "ml")).toBe("3 cartones y 400 ml");
        expect(formatInPresentation(946, presentation, "ml")).toBe("1 cartón");
        expect(formatInPresentation(400, presentation, "ml")).toBe("400 ml");
        expect(formatInPresentation(0, presentation, "ml")).toBe("0 ml");
    });
});
