import { describe, expect, test } from "vitest";

import type { ICatalogProduct } from "./pastry";
import { getEarliestQuoteDate, getQuoteIcs, getQuoteMissing, getQuoteSizeLabel, getQuoteSpecLines } from "./quote";
import type { IQuote, IQuoteDraft } from "./quote";

const FLAN: ICatalogProduct = {
    id: 2,
    name: "Flan napolitano",
    description: "",
    tab: "Flan y cheesecake",
    needsPhoto: false,
    allowsTopper: false,
    topperPrice: 10,
    sizes: [{ id: 5, label: '8"', price: 39 }],
    groups: [],
};

const CAKE: ICatalogProduct = {
    ...FLAN,
    id: 1,
    name: "Cake",
    needsPhoto: true,
    allowsTopper: true,
    sizes: [{ id: 1, label: '6" doble altura', price: 50 }],
    groups: [{ id: 1, name: "Masa", min: 1, max: 1, freeMax: null, options: [{ id: 10, name: "Vainilla caramelo", prices: { "1": 0 } }] }],
};

const DRAFT: IQuoteDraft = {
    productId: 2,
    sizeId: 5,
    optionIds: [],
    topper: false,
    customerName: "Mariana Ortega",
    customerPhone: "6123-4567",
    customerEmail: "mariana.ortega@gmail.com",
    desiredDate: getEarliestQuoteDate(),
    note: "",
    cakeImage: null,
    topperImage: null,
    privacyConsent: true,
};

describe("lo que falta para cotizar", () => {
    test("un postre con sus datos y la casilla está listo", () => {
        expect(getQuoteMissing(DRAFT, FLAN)).toEqual([]);
    });

    test("sin catálogo o sin tamaño no se puede enviar", () => {
        expect(getQuoteMissing(DRAFT, undefined)).toContain("Elige el postre y el tamaño");
        expect(getQuoteMissing({ ...DRAFT, sizeId: null }, FLAN)).toContain("Elige el postre y el tamaño");
    });

    test("el correo se pide y tiene que tener forma de correo", () => {
        expect(getQuoteMissing({ ...DRAFT, customerEmail: "" }, FLAN)).toContain("Escribe tu correo");
        expect(getQuoteMissing({ ...DRAFT, customerEmail: "mariana@gmail" }, FLAN)).toContain("Escribe tu correo");
        expect(getQuoteMissing({ ...DRAFT, customerEmail: " Mariana@Gmail.com " }, FLAN)).toEqual([]);
    });

    test("la casilla del aviso se pide siempre", () => {
        expect(getQuoteMissing({ ...DRAFT, privacyConsent: false }, FLAN)).toContain("Acepta el aviso de privacidad");
    });

    test("una receta con foto pide la foto, el grupo y la del topper", () => {
        const draft = { ...DRAFT, productId: 1, sizeId: 1, topper: true };
        const missing = getQuoteMissing(draft, CAKE);
        expect(missing).toContain("Elige masa");
        expect(missing).toContain("Sube la foto de referencia");
        expect(missing).toContain("Sube la foto de referencia del topper");
        expect(getQuoteMissing({ ...draft, optionIds: [10], cakeImage: "data:a", topperImage: "data:b" }, CAKE)).toEqual([]);
    });
});

describe("cotizaciones de recetas", () => {
    const quote = {
        code: "CB-1",
        desiredDate: "2026-10-20",
        customerName: "Ana",
        customerPhone: null,
        note: null,
        total: 66,
        selection: {
            kind: "receta",
            product: { id: 1, name: "Cake" },
            size: { id: 1, label: '6" doble altura' },
            basePrice: 50,
            options: [{ group: "Masa", id: 10, name: "Zanahoria", price: 6 }],
            topper: true,
            topperPrice: 10,
            estimatedCost: 20,
        },
    } as IQuote;

    test("la etiqueta es nombre y tamaño, y el detalle una línea por opción", () => {
        expect(getQuoteSizeLabel(quote.selection)).toBe('Cake 6" doble altura');
        expect(getQuoteSpecLines(quote.selection)).toEqual([
            { label: "Masa", name: "Zanahoria", price: 6 },
            { label: "Topper", name: "", price: 10 },
        ]);
    });

    test("el calendario lista las opciones", () => {
        expect(getQuoteIcs(quote)).toContain("Masa: Zanahoria");
    });
});
