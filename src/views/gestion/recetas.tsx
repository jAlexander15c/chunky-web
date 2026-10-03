import { useCallback, useEffect, useMemo, useState } from "react";

import { FullSheet } from "@/components";
import { HttpError, SUPPLY_CATEGORY_LABEL, fetchGestionSupplies } from "@/helpers";
import type { ISupplyStatus } from "@/helpers";
import { compatibleUnits, deleteRecipe, fetchRecipe, fetchRecipeCatalog, saveRecipe } from "@/helpers/inventory";
import type { IOptionRule, IRecipeCatalog, IRecipeCatalogProduct, ProductAvailability, Recipe } from "@/helpers/inventory";

import { RecipeOptions } from "../recipe-options";
import { GestionPager } from "./pager";

type RecipeFilter = "todos" | "con" | "sin";

const FILTERS: { id: RecipeFilter; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "con", label: "Con receta" },
    { id: "sin", label: "Sin receta" },
];

const PAGE_SIZE = 20;

/** Sin tildes ni mayúsculas: "cafe" encuentra "Café". */
const getSearchKey = (value: string) =>
    value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const getFullName = (product: IRecipeCatalogProduct) =>
    product.variantName ? `${product.name} (${product.variantName})` : product.name;

const isMadeWithRecipe = (product: IRecipeCatalogProduct) =>
    product.hasRecipe && product.productionMode === "MADE_TO_ORDER";

const isInFilter = (product: IRecipeCatalogProduct, filter: RecipeFilter) =>
    filter === "todos" || (filter === "con" ? isMadeWithRecipe(product) : !isMadeWithRecipe(product));

/** La línea de estado de cada producto en la lista. */
const getProductMeta = (product: IRecipeCatalogProduct) => {
    if (product.productionMode === "BATCH") return `Por lotes · quedan ${product.usableStock ?? 0}`;
    if (!product.hasRecipe) return "Se vende sin controlar insumos";
    if (product.availabilityMode === "MANUAL_OFF") return "Apagado a mano";
    const limit = product.limitingIngredient ? ` · limita ${product.limitingIngredient}` : "";
    return product.isAvailable
        ? `Se pueden preparar ${product.maxProducible ?? 0}${limit}`
        : `Apagado: no alcanza${limit.replace(" · limita", " el")}`;
};

const getProductChip = (product: IRecipeCatalogProduct) =>
    product.productionMode === "BATCH"
        ? { label: "Por lotes", tone: "is-idle" }
        : product.hasRecipe
          ? product.isAvailable
              ? { label: "Con receta", tone: "" }
              : { label: "Apagado", tone: "is-off" }
          : { label: "Sin receta", tone: "is-idle" };

const getBlankRecipe = (product: IRecipeCatalogProduct): Recipe => ({
    variantId: product.variantId,
    itemId: product.itemId,
    name: getFullName(product),
    productionMode: "MADE_TO_ORDER",
    availabilityMode: "AUTOMATIC",
    outputSupplyId: null,
    yieldQuantity: "1",
    isPerishable: false,
    shelfLifeDays: null,
    ingredients: [],
});

interface IRecipeSheetProps {
    token: string;
    product: IRecipeCatalogProduct;
    catalog: IRecipeCatalog;
    supplies: ISupplyStatus[];
    onRulesSaved: (optionId: string, rules: IOptionRule[]) => void;
    onChanged: () => Promise<void>;
    onClose: () => void;
}

