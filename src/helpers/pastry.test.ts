import { describe, expect, test } from "vitest";

import {
    canAddCatalogOption,
    createEmptyPastryProduct,
    formatUnitCost,
    getCatalogBreakdown,
    getCatalogDefaultOptionIds,
    getCatalogMeasures,
    getCatalogSizeFor,
    getCatalogVariants,
    getCatalogGroupsMissing,
    getItemCost,
    getPastryBasePrice,
    getPastryEstimatedCost,
    getPastryIngredientMap,
    getPastryOptionPrice,
    getPastryProductMissing,
    getPastrySizeText,
    getRecipeCost,
    getUnitCost,
    parseDecimal,
    isDoubleVariant,
    resolveCatalogPick,
    resolveMeasureChange,
    resolveVariantChange,
    toggleCatalogOption,
} from "./pastry";
import type { ICatalogProduct, IPastryIngredient, IPastryItem } from "./pastry";

const QUESO: IPastryIngredient = {
    id: 1,
    name: "Queso crema",
    unit: "g",
    packageQty: 226,
    packageCost: 3.95,
    unitCost: 3.95 / 226,
    archived: false,
    usedIn: 1,
    updatedAt: "2026-10-11T00:00:00Z",
    updatedBy: null,
};

const INGREDIENTS = getPastryIngredientMap([QUESO]);
const BASE: IPastryItem[] = [
    { ingredientId: 1, qty: 900 },
    { label: "Costo fijo", fixedCost: 3 },
];

describe("fórmula de precio (vectores del contrato)", () => {
    test("costo por unidad e ítem", () => {
        expect(getUnitCost(QUESO)).toBeCloseTo(0.017478, 5);
        expect(getItemCost(BASE[0], INGREDIENTS)).toBeCloseTo(15.730088, 5);
        expect(getItemCost(BASE[1], INGREDIENTS)).toBe(3);
    });

    test("costo de la receta sin redondear", () => {
        expect(getRecipeCost(BASE, INGREDIENTS)).toBeCloseTo(18.730088, 5);
    });

    test("precio base con escala 1 y 0.4727", () => {
        const product = { base: BASE, factor: 2.95 };
        expect(getPastryBasePrice(product, { scale: 1 }, INGREDIENTS)).toBe(55.25);
        expect(getPastryBasePrice(product, { scale: 0.4727 }, INGREDIENTS)).toBe(26.12);
    });

    test("una opción de 1.6949 vale $5", () => {
        const option = { items: [{ label: "Recargo", fixedCost: 1.6949 }] };
        expect(getPastryOptionPrice(option, { factor: 2.95 }, { scale: 1 }, INGREDIENTS)).toBe(5);
    });

    test("costo estimado: base más opciones por la escala, sin factor", () => {
        const option = { items: [{ label: "Recargo", fixedCost: 2 }] };
        expect(getPastryEstimatedCost({ base: BASE }, [option], { scale: 0.5 }, INGREDIENTS)).toBe(10.37);
    });

    test("un ingrediente que ya no está cuenta cero", () => {
        expect(getItemCost({ ingredientId: 99, qty: 10 }, INGREDIENTS)).toBe(0);
    });

    test("el costo por unidad se muestra con 4 decimales cuando es chico", () => {
        expect(formatUnitCost(QUESO)).toBe("$0.0175 por g");
        expect(formatUnitCost({ unit: "u", packageQty: 30, packageCost: 3.6 })).toBe("$0.12 por unidad");
    });

    test("acepta coma o punto al escribir", () => {
        expect(parseDecimal("2,95")).toBe(2.95);
        expect(parseDecimal("")).toBe(0);
        expect(parseDecimal("abc")).toBe(0);
    });
});

describe("validación de la receta", () => {
    const valid = () => ({
        ...createEmptyPastryProduct(),
        name: "Tarta",
        tab: "Tartas",
        sizes: [{ label: '8"', variant: null, scale: 1, isBase: true }],
        base: BASE,
    });

    test("una receta completa está lista", () => {
        expect(getPastryProductMissing(valid())).toEqual([]);
    });

    test("pide nombre, pestaña, un tamaño base y escalas", () => {
        const missing = getPastryProductMissing({ ...valid(), name: " ", tab: "", sizes: [{ label: "", variant: null, scale: 0, isBase: false }] });
        expect(missing).toEqual(
            expect.arrayContaining([
                "Escribe el nombre del postre",
                "Elige la pestaña del cotizador",
                "Marca un solo tamaño como base",
                "Cada tamaño necesita su nombre",
                "Cada tamaño necesita una escala mayor que 0",
            ])
        );
    });

    test("publicar exige ingredientes en la base", () => {
        expect(getPastryProductMissing({ ...valid(), base: [], active: true })).toContain(
            "Para publicarla, la receta base necesita al menos un ingrediente"
        );
        expect(getPastryProductMissing({ ...valid(), base: [], active: false })).toEqual([]);
    });

    test("los grupos validan mínimo, máximo y opciones activas", () => {
        const group = { name: "Masa", min: 2, max: 1, freeMax: null, options: [{ name: "A", active: true, items: [] }] };
        const missing = getPastryProductMissing({ ...valid(), groups: [group] });
        expect(missing).toContain("Masa: el máximo tiene que ser 1 o más y no menor que el mínimo");
        expect(missing).toContain("Masa: necesita al menos 2 opciones activas");
    });
});

