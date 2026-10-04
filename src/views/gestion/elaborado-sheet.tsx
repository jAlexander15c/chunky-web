import { useEffect, useState } from "react";

import { FullSheet } from "@/components";
import { HttpError } from "@/helpers";
import type { ISupplyStatus } from "@/helpers";
import { getIntermediateUnitLabel } from "@/helpers/elaborados";
import { INTERMEDIATE_UNITS, createIntermediate, fetchSupplyRecipe, isIntermediate, saveSupplyRecipe } from "@/helpers/inventory";
import type { IIntermediateInput } from "@/helpers/inventory";

import { RecipeIngredients } from "./recipe-ingredients";
import type { IRecipeIngredient } from "./recipe-ingredients";

interface IElaboradoForm {
    name: string;
    unit: string;
    yieldQuantity: string;
    minStock: string;
    shelfLifeDays: string;
    ingredients: IRecipeIngredient[];
}

const BLANK: IElaboradoForm = { name: "", unit: "g", yieldQuantity: "", minStock: "0", shelfLifeDays: "", ingredients: [] };

const decimalInput = (value: string) => value.replace(",", ".");

/** Lo que el formulario manda al API, o el primer problema que lo impide. */
const getInput = (form: IElaboradoForm): IIntermediateInput | string => {
    if (form.name.trim().length < 2) return "Escribe el nombre del elaborado.";
    if (!(Number(form.yieldQuantity) > 0)) return "Escribe cuánto rinde una tanda.";
    if (!form.ingredients.length) return "Agrega al menos un ingrediente.";
    if (form.ingredients.some((entry) => !(Number(entry.quantity) > 0))) return "Cada ingrediente necesita una cantidad.";
    const days = form.shelfLifeDays.trim() ? Number(form.shelfLifeDays) : null;
    if (days !== null && !(Number.isInteger(days) && days >= 1)) return "Los días que dura son un número entero.";
    return {
        name: form.name.trim(),
        unit: form.unit,
        yieldQuantity: form.yieldQuantity,
        minStock: form.minStock.trim() || "0",
        shelfLifeDays: days,
        ingredients: form.ingredients.map(({ inventoryItemId, quantity, unit }) => ({ inventoryItemId, quantity, unit })),
    };
};

interface IElaboradoSheetProps {
    token: string;
    /** Sin id se crea uno nuevo. */
    supplyId: number | null;
    supplies: ISupplyStatus[];
    onSaved: () => Promise<void> | void;
    onClose: () => void;
}

/** Crear o editar un insumo elaborado: su unidad, cuánto rinde una tanda y qué lleva. */
export const ElaboradoSheet = ({ token, supplyId, supplies, onSaved, onClose }: IElaboradoSheetProps) => {
    const isNew = supplyId === null;
    const [form, setForm] = useState<IElaboradoForm>(BLANK);
    const [isLoading, setIsLoading] = useState(!isNew);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (supplyId === null) return;
        const controller = new AbortController();
        fetchSupplyRecipe(token, supplyId, "gestion", controller.signal)
            .then(({ recipe }) =>
                setForm({
                    name: recipe.name,
                    unit: recipe.unit,
                    yieldQuantity: recipe.yieldQuantity ?? "",
                    minStock: recipe.minStock,
                    shelfLifeDays: recipe.shelfLifeDays ? String(recipe.shelfLifeDays) : "",
                    ingredients: recipe.ingredients,
                })
            )
            .catch((requestError) => {
                if (!controller.signal.aborted)
                    setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar el elaborado.");
            })
            .finally(() => setIsLoading(false));
        return () => controller.abort();
    }, [token, supplyId]);

    const update = (next: Partial<IElaboradoForm>) => {
        setForm((current) => ({ ...current, ...next }));
        setError("");
    };

    // Solo insumos comprados: un elaborado no lleva otro elaborado ni lo que sale de un lote del menú
    const ingredientOptions = supplies.filter((supply) => !isIntermediate(supply) && supply.inventoryType !== "PREPARED_PRODUCT");
    const unitLabel = getIntermediateUnitLabel(form.unit);

    return (
        <FullSheet title={isNew ? "Nuevo elaborado" : form.name || "Elaborado"} onClose={onClose}>
            {(close) =>
                isLoading ? (
                    <p className="ges-empty">Cargando…</p>
                ) : (
                    <form
                        className="ges-rec-sheet"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const input = getInput(form);
                            if (typeof input === "string") return setError(input);
                            setBusy(true);
                            void (supplyId === null
                                ? createIntermediate(token, input, "gestion")
                                : saveSupplyRecipe(token, supplyId, input, "gestion")
                            )
                                .then(async () => {
                                    await onSaved();
                                    close();
                                })
                                .catch((requestError) =>
                                    setError(requestError instanceof HttpError ? requestError.message : "No pudimos guardar el elaborado.")
                                )
                                .finally(() => setBusy(false));
                        }}
                    >
                        <label className="ges-field ges-field--sm">
                            <span>Nombre</span>
                            <input
                                value={form.name}
                                placeholder="Ganache de chocolate"
                                maxLength={80}
                                onChange={(event) => update({ name: event.target.value })}
                            />
                        </label>
                        <div className="ges-rec-head">
                            <label className="ges-field ges-field--sm">
                                <span>Se mide en</span>
                                {isNew ? (
                                    <select value={form.unit} onChange={(event) => update({ unit: event.target.value })}>
                                        {INTERMEDIATE_UNITS.map((unit) => (
                                            <option key={unit} value={unit}>
                                                {getIntermediateUnitLabel(unit)}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <p className="ges-rec-static">{unitLabel}</p>
                                )}
                            </label>
                            <label className="ges-field ges-field--sm">
                                <span>Rinde por tanda ({unitLabel})</span>
                                <input
                                    inputMode="decimal"
                                    value={form.yieldQuantity}
                                    placeholder="550"
                                    onChange={(event) => update({ yieldQuantity: decimalInput(event.target.value) })}
                                />
                            </label>
                            <label className="ges-field ges-field--sm">
                                <span>Mínimo ({unitLabel})</span>
                                <input
                                    inputMode="decimal"
                                    value={form.minStock}
                                    onChange={(event) => update({ minStock: decimalInput(event.target.value) })}
                                />
                            </label>
                            <label className="ges-field ges-field--sm">
                                <span>Dura (días)</span>
                                <input
                                    inputMode="numeric"
                                    value={form.shelfLifeDays}
                                    placeholder="No vence"
                                    onChange={(event) => update({ shelfLifeDays: event.target.value.replace(/\D/g, "") })}
                                />
                            </label>
                        </div>
                        {isNew ? null : (
                            <p className="ropt-hint">La unidad no cambia: la receta y el historial dependen de ella.</p>
                        )}

                        <h3 className="ges-avail-group__title">Ingredientes de 1 tanda</h3>
                        {form.ingredients.length === 0 ? (
                            <p className="ropt-hint">Agrega lo que gasta una tanda. Solo se pueden usar insumos comprados.</p>
                        ) : null}
                        <RecipeIngredients
                            ingredients={form.ingredients}
                            supplies={ingredientOptions}
                            onChange={(ingredients) => update({ ingredients })}
                        />

                        {error ? (
                            <p className="ges-error" role="alert">
                                {error}
                            </p>
                        ) : null}
                        <div className="ges-rec-acts">
                            <button type="submit" className="ges-btn ges-btn--solid" disabled={busy}>
                                {busy ? "Guardando…" : isNew ? "Crear elaborado" : "Guardar cambios"}
                            </button>
                        </div>
                    </form>
                )
            }
        </FullSheet>
    );
};