/** La receta de un producto al momento, con lo que hace cada opción de sus modificadores. */
const RecipeSheet = ({ token, product, catalog, supplies, onRulesSaved, onChanged, onClose }: IRecipeSheetProps) => {
    const isBatch = product.productionMode === "BATCH";
    const [recipe, setRecipe] = useState<Recipe>(() => getBlankRecipe(product));
    const [availability, setAvailability] = useState<ProductAvailability | null>(null);
    const [isSaved, setIsSaved] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [isLoading, setIsLoading] = useState(!isBatch);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const load = useCallback(
        async (signal?: AbortSignal) => {
            const data = await fetchRecipe(token, product.variantId, signal, "gestion");
            if (signal?.aborted) return;
            setRecipe(data.recipe?.ingredients.length ? data.recipe : getBlankRecipe(product));
            setAvailability(data.availability);
            setIsSaved(Boolean(data.recipe?.ingredients.length));
            setIsDirty(false);
        },
        [token, product]
    );

    useEffect(() => {
        if (isBatch) return;
        const controller = new AbortController();
        load(controller.signal)
            .catch((requestError) => {
                if (!controller.signal.aborted)
                    setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar la receta.");
            })
            .finally(() => setIsLoading(false));
        return () => controller.abort();
    }, [isBatch, load]);

    const run = async (work: () => Promise<void>) => {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await work();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos completar la operación.");
        } finally {
            setBusy(false);
        }
    };

    const update = (next: Partial<Recipe>) => {
        setRecipe((current) => ({ ...current, ...next }));
        setIsDirty(true);
        setNotice("");
    };

    const updateIngredient = (index: number, next: Partial<Recipe["ingredients"][number]>) =>
        update({ ingredients: recipe.ingredients.map((entry, n) => (n === index ? { ...entry, ...next } : entry)) });

    const supplyName = (id: number) => supplies.find((supply) => supply.id === id)?.name;
    const productModifiers = product.modifierIds
        .map((id) => catalog.modifiers.find((modifier) => modifier.id === id))
        .filter((modifier): modifier is NonNullable<typeof modifier> => Boolean(modifier));

    const usedBy = useMemo(() => {
        const byModifier: Record<string, string[]> = {};
        catalog.products.forEach((entry) =>
            entry.modifierIds.forEach((id) => {
                const names = (byModifier[id] ??= []);
                if (!names.includes(entry.name)) names.push(entry.name);
            })
        );
        return byModifier;
    }, [catalog.products]);

    const addable = supplies.filter((supply) => !recipe.ingredients.some((entry) => entry.inventoryItemId === supply.id));
    const categories = [...new Set(addable.map((supply) => supply.category))];

    return (
        <FullSheet title={`${getFullName(product)} · Receta`} onClose={onClose}>
            {() => (
                <div className="ges-rec-sheet">
                    {isBatch ? null : isLoading ? (
                        <p className="ges-empty">Cargando…</p>
                    ) : (
                        <>
                            <div className="ges-rec-head">
                                <div className="ges-field ges-field--sm">
                                    <span>Preparación</span>
                                    <p className="ges-rec-static">Al momento</p>
                                </div>
                                <label className="ges-field ges-field--sm">
                                    <span>Rinde (unidades)</span>
                                    <input
                                        inputMode="decimal"
                                        value={recipe.yieldQuantity}
                                        onChange={(event) => update({ yieldQuantity: event.target.value.replace(",", ".") })}
                                    />
                                </label>
                            </div>

                            <h3 className="ges-avail-group__title">Ingredientes de {recipe.yieldQuantity || "…"} unidad{recipe.yieldQuantity === "1" ? "" : "es"}</h3>
                            {recipe.ingredients.length === 0 ? (
                                <p className="ropt-hint">Agrega lo que gasta preparar este producto. Cada venta lo descuenta.</p>
                            ) : (
                                <ul className="ges-rec-ings">
                                    {recipe.ingredients.map((ingredient, index) => {
                                        const name = ingredient.name ?? supplyName(ingredient.inventoryItemId) ?? "Insumo";
                                        const baseUnit =
                                            ingredient.baseUnit ??
                                            supplies.find((supply) => supply.id === ingredient.inventoryItemId)?.unit ??
                                            ingredient.unit;
                                        return (
                                            <li key={ingredient.inventoryItemId} className="ges-rec-ing">
                                                <b>{name}</b>
                                                <label className="ges-field ges-field--sm ges-rec-ing__qty">
                                                    <span className="ges-sr-only">Cantidad de {name}</span>
                                                    <input
                                                        inputMode="decimal"
                                                        value={ingredient.quantity}
                                                        onChange={(event) =>
                                                            updateIngredient(index, { quantity: event.target.value.replace(",", ".") })
                                                        }
                                                    />
                                                </label>
                                                <label className="ges-field ges-field--sm ges-rec-ing__unit">
                                                    <span className="ges-sr-only">Unidad de {name}</span>
                                                    <select
                                                        value={ingredient.unit}
                                                        onChange={(event) => updateIngredient(index, { unit: event.target.value })}
                                                    >
                                                        {compatibleUnits(baseUnit).map((unit) => (
                                                            <option key={unit} value={unit}>{unit === "unit" ? "u" : unit}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <button
                                                    type="button"
                                                    className="ropt-remove"
                                                    aria-label={`Quitar ${name}`}
                                                    onClick={() =>
                                                        update({ ingredients: recipe.ingredients.filter((_, n) => n !== index) })
                                                    }
                                                >
                                                    ×
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            <label className="ges-field ges-field--sm">
                                <span className="ges-sr-only">Agregar ingrediente</span>
                                <select
                                    value=""
                                    onChange={(event) => {
                                        const supply = supplies.find((entry) => entry.id === Number(event.target.value));
                                        if (supply)
                                            update({
                                                ingredients: [
                                                    ...recipe.ingredients,
                                                    {
                                                        inventoryItemId: supply.id,
                                                        name: supply.name,
                                                        quantity: "1",
                                                        unit: supply.unit,
                                                        baseUnit: supply.unit,
                                                    },
                                                ],
                                            });
                                    }}
                                >
                                    <option value="">+ Agregar ingrediente</option>
                                    {categories.map((category) => (
                                        <optgroup key={category} label={SUPPLY_CATEGORY_LABEL[category]}>
                                            {addable
                                                .filter((supply) => supply.category === category)
                                                .map((supply) => (
                                                    <option key={supply.id} value={supply.id}>
                                                        {supply.name} · {supply.unit}
                                                    </option>
                                                ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </label>

                            {isSaved && availability && !isDirty ? (
                                <p className={`ges-rec-state${availability.isAvailable ? "" : " is-off"}`}>
                                    {availability.isAvailable
                                        ? `Se pueden preparar ${availability.maxProducible}`
                                        : "Apagado en la tienda y en el mostrador: no alcanza"}
                                    {availability.limitingIngredient ? ` · limita ${availability.limitingIngredient}` : ""}
                                </p>
                            ) : null}

                            <div className="ges-rec-acts">
                                <button
                                    type="button"
                                    className="ges-btn ges-btn--solid"
                                    disabled={busy || recipe.ingredients.length === 0 || (isSaved && !isDirty)}
                                    onClick={() =>
                                        void run(async () => {
                                            await saveRecipe(
                                                token,
                                                product.variantId,
                                                { ...recipe, itemId: product.itemId, name: getFullName(product), productionMode: "MADE_TO_ORDER" },
                                                "gestion"
                                            );
                                            await load();
                                            await onChanged();
                                            setNotice("Receta guardada. Cada venta descuenta estos insumos.");
                                        })
                                    }
                                >
                                    {busy ? "Guardando…" : isSaved && !isDirty ? "Guardada" : "Guardar receta"}
                                </button>
                                {isSaved && !isConfirmingDelete ? (
                                    <button type="button" className="ges-btn" disabled={busy} onClick={() => setIsConfirmingDelete(true)}>
                                        Quitar receta
                                    </button>
                                ) : null}
                            </div>
                            {isConfirmingDelete ? (
                                <div className="ges-rec-confirm" role="alert">
                                    <p>Sin receta, {product.name} se vende sin descontar insumos. Las reglas de sus opciones se quedan.</p>
                                    <div className="ges-rec-acts">
                                        <button type="button" className="ges-btn" disabled={busy} onClick={() => setIsConfirmingDelete(false)}>
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            className="ges-btn ges-btn--solid"
                                            disabled={busy}
                                            onClick={() =>
                                                void run(async () => {
                                                    await deleteRecipe(token, product.variantId, "gestion");
                                                    setIsConfirmingDelete(false);
                                                    await load();
                                                    await onChanged();
                                                    setNotice("Receta quitada.");
                                                })
                                            }
                                        >
                                            Quitar receta
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    )}

                    {notice ? <p className="ges-rec-state">{notice}</p> : null}
                    {error ? (
                        <p className="ges-error" role="alert">
                            {error}
                        </p>
                    ) : null}

                    <h3 className="ges-avail-group__title">Opciones</h3>
                    <RecipeOptions
                        token={token}
                        scope="gestion"
                        modifiers={productModifiers}
                        usedBy={usedBy}
                        supplies={supplies}
                        recipeSupplyIds={recipe.ingredients.map((entry) => entry.inventoryItemId)}
                        rules={catalog.rules}
                        onRulesSaved={onRulesSaved}
                        isBatch={isBatch}
                    />
                </div>
            )}
        </FullSheet>
    );
};

interface IGestionRecetasProps {
    token: string;
    onSessionExpired: () => void;
}

/** Gestión → Inventario → Recetas: lo que se prepara en el local y lo que hace cada opción. */
export const GestionRecetas = ({ token, onSessionExpired }: IGestionRecetasProps) => {
    const [catalog, setCatalog] = useState<IRecipeCatalog | null>(null);
    const [supplies, setSupplies] = useState<ISupplyStatus[]>([]);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<RecipeFilter>("todos");
    const [page, setPage] = useState(1);
    const [openVariantId, setOpenVariantId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const [catalogData, suppliesData] = await Promise.all([
                    fetchRecipeCatalog(token, "gestion", signal),
                    fetchGestionSupplies(token, signal),
                ]);
                setCatalog(catalogData);
                setSupplies(suppliesData.supplies);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar las recetas.");
            } finally {
                setIsLoading(false);
            }
        },
        [token, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const products = useMemo(() => catalog?.products ?? [], [catalog]);

    const matching = useMemo(() => {
        const key = getSearchKey(search);
        return products.filter((product) => !key || getSearchKey(`${product.name} ${product.variantName} ${product.categoryName}`).includes(key));
    }, [products, search]);

    const counts = useMemo(
        () =>
            Object.fromEntries(FILTERS.map(({ id }) => [id, matching.filter((product) => isInFilter(product, id)).length])) as Record<
                RecipeFilter,
                number
            >,
        [matching]
    );

    const visible = matching.filter((product) => isInFilter(product, filter));
    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const openProduct = products.find((product) => product.variantId === openVariantId);
    const closeSheet = useCallback(() => setOpenVariantId(null), []);

    return (
        <main className="ges-main">
            <div className="ges-avail-filters">
                <label className="ges-sr-only" htmlFor="ges-rec-search">
                    Buscar producto
                </label>
                <input
                    id="ges-rec-search"
                    className="ges-search"
                    type="search"
                    placeholder="Buscar producto…"
                    autoComplete="off"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                    }}
                />
                <div className="ges-avail-states" aria-label="Receta">
                    {FILTERS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className="ges-tab"
                            aria-pressed={filter === option.id}
                            onClick={() => {
                                setFilter(option.id);
                                setPage(1);
                            }}
                        >
                            {option.label}
                            <small>{counts[option.id]}</small>
                        </button>
                    ))}
                </div>
            </div>

            {error ? (
                <p className="ges-error" role="alert">
                    {error}
                </p>
            ) : null}

            {isLoading ? (
                <p className="ges-empty">Cargando…</p>
            ) : pageItems.length === 0 ? (
                <p className="ges-empty">{products.length ? "Ningún producto coincide con la búsqueda." : "No hay productos en el menú."}</p>
            ) : (
                <ul className="ges-avail-list">
                    {pageItems.map((product) => {
                        const chip = getProductChip(product);
                        return (
                            <li key={product.variantId}>
                                <button type="button" className="ges-avail ges-rec-row" onClick={() => setOpenVariantId(product.variantId)}>
                                    <span className="ges-avail__body">
                                        <span className="ges-rec-row__cat">{product.categoryName}</span>
                                        <span className="ges-avail__name">
                                            {product.name}
                                            {product.variantName ? <em> · {product.variantName}</em> : null}
                                        </span>
                                        <span className="ges-avail__meta">{getProductMeta(product)}</span>
                                    </span>
                                    <span className={`ges-chip ${chip.tone}`}>{chip.label}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            <GestionPager page={currentPage} pageCount={pageCount} onChange={setPage} />

            {openProduct && catalog ? (
                <RecipeSheet
                    token={token}
                    product={openProduct}
                    catalog={catalog}
                    supplies={supplies}
                    onRulesSaved={(optionId, rules) =>
                        setCatalog((current) =>
                            current ? { ...current, rules: [...current.rules.filter((rule) => rule.optionId !== optionId), ...rules] } : current
                        )
                    }
                    onChanged={() => load()}
                    onClose={closeSheet}
                />
            ) : null}
        </main>
    );
};