const RELLENO = {
    id: 7,
    name: "Relleno",
    min: 1,
    max: 2,
    freeMax: 1,
    options: [
        { id: 70, name: "Dulce de leche", prices: { "1": 0 } },
        { id: 71, name: "Fresas", prices: { "1": 0 } },
        { id: 72, name: "Ganache", prices: { "1": 5 } },
        { id: 73, name: "Avellanas", prices: { "1": 5 } },
    ],
};

const PRODUCT: ICatalogProduct = {
    id: 1,
    name: "Cake",
    description: "",
    tab: "Cakes",
    needsPhoto: true,
    allowsTopper: true,
    topperPrice: 10,
    sizes: [{ id: 1, label: '6"', variant: null, price: 50 }],
    groups: [
        {
            id: 6,
            name: "Masa",
            min: 1,
            max: 1,
            freeMax: null,
            options: [
                { id: 60, name: "Vainilla", prices: { "1": 0 } },
                { id: 61, name: "Zanahoria", prices: { "1": 6 } },
            ],
        },
        RELLENO,
    ],
};

describe("lo elegido contra el catálogo vigente", () => {
    const catalog = { tabs: ["Cakes"], products: [PRODUCT] };

    test("sin elección arranca con la primera receta y sus obligatorias", () => {
        const pick = resolveCatalogPick(catalog, { productId: null, sizeId: null, optionIds: [] });
        expect(pick.product?.id).toBe(1);
        expect(pick.sizeId).toBe(1);
        expect(pick.optionIds).toEqual([60]);
    });

    test("si la receta o el tamaño ya no existen, se vuelve a la primera", () => {
        expect(resolveCatalogPick(catalog, { productId: 99, sizeId: 5, optionIds: [61] }).optionIds).toEqual([60]);
        expect(resolveCatalogPick(catalog, { productId: 1, sizeId: 5, optionIds: [61, 999] })).toMatchObject({ sizeId: 1, optionIds: [61] });
    });

    test("sin catálogo no hay nada elegido", () => {
        expect(resolveCatalogPick({ tabs: [], products: [] }, { productId: 1, sizeId: 1, optionIds: [] })).toEqual({
            product: undefined,
            sizeId: null,
            optionIds: [],
        });
    });
});

describe("grupos del cotizador: mínimo, máximo e incluidas", () => {
    test("sin elegir nada faltan los grupos obligatorios", () => {
        expect(getCatalogGroupsMissing(PRODUCT, 1, [])).toEqual(["Elige masa", "Elige relleno"]);
    });

    test("uno incluido alcanza; dos incluidos no", () => {
        expect(getCatalogGroupsMissing(PRODUCT, 1, [60, 70])).toEqual([]);
        expect(getCatalogGroupsMissing(PRODUCT, 1, [60, 70, 71])).toEqual([
            "En relleno solo puedes elegir 1 incluida: la otra tiene que ser especial",
        ]);
        expect(getCatalogGroupsMissing(PRODUCT, 1, [60, 70, 72])).toEqual([]);
    });

    test("más del máximo no se acepta", () => {
        expect(getCatalogGroupsMissing(PRODUCT, 1, [60, 72, 73, 70])).toEqual(["En relleno elige máximo 2"]);
    });

    test("no se puede sumar una incluida cuando ya hay una", () => {
        expect(canAddCatalogOption(RELLENO, [70], 1, 71)).toBe(false);
        expect(canAddCatalogOption(RELLENO, [70], 1, 72)).toBe(true);
        expect(canAddCatalogOption(RELLENO, [72, 73], 1, 70)).toBe(false);
        expect(canAddCatalogOption(RELLENO, [70], 1, 70)).toBe(true);
    });

    test("un grupo de un solo lugar cambia la opción en vez de sumar", () => {
        expect(toggleCatalogOption(PRODUCT.groups[0], [60, 70], 1, 61)).toEqual([70, 61]);
        expect(toggleCatalogOption(PRODUCT.groups[0], [60, 70], 1, 60)).toEqual([60, 70]);
        expect(toggleCatalogOption(RELLENO, [60, 70], 1, 70)).toEqual([60]);
    });

    test("las obligatorias de un solo lugar arrancan con la primera", () => {
        expect(getCatalogDefaultOptionIds(PRODUCT)).toEqual([60]);
    });

    test("el total es la suma exacta de lo que ve el cliente", () => {
        const breakdown = getCatalogBreakdown(PRODUCT, 1, [61, 70, 72], true);
        expect(breakdown.lines.map((one) => one.price)).toEqual([6, 0, 5]);
        expect(breakdown.total).toBe(71);
        expect(getCatalogBreakdown(PRODUCT, 1, [61], false).total).toBe(56);
    });
});

