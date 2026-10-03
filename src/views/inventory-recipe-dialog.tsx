import { useEffect, useState } from "react";
import { fetchSupplies, getPanamaToday } from "@/helpers/admin";
import type { IMenuItem, ISupplyStatus } from "@/helpers/admin";
import {
    availabilityLabel,
    changeAvailabilityMode,
    compatibleUnits,
    expirationLabel,
    fetchRecipe,
    panamaDateTime,
    previewProduction,
    produceBatch,
    saveRecipe,
    deleteRecipe,
    fetchOptionRules,
} from "@/helpers/inventory";
import type { IOptionRule } from "@/helpers/inventory";
import type { IModifier } from "@/helpers/modifiers";
import { RecipeOptions } from "./recipe-options";
import type { AvailabilityMode, ProductAvailability, ProductionPreview, Recipe } from "@/helpers/inventory";
import { HttpError } from "@/helpers/getHttp";
const blank = (item: IMenuItem, variantId: string): Recipe => ({
    variantId,
    itemId: item.id,
    name: item.name,
    productionMode: "MADE_TO_ORDER",
    availabilityMode: "AUTOMATIC",
    outputSupplyId: null,
    yieldQuantity: "1",
    isPerishable: false,
    shelfLifeDays: null,
    ingredients: [],
});
export const RecipeDialog = ({
    token,
    item,
    onClose,
    onChanged,
    modifiers = [],
    usedBy,
}: {
    token: string;
    item: IMenuItem;
    onClose: () => void;
    onChanged: () => Promise<void>;
    /** Los modificadores del producto: con ellos aparece la sección Opciones. */
    modifiers?: IModifier[];
    usedBy?: Record<string, string[]>;
}) => {
    const variants = item.variants ?? [];
    const [variantId, setVariantId] = useState(variants[0]?.variantId ?? "");
    const [recipe, setRecipe] = useState<Recipe>(blank(item, variantId)),
        [availability, setAvailability] = useState<ProductAvailability | null>(null);
    const [supplies, setSupplies] = useState<ISupplyStatus[]>([]),
        [search, setSearch] = useState(""),
        [loading, setLoading] = useState(true),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const [quantity, setQuantity] = useState(""),
        [producedAt, setProducedAt] = useState(getPanamaToday()),
        [expiration, setExpiration] = useState("");
    const [preview, setPreview] = useState<ProductionPreview | null>(null),
        [saved, setSaved] = useState(false);
    const [rules, setRules] = useState<IOptionRule[]>([]);
    useEffect(() => {
        if (!modifiers.length) return;
        const c = new AbortController();
        fetchOptionRules(token, "admin", c.signal)
            .then((r) => setRules(r.rules))
            .catch(() => undefined);
        return () => c.abort();
    }, [token, modifiers.length]);
    useEffect(() => {
        const c = new AbortController();
        void Promise.all([fetchSupplies(token, c.signal), fetchRecipe(token, variantId, c.signal)])
            .then(([s, r]) => {
                if (c.signal.aborted) return;
                setSupplies(s.supplies);
                setRecipe(r.recipe ?? blank(item, variantId));
                setAvailability(r.availability);
                setSaved(Boolean(r.recipe));
                setLoading(false);
            })
            .catch((e) => {
                if (!c.signal.aborted) {
                    setLoading(false);
                    setError(e instanceof HttpError ? e.message : "No pudimos cargar la receta");
                }
            });
        return () => c.abort();
    }, [token, variantId, item]);
    const run = async (work: () => Promise<void>) => {
        setBusy(true);
        setError("");
        try {
            await work();
        } catch (e) {
            setError(e instanceof HttpError ? e.message : "No pudimos completar la operación");
        } finally {
            setBusy(false);
        }
    };
    const update = (next: Recipe) => {
        setRecipe(next);
        setSaved(false);
        setPreview(null);
    };
    const refresh = async () => {
        const r = await fetchRecipe(token, variantId);
        setRecipe(r.recipe ?? blank(item, variantId));
        setAvailability(r.availability);
        setSaved(Boolean(r.recipe));
        await onChanged();
    };
    return (
        <div
            className="adm-modal inventory-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={"Receta de " + item.name}
        >
            <div className="adm-modal__panel adm-modal__panel--wide">
                <h3 className="script">{item.name} · Receta</h3>
                {variants.length > 1 ? (
                    <label className="adm-form__row">
                        <span>Variante</span>
                        <select
                            className="adm-form__input"
                            value={variantId}
                            disabled={busy}
                            onChange={(e) => {
                                setLoading(true);
                                setPreview(null);
                                setError("");
                                setVariantId(e.target.value);
                            }}
                        >
                            {variants.map((v) => (
                                <option key={v.variantId} value={v.variantId}>
                                    {v.name}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
                {loading ? (
                    <p className="adm-note">Cargando…</p>
                ) : (
                    <>
                        <div className="adm-form">
                            <label className="adm-form__row">
                                <span>Preparación</span>
                                <select
                                    className="adm-form__input"
                                    value={recipe.productionMode}
                                    onChange={(e) =>
                                        update({
                                            ...recipe,
                                            productionMode: e.target.value as Recipe["productionMode"],
                                        })
                                    }
                                >
                                    <option value="MADE_TO_ORDER">Al momento</option>
                                    <option value="BATCH">Por lotes</option>
                                </select>
                            </label>
                            <label className="adm-form__row">
                                <span>Rendimiento de esta receta (unidades)</span>
                                <input
                                    className="adm-form__input"
                                    inputMode="decimal"
                                    value={recipe.yieldQuantity}
                                    onChange={(e) =>
                                        update({ ...recipe, yieldQuantity: e.target.value.replace(",", ".") })
                                    }
                                />
                            </label>
                            {recipe.productionMode === "BATCH" ? (
                                <>
                                    <label className="adm-form__row">
                                        <span>¿Es perecedero?</span>
                                        <select
                                            className="adm-form__input"
                                            value={String(recipe.isPerishable)}
                                            onChange={(e) =>
                                                update({ ...recipe, isPerishable: e.target.value === "true" })
                                            }
                                        >
                                            <option value="false">No</option>
                                            <option value="true">Sí</option>
                                        </select>
                                    </label>
                                    <label className="adm-form__row">
                                        <span>Vida útil (días)</span>
                                        <input
                                            className="adm-form__input"
                                            type="number"
                                            min={1}
                                            max={3650}
                                            disabled={!recipe.isPerishable}
                                            value={recipe.shelfLifeDays ?? ""}
                                            onChange={(e) =>
                                                update({
                                                    ...recipe,
                                                    shelfLifeDays: e.target.value ? Number(e.target.value) : null,
                                                })
                                            }
                                        />
                                    </label>
                                    <label className="adm-form__row adm-form__row--full">
                                        <span>Insumo preparado de salida</span>
                                        <select
                                            className="adm-form__input"
                                            disabled={Boolean(recipe.outputSupplyId && saved)}
                                            value={recipe.outputSupplyId ?? ""}
                                            onChange={(e) =>
                                                update({
                                                    ...recipe,
                                                    outputSupplyId: e.target.value ? Number(e.target.value) : null,
                                                })
                                            }
                                        >
                                            <option value="">Crear automáticamente al guardar</option>
                                            {supplies
                                                .filter((s) => s.inventoryType === "PREPARED_PRODUCT")
                                                .map((s) => (
                                                    <option key={s.id} value={s.id}>
                                                        {s.name}
                                                    </option>
                                                ))}
                                        </select>
                                    </label>
                                </>
                            ) : null}
                        </div>
                        <p className="adm-form__note">
                            Ingredientes necesarios para producir {recipe.yieldQuantity || "…"} unidades. Se descontarán
                            en sus unidades de consumo.
                        </p>
                        <div className="adm-scroll">
                            <table className="adm-table adm-table--compact">
                                <thead>
                                    <tr>
                                        <th>Ingrediente</th>
                                        <th>Cantidad</th>
                                        <th>Unidad</th>
                                        <th>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recipe.ingredients.map((i, index) => (
                                        <tr key={i.inventoryItemId}>
                                            <td>{i.name ?? supplies.find((s) => s.id === i.inventoryItemId)?.name}</td>
                                            <td>
                                                <input
                                                    aria-label={"Cantidad de " + i.name}
                                                    className="adm-form__input"
                                                    inputMode="decimal"
                                                    value={i.quantity}
                                                    onChange={(e) =>
                                                        update({
                                                            ...recipe,
                                                            ingredients: recipe.ingredients.map((x, n) =>
                                                                n === index
                                                                    ? {
                                                                          ...x,
                                                                          quantity: e.target.value.replace(",", "."),
                                                                      }
                                                                    : x,
                                                            ),
                                                        })
                                                    }
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    aria-label={"Unidad de " + i.name}
                                                    className="adm-form__input"
                                                    value={i.unit}
                                                    onChange={(e) =>
                                                        update({
                                                            ...recipe,
                                                            ingredients: recipe.ingredients.map((x, n) =>
                                                                n === index ? { ...x, unit: e.target.value } : x,
                                                            ),
                                                        })
                                                    }
                                                >
                                                    {compatibleUnits(
                                                        i.baseUnit ??
                                                            supplies.find((s) => s.id === i.inventoryItemId)?.unit ??
                                                            i.unit,
                                                    ).map((u) => (
                                                        <option key={u}>{u}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                                                <button
                                                    className="adm-btn adm-btn--sm"
                                                    onClick={() =>
                                                        update({
                                                            ...recipe,
                                                            ingredients: recipe.ingredients.filter(
                                                                (_, n) => n !== index,
                                                            ),
                                                        })
                                                    }
                                                >
                                                    Eliminar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <label className="adm-form__row">
                            <span>Buscar ingrediente</span>
                            <input
                                className="adm-form__input"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Nombre del insumo"
                            />
                        </label>
                        <select
                            aria-label="Agregar ingrediente"
                            className="adm-form__input"
                            value=""
                            onChange={(e) => {
                                const s = supplies.find((s) => s.id === Number(e.target.value));
                                if (s)
                                    update({
                                        ...recipe,
                                        ingredients: [
                                            ...recipe.ingredients,
                                            {
                                                inventoryItemId: s.id,
                                                name: s.name,
                                                quantity: "1",
                                                unit: s.unit,
                                                baseUnit: s.unit,
                                            },
                                        ],
                                    });
                            }}
                        >
                            <option value="">+ Agregar ingrediente</option>
                            {supplies
                                .filter(
                                    (s) =>
                                        s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
                                        !recipe.ingredients.some((i) => i.inventoryItemId === s.id) &&
                                        s.id !== recipe.outputSupplyId,
                                )
                                .map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} · {s.unit}
                                    </option>
                                ))}
                        </select>
                        <div className="adm-modal__actions">
                            <button
                                className="adm-btn adm-btn--solid"
                                disabled={busy || recipe.ingredients.length === 0}
                                onClick={() =>
                                    void run(async () => {
                                        await saveRecipe(token, variantId, recipe);
                                        await refresh();
                                    })
                                }
                            >
                                {busy ? "Guardando…" : "Guardar receta"}
                            </button>
                            {saved ? (
                                <button
                                    className="adm-btn"
                                    disabled={busy}
                                    onClick={() =>
                                        void run(async () => {
                                            await deleteRecipe(token, variantId);
                                            await refresh();
                                        })
                                    }
                                >
                                    Eliminar receta
                                </button>
                            ) : null}
                        </div>
                        {modifiers.length ? (
                            <>
                                <h4>Opciones</h4>
                                <RecipeOptions
                                    token={token}
                                    scope="admin"
                                    modifiers={modifiers}
                                    usedBy={usedBy}
                                    supplies={supplies}
                                    recipeSupplyIds={recipe.ingredients.map((i) => i.inventoryItemId)}
                                    rules={rules}
                                    isBatch={recipe.productionMode === "BATCH"}
                                    onRulesSaved={(optionId, next) =>
                                        setRules((current) => [...current.filter((r) => r.optionId !== optionId), ...next])
                                    }
                                />
                            </>
                        ) : null}
                        {saved ? (
                            <>
                                <label className="adm-form__row">
                                    <span>Disponibilidad del menú</span>
                                    <select
                                        className="adm-form__input"
                                        disabled={busy}
                                        value={availability?.availabilityMode ?? "AUTOMATIC"}
                                        onChange={(e) =>
                                            void run(async () => {
                                                await changeAvailabilityMode(
                                                    token,
                                                    variantId,
                                                    e.target.value as AvailabilityMode,
                                                );
                                                await refresh();
                                            })
                                        }
                                    >
                                        <option value="AUTOMATIC">Automática</option>
                                        <option value="MANUAL_ON">Disponible manualmente</option>
                                        <option value="MANUAL_OFF">Apagado manualmente</option>
                                    </select>
                                </label>
                                {availability ? (
                                    <p className="adm-note">
                                        {availabilityLabel(availability)} ·{" "}
                                        {availability.productionMode === "BATCH"
                                            ? "Stock: " + availability.usableStock
                                            : "Se pueden preparar: " + availability.maxProducible}
                                        {availability.limitingIngredient
                                            ? " · Limitado por: " + availability.limitingIngredient
                                            : ""}
                                        {availability.nextExpiration
                                            ? " · " + expirationLabel(availability.nextExpiration)
                                            : ""}
                                        {availability.warning ? (
                                            <strong className="adm-warning"> · {availability.warning}</strong>
                                        ) : null}
                                    </p>
                                ) : null}
                                {recipe.productionMode === "BATCH" ? (
                                    <>
                                        <h4>Producir lote</h4>
                                        <div className="adm-form">
                                            <label className="adm-form__row">
                                                <span>Cantidad</span>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    step={1}
                                                    className="adm-form__input"
                                                    value={quantity}
                                                    onChange={(e) => {
                                                        setQuantity(e.target.value);
                                                        setPreview(null);
                                                    }}
                                                />
                                            </label>
                                            <label className="adm-form__row">
                                                <span>Fecha de producción</span>
                                                <input
                                                    type="date"
                                                    max={getPanamaToday()}
                                                    className="adm-form__input"
                                                    value={producedAt}
                                                    onChange={(e) => {
                                                        setProducedAt(e.target.value);
                                                        setPreview(null);
                                                    }}
                                                />
                                            </label>
                                            <label className="adm-form__row">
                                                <span>
                                                    Vencimiento <em>opcional</em>
                                                </span>
                                                <input
                                                    type="date"
                                                    className="adm-form__input"
                                                    value={expiration}
                                                    onChange={(e) => setExpiration(e.target.value)}
                                                />
                                            </label>
                                        </div>
                                        <p className="adm-note">
                                            {!expiration && recipe.isPerishable && recipe.shelfLifeDays
                                                ? "Vence " + recipe.shelfLifeDays + " días después de producir."
                                                : "Sin vida útil ni fecha explícita, el lote no tendrá vencimiento."}
                                        </p>
                                        <button
                                            className="adm-btn"
                                            disabled={busy || !quantity}
                                            onClick={() =>
                                                void run(async () =>
                                                    setPreview(await previewProduction(token, variantId, quantity)),
                                                )
                                            }
                                        >
                                            Ver ingredientes necesarios
                                        </button>
                                        {preview ? (
                                            <>
                                                <div className="adm-scroll">
                                                    <table className="adm-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Ingrediente</th>
                                                                <th>Necesario</th>
                                                                <th>Disponible</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {preview.ingredients.map((i) => (
                                                                <tr
                                                                    key={i.inventoryItemId}
                                                                    className={i.sufficient ? "" : "is-crit"}
                                                                >
                                                                    <td>
                                                                        {i.name}
                                                                        {!i.sufficient ? " · Insuficiente" : ""}
                                                                    </td>
                                                                    <td>
                                                                        {i.needed} {i.unit}
                                                                    </td>
                                                                    <td>
                                                                        {i.available} {i.unit}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <button
                                                    className="adm-btn adm-btn--solid"
                                                    disabled={busy || !preview.sufficient}
                                                    onClick={() =>
                                                        void run(async () => {
                                                            await produceBatch(
                                                                token,
                                                                variantId,
                                                                quantity,
                                                                panamaDateTime(producedAt),
                                                                expiration ? panamaDateTime(expiration) : undefined,
                                                            );
                                                            setPreview(null);
                                                            setQuantity("");
                                                            await refresh();
                                                        })
                                                    }
                                                >
                                                    Confirmar producción de {quantity}
                                                </button>
                                            </>
                                        ) : null}
                                    </>
                                ) : null}
                            </>
                        ) : (
                            <p className="adm-note">Guarda la receta antes de cambiar disponibilidad o producir.</p>
                        )}
                    </>
                )}
                {error ? (
                    <p className="adm-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <div className="adm-modal__actions">
                    <button className="adm-btn" disabled={busy} onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};
