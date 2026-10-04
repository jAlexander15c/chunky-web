import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ModifierPicker } from "./modifier-picker";
import type { IModifier } from "@/helpers";

const markup = (options: IModifier["options"], showSoldOutReason = true) => renderToStaticMarkup(createElement(ModifierPicker, {
    modifiers: [{ id: "milk", name: "Leche", options }], chosen: [], onChange: () => {}, showSoldOutReason,
}));

describe("ModifierPicker disponibilidad", () => {
    test("el cliente solo ve Agotado, sin el motivo interno", () => {
        const html = markup([{ id: "whole", name: "Entera", price: 0, isAvailable: false, isManuallyDisabled: true }, { id: "oat", name: "Avena", price: 0, isAvailable: true }], false);
        expect(html).toContain("Agotado");
        expect(html).not.toContain("Apagado manualmente");
    });
    test("explica que una opcion apagada manualmente no depende del stock", () => {
        const html = markup([{ id: "whole", name: "Entera", price: 0, isAvailable: false, isManuallyDisabled: true }, { id: "oat", name: "Avena", price: 0, isAvailable: true }]);
        expect(html).toContain("Apagado manualmente");
        expect(html).toContain("disabled");
    });
    test("una opcion unica sin insumo tampoco permite seleccionarla", () => {
        const html = markup([{ id: "caramel", name: "Caramelo", price: 0.5, isAvailable: false, isOutOfStock: true }]);
        expect(html).toContain("disabled");
        expect(html).toContain("Sin insumo");
    });
});


test("la opcion elegida que se agota sigue permitiendo quitarla", () => {
    const html = renderToStaticMarkup(createElement(ModifierPicker, {
        modifiers: [{ id: "milk", name: "Leche", options: [{ id: "whole", name: "Entera", price: 0, isAvailable: false }] }],
        chosen: [{ modifierId: "milk", modifierOptionId: "whole", name: "Leche", option: "Entera", price: 0 }], onChange: () => {},
    }));
    expect(html).not.toContain("disabled");
    expect(html).toContain("checked");
});


test("el grupo de una opcion elegida no se oculta cuando todas quedan agotadas", async () => {
    const { getItemModifiers } = await import("@/helpers/modifiers");
    const modifiers = [{ id: "milk", name: "Leche", options: [{ id: "whole", name: "Entera", price: 0, isAvailable: false }] }];
    const item = { modifier_ids: ["milk"] } as Parameters<typeof getItemModifiers>[0];
    expect(getItemModifiers(item, modifiers, ["whole"])).toHaveLength(1);
    expect(getItemModifiers(item, modifiers)).toHaveLength(0);
});


test("la opcion elegida agotada en un grupo tambien permite quitarla", () => {
    const html = renderToStaticMarkup(createElement(ModifierPicker, {
        modifiers: [{ id: "milk", name: "Leche", options: [{ id: "whole", name: "Entera", price: 0, isAvailable: false }, { id: "oat", name: "Avena", price: 0, isAvailable: true }] }],
        chosen: [{ modifierId: "milk", modifierOptionId: "whole", name: "Leche", option: "Entera", price: 0 }], onChange: () => {},
    }));
    expect(html).not.toContain("disabled");
    expect(html).toContain('aria-checked="true"');
});
