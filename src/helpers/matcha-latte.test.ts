import { describe, expect, test } from "vitest";

import { isMatchaName, sortMatchaFirst } from "./matcha-latte";

describe("matcha primero en Bebidas", () => {
    test("cuenta como matcha lo que dice matcha y los Cloud", () => {
        expect(["Matcha Bloom", "Strawberry Cloud", "Banana Cloud", "Iced Coffee", "Capuchino"].map(isMatchaName)).toEqual([true, true, true, false, false]);
    });

    test("el Matcha Latte va primero, luego los demás matcha y el resto en su orden", () => {
        const names = ["Iced Coffee", "Strawberry Cloud", "Capuchino", "Matcha Latte Caliente", "Matcha Latte", "Matcha Bloom"];
        expect(sortMatchaFirst(names.map((item_name) => ({ item_name }))).map((item) => item.item_name)).toEqual([
            "Matcha Latte", "Strawberry Cloud", "Matcha Latte Caliente", "Matcha Bloom", "Iced Coffee", "Capuchino",
        ]);
    });
});
