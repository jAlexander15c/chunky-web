import { describe, expect, test } from "vitest";

import { getEarliestQuoteDate, getQuoteMissing } from "./quote";
import type { IQuoteDraft } from "./quote";

const DRAFT: IQuoteDraft = {
    kind: "postre",
    size: "6",
    height: 2,
    doughId: "vainilla-caramelo",
    fillingIds: [],
    topper: false,
    dessertId: "beso-de-angel",
    dessertSize: "7",
    customerName: "Mariana Ortega",
    customerPhone: "6123-4567",
    desiredDate: getEarliestQuoteDate(),
    note: "",
    cakeImage: null,
    topperImage: null,
    privacyConsent: true,
};

describe("lo que falta para cotizar", () => {
    test("un postre con sus datos y la casilla está listo", () => {
        expect(getQuoteMissing(DRAFT)).toEqual([]);
    });

    test("la casilla del aviso se pide siempre", () => {
        expect(getQuoteMissing({ ...DRAFT, privacyConsent: false })).toContain("Acepta el aviso de privacidad");
    });

    test("un cake pide relleno y foto", () => {
        const missing = getQuoteMissing({ ...DRAFT, kind: "cake" });
        expect(missing).toContain("Elige al menos un relleno");
        expect(missing).toContain("Sube la foto de referencia del cake");
    });
});
