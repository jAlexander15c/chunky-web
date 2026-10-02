import { describe, expect, test } from "vitest";

import { getPeriodRange } from "./admin";
import { getRangeError, getSelectionRange } from "./admin-period";

const TODAY = "2026-10-02";

describe("getRangeError", () => {
    test("acepta un solo día", () => {
        expect(getRangeError("2026-09-15", "2026-09-15", TODAY)).toBeNull();
    });

    test("acepta un rango que termina hoy", () => {
        expect(getRangeError("2026-09-01", TODAY, TODAY)).toBeNull();
    });

    test("rechaza un rango al revés", () => {
        expect(getRangeError("2026-09-20", "2026-09-10", TODAY)).toBe("La fecha de inicio va antes que la final.");
    });

    test("rechaza días que todavía no pasan", () => {
        expect(getRangeError("2026-10-01", "2026-10-03", TODAY)).toBe("Todavía no hay datos de días que no han pasado.");
    });

    test("acepta hasta 366 días contando los dos extremos, como la API", () => {
        expect(getRangeError("2025-10-02", "2026-10-02", TODAY)).toBeNull();
        expect(getRangeError("2025-10-01", "2026-10-02", TODAY)).toBe("El rango es de hasta un año.");
    });

    test("pide las fechas si falta alguna", () => {
        expect(getRangeError("", TODAY, TODAY)).toBe("Elige las fechas.");
    });
});

describe("rangos de período", () => {
    test("hoy es un solo día", () => {
        expect(getPeriodRange("hoy", TODAY)).toEqual({ from: TODAY, to: TODAY });
    });

    test("las fechas elegidas a mano se usan tal cual", () => {
        expect(getSelectionRange({ kind: "custom", from: "2026-09-05", to: "2026-09-05" })).toEqual({ from: "2026-09-05", to: "2026-09-05" });
    });
});
