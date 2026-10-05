import { describe, expect, test } from "vitest";

import { getExpiredAgoLabel, getExpiredLotsTitle, getWasteTone, groupExpiredLots, formatWastePercent, WASTE_REASON_LABEL } from "./product-waste";

describe("merma de productos por lotes", () => {
    test("las etiquetas de motivo", () => {
        expect(WASTE_REASON_LABEL).toEqual({ vencido: "Vencido", danado: "Se dañó", consumo_interno: "Consumo interno" });
    });

    test("el color del porcentaje: 10 o más crítico, 5 o más aviso", () => {
        expect(getWasteTone(12)).toBe("crit");
        expect(getWasteTone(10)).toBe("crit");
        expect(getWasteTone(9.9)).toBe("warn");
        expect(getWasteTone(5)).toBe("warn");
        expect(getWasteTone(4.9)).toBe("ok");
        expect(getWasteTone(0)).toBe("ok");
        expect(getWasteTone(null)).toBe("idle");
    });

    test("el porcentaje se redondea a un decimal", () => {
        expect(formatWastePercent(9.24)).toBe("9.2%");
        expect(formatWastePercent(12)).toBe("12%");
        expect(formatWastePercent(null)).toBe("—");
    });

    test("cuánto hace que venció, por días de Panamá", () => {
        // 2026-10-05 15:00 en Panamá (UTC-5)
        const now = new Date("2026-10-05T20:00:00Z");
        expect(getExpiredAgoLabel("2026-10-05T05:00:00Z", now)).toBe("venció hoy");
        expect(getExpiredAgoLabel("2026-10-04T05:00:00Z", now)).toBe("venció ayer");
        expect(getExpiredAgoLabel("2026-10-03T05:00:00Z", now)).toBe("venció hace 2 días");
        expect(getExpiredAgoLabel("2026-10-06T05:00:00Z", now)).toBe("venció hoy");
        // Pasada la medianoche UTC todavía es el día anterior en Panamá
        expect(getExpiredAgoLabel("2026-10-04T23:00:00Z", new Date("2026-10-05T02:00:00Z"))).toBe("venció hoy");
    });

    test("el título del aviso", () => {
        expect(getExpiredLotsTitle(1)).toBe("1 lote vencido");
        expect(getExpiredLotsTitle(2)).toBe("2 lotes vencidos");
    });

    test("los lotes vencidos se juntan por producto", () => {
        const groups = groupExpiredLots([
            { batchId: 1, variantId: "a", name: "Galleta", quantity: "4", expirationDate: "2026-10-03T05:00:00Z" },
            { batchId: 2, variantId: "b", name: "Cheesecake", quantity: "1", expirationDate: "2026-10-03T05:00:00Z" },
            { batchId: 3, variantId: "a", name: "Galleta", quantity: "2", expirationDate: "2026-10-04T05:00:00Z" },
        ]);
        expect(groups).toEqual([
            { variantId: "a", name: "Galleta", quantity: 6, expirationDate: "2026-10-03T05:00:00Z" },
            { variantId: "b", name: "Cheesecake", quantity: 1, expirationDate: "2026-10-03T05:00:00Z" },
        ]);
    });
});
