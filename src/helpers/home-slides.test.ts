import { describe, expect, test } from "vitest";

import { getSlideLink, getSlideStatus, isSlideVisible } from "./home-slides";

const categories = [{ id: "cat-1", name: "Salados" }];

describe("getSlideLink", () => {
    test("lleva al menú, al cotizador o a una categoría con su nombre", () => {
        expect(getSlideLink({ destination: "menu", categoryId: null }, categories)).toEqual({ to: "/menu", state: undefined });
        expect(getSlideLink({ destination: "cotizador", categoryId: null }, categories)).toEqual({ to: "/cotizador", state: undefined });
        expect(getSlideLink({ destination: "category", categoryId: "cat-1" }, categories)).toEqual({
            to: "/items?categoryId=cat-1",
            state: { categoryName: "Salados" },
        });
    });

    test("si la categoría ya no existe va al menú completo", () => {
        expect(getSlideLink({ destination: "category", categoryId: "borrada" }, categories)).toEqual({ to: "/menu", state: undefined });
        expect(getSlideLink({ destination: "category", categoryId: "cat-1" }, [])).toEqual({ to: "/menu", state: undefined });
    });

    test("pasta no navega: abre el armador", () => {
        expect(getSlideLink({ destination: "pasta", categoryId: null }, categories)).toBeNull();
    });
});

describe("isSlideVisible", () => {
    test("un día normal se ven todas menos la de pasta", () => {
        const settings = { pastaMode: false };
        expect(isSlideVisible({ destination: "menu" }, settings)).toBe(true);
        expect(isSlideVisible({ destination: "category" }, settings)).toBe(true);
        expect(isSlideVisible({ destination: "cotizador" }, settings)).toBe(true);
        expect(isSlideVisible({ destination: "pasta" }, settings)).toBe(false);
    });

    test("el día de pasta se esconden menú y categoría", () => {
        const settings = { pastaMode: true };
        expect(isSlideVisible({ destination: "menu" }, settings)).toBe(false);
        expect(isSlideVisible({ destination: "category" }, settings)).toBe(false);
        expect(isSlideVisible({ destination: "cotizador" }, settings)).toBe(true);
        expect(isSlideVisible({ destination: "pasta" }, settings)).toBe(true);
    });

    test("la de pasta no se ve si el armador no está configurado", () => {
        expect(isSlideVisible({ destination: "pasta" }, { pastaMode: true, pasta: null })).toBe(false);
    });
});

describe("getSlideStatus", () => {
    const today = "2026-10-08";

    test("apagada gana a las fechas", () => {
        expect(getSlideStatus({ active: false, startsOn: null, endsOn: "2026-10-01" }, today)).toBe("off");
    });

    test("vencida, programada y vigente", () => {
        expect(getSlideStatus({ active: true, startsOn: null, endsOn: "2026-10-07" }, today)).toBe("expired");
        expect(getSlideStatus({ active: true, startsOn: "2026-10-09", endsOn: null }, today)).toBe("scheduled");
        expect(getSlideStatus({ active: true, startsOn: "2026-10-08", endsOn: "2026-10-08" }, today)).toBe("live");
        expect(getSlideStatus({ active: true, startsOn: null, endsOn: null }, today)).toBe("live");
    });
});
