import { describe, expect, it } from "vitest";

import { isPinEasyToGuess } from "./staff-access";

describe("isPinEasyToGuess", () => {
    it("rechaza repetidos, escaleras y pares o tríos repetidos", () => {
        for (const pin of ["000000", "111111", "123456", "654321", "121212", "123123", "907907"]) {
            expect(isPinEasyToGuess(pin), pin).toBe(true);
        }
    });

    it("acepta un PIN cualquiera", () => {
        for (const pin of ["480317", "925714", "730561", "102745"]) {
            expect(isPinEasyToGuess(pin), pin).toBe(false);
        }
    });
});
