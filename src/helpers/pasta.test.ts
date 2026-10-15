import { describe, expect, it } from "vitest";

import { DEFAULT_OPENING_HOURS } from "./hours";
import { isPastaDeliveryOnly, isPastaOnlyNow } from "./pasta";

// Miercoles: abierto a las 10 a. m., cerrado a las 9 p. m. (hora local, como el navegador)
const OPEN = new Date(2026, 9, 14, 10, 0);
const CLOSED = new Date(2026, 9, 14, 21, 0);
const base = { openingHours: DEFAULT_OPENING_HOURS, storeOverride: null };

describe("isPastaOnlyNow", () => {
    it("sin modo pasta nunca es solo pasta", () => {
        expect(isPastaOnlyNow({ ...base, pastaMode: false, pastaFullMenu: true }, CLOSED)).toBe(false);
    });

    it("con solo pasta y bebidas lo es a cualquier hora", () => {
        expect(isPastaOnlyNow({ ...base, pastaMode: true, pastaFullMenu: false }, OPEN)).toBe(true);
        expect(isPastaOnlyNow({ ...base, pastaMode: true }, OPEN)).toBe(true);
    });

    it("con el resto del menu respeta el horario de la semana", () => {
        expect(isPastaOnlyNow({ ...base, pastaMode: true, pastaFullMenu: true }, OPEN)).toBe(false);
        expect(isPastaOnlyNow({ ...base, pastaMode: true, pastaFullMenu: true }, CLOSED)).toBe(true);
    });

    it("abierto a mano cuenta como dentro del horario", () => {
        expect(isPastaOnlyNow({ ...base, storeOverride: "open", pastaMode: true, pastaFullMenu: true }, CLOSED)).toBe(false);
    });
});

describe("isPastaDeliveryOnly", () => {
    it("solo el dia de pasta y bebidas obliga a delivery", () => {
        expect(isPastaDeliveryOnly({ pastaMode: true, pastaFullMenu: false })).toBe(true);
        expect(isPastaDeliveryOnly({ pastaMode: true, pastaFullMenu: true })).toBe(false);
        expect(isPastaDeliveryOnly({ pastaMode: false })).toBe(false);
    });
});