describe("variantes de tamaño", () => {
    const CAKE: ICatalogProduct = {
        ...PRODUCT,
        sizes: [
            { id: 1, label: '4.5"', variant: "Doble altura", price: 30 },
            { id: 2, label: '6"', variant: "1 altura", price: 40 },
            { id: 3, label: '6"', variant: "Doble altura", price: 50, isBase: true },
            { id: 4, label: '7"', variant: "1 altura", price: 55 },
            { id: 5, label: '7"', variant: "Doble altura", price: 70 },
        ],
    };

    test("medidas y variantes únicas, en orden", () => {
        expect(getCatalogMeasures(CAKE)).toEqual(['4.5"', '6"', '7"']);
        expect(getCatalogVariants(CAKE)).toEqual(["Doble altura", "1 altura"]);
        expect(getCatalogVariants(PRODUCT)).toEqual([]);
    });

    test("ordena las medidas en pulgadas de menor a mayor aunque la receta venga por precio", () => {
        const byPrice = { ...CAKE, sizes: [...CAKE.sizes].sort((a, b) => a.price - b.price) };
        expect(getCatalogMeasures(byPrice)).toEqual(['4.5"', '6"', '7"']);
        const named = { ...CAKE, sizes: [{ ...CAKE.sizes[0], label: "Mediano" }, { ...CAKE.sizes[1], label: "Grande" }] };
        expect(getCatalogMeasures(named)).toEqual(["Mediano", "Grande"]);
    });

    test("el precio sale de la medida y la variante", () => {
        expect(getCatalogSizeFor(CAKE, '6"', "1 altura")?.price).toBe(40);
        expect(getCatalogSizeFor(CAKE, '4.5"', "1 altura")).toBeUndefined();
    });

    test("arranca en el tamaño base y, sin saberlo, en el primero", () => {
        expect(resolveCatalogPick({ tabs: ["Cakes"], products: [CAKE] }, { productId: null, sizeId: null, optionIds: [] }).sizeId).toBe(3);
        expect(resolveCatalogPick({ tabs: ["Cakes"], products: [PRODUCT] }, { productId: null, sizeId: null, optionIds: [] }).sizeId).toBe(1);
    });

    test("tocar una medida conserva la variante o salta a donde existe", () => {
        expect(resolveMeasureChange(CAKE, 2, '7"')?.id).toBe(4);
        expect(resolveMeasureChange(CAKE, 2, '4.5"')?.id).toBe(1);
    });

    test("cambiar de variante conserva la medida o toma la primera disponible", () => {
        expect(resolveVariantChange(CAKE, 3, "1 altura")?.id).toBe(2);
        expect(resolveVariantChange(CAKE, 1, "1 altura")?.id).toBe(2);
        expect(resolveVariantChange(CAKE, 2, "Doble altura")?.id).toBe(3);
    });

    test("nombra el tamaño y reconoce la doble altura", () => {
        expect(getPastrySizeText({ label: '6"', variant: "Doble altura" })).toBe('6" doble altura');
        expect(getPastrySizeText({ label: '6"', variant: null })).toBe('6"');
        expect(isDoubleVariant("Doble altura")).toBe(true);
        expect(isDoubleVariant("1 altura")).toBe(false);
        expect(isDoubleVariant(null)).toBe(false);
    });

    test("la receta no deja repetir medida y variante", () => {
        const base = createEmptyPastryProduct();
        const sizes = [
            { label: '6"', variant: "1 altura", scale: 1, isBase: true },
            { label: '6"', variant: "doble altura", scale: 1.5, isBase: false },
        ];
        const product = { ...base, name: "Cake", tab: "Cakes", base: BASE, sizes };
        expect(getPastryProductMissing(product)).toEqual([]);
        const repeated = { ...product, sizes: [sizes[0], { ...sizes[1], variant: " 1 Altura " }] };
        expect(getPastryProductMissing(repeated)).toContain("Hay dos tamaños con la misma medida y variante");
    });
});
