import { useMemo, useState } from "react";

import {
    HttpError,
    formatPrice,
    getItemCost,
    getPastryIngredientMap,
    isIngredientItem,
    updatePastryIngredient,
} from "@/helpers";
import type { IPastryIngredient, IPastryItem } from "@/helpers";

import { FullSheet } from "./full-sheet";
import { DecimalInput } from "./pastry-fields";

import "./pastry.css";

interface IPastryItemsProps {
    token: string;
    items: IPastryItem[];
    /** Todos, también los archivados: una receta vieja puede seguir usándolos. */
    ingredients: IPastryIngredient[];
    onChange: (items: IPastryItem[]) => void;
    /** Cuando se actualiza un costo aquí mismo, el registro compartido ya cambió. */
    onIngredientSaved: (ingredient: IPastryIngredient) => void;
    onSessionExpired: () => void;
}

interface ICostEditorProps {
    token: string;
    ingredient: IPastryIngredient;
    onSaved: (ingredient: IPastryIngredient) => void;
    onClose: () => void;
    onSessionExpired: () => void;
}

/** "✎" de cada ingrediente: cambia cuánto cuesta el paquete en el registro compartido. */
const CostEditor = ({ token, ingredient, onSaved, onClose, onSessionExpired }: ICostEditorProps) => {
    const [cost, setCost] = useState(ingredient.packageCost);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const save = async () => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            const saved = await updatePastryIngredient(token, ingredient.id, {
                name: ingredient.name,
                unit: ingredient.unit,
                packageQty: ingredient.packageQty,
                packageCost: cost,
            });
            onSaved(saved);
            onClose();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) {
                onSessionExpired();
                return;
            }
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos actualizar el costo.");
            setBusy(false);
        }
    };

    return (
        <span className="pa-cost-edit">
            <span>$</span>
            <DecimalInput value={cost} aria-label={`Costo de ${ingredient.name}`} autoFocus onChange={setCost} />
            <span>
                por {ingredient.packageQty} {ingredient.unit}
            </span>
            <button type="button" className="pa-btn pa-btn--solid pa-btn--small" disabled={busy || cost < 0} onClick={() => void save()}>
                {busy ? "Guardando…" : "Actualizar"}
            </button>
            <button type="button" className="pa-btn pa-btn--small" disabled={busy} onClick={onClose}>
                Cancelar
            </button>
            {error ? <span className="pa-line__missing" role="alert">{error}</span> : null}
        </span>
    );
};

interface IPickSheetProps {
    ingredients: IPastryIngredient[];
    onPick: (ingredient: IPastryIngredient) => void;
    onClose: () => void;
}

/** Elegir de los ingredientes registrados (los archivados no salen). */
const PickIngredientSheet = ({ ingredients, onPick, onClose }: IPickSheetProps) => {
    const [search, setSearch] = useState("");
    const visible = ingredients.filter((one) => one.name.toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <FullSheet title="Agregar ingrediente" onClose={onClose}>
            {(close) => (
                <div className="pa pa-sheet">
                    <input
                        className="pa-input"
                        type="search"
                        placeholder="Buscar ingrediente"
                        aria-label="Buscar ingrediente"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    {visible.length ? (
                        <div className="pa-picks">
                            {visible.map((one) => (
                                <button key={one.id} type="button" className="pa-pick" onClick={() => close(() => onPick(one))}>
                                    <b>{one.name}</b>
                                    <small>
                                        {formatPrice(one.packageCost)} por {one.packageQty} {one.unit}
                                    </small>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="pa-empty">
                            {ingredients.length ? "Ningún ingrediente se llama así." : "No hay más ingredientes. Agrégalos en la pestaña Ingredientes."}
                        </p>
                    )}
                </div>
            )}
        </FullSheet>
    );
};

interface IFixedSheetProps {
    onAdd: (label: string, fixedCost: number) => void;
    onClose: () => void;
}

/** Un costo que no es un ingrediente: el empaque, la caja, el recargo de una masa. */
const FixedCostSheet = ({ onAdd, onClose }: IFixedSheetProps) => {
    const [label, setLabel] = useState("");
    const [cost, setCost] = useState(0);

    return (
        <FullSheet title="Otro costo" onClose={onClose}>
            {(close) => (
                <form
                    className="pa pa-sheet"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (label.trim()) close(() => onAdd(label.trim(), cost));
                    }}
                >
                    <label className="pa-field">
                        Qué es
                        <input
                            className="pa-input"
                            value={label}
                            maxLength={80}
                            placeholder="Empaque"
                            autoComplete="off"
                            onChange={(event) => setLabel(event.target.value)}
                        />
                    </label>
                    <label className="pa-field">
                        Cuánto cuesta ($)
                        <DecimalInput value={cost} onChange={setCost} />
                    </label>
                    <p className="pa-muted">Es un costo fijo del tamaño base: en los otros tamaños se escala igual que el resto.</p>
                    <button type="submit" className="pa-btn pa-btn--solid" disabled={!label.trim()}>
                        Agregar
                    </button>
                </form>
            )}
        </FullSheet>
    );
};

/** La lista de ingredientes y costos de una receta (la base o la de una opción). */
export const PastryItems = ({ token, items, ingredients, onChange, onIngredientSaved, onSessionExpired }: IPastryItemsProps) => {
    const [costOf, setCostOf] = useState<number | null>(null);
    const [sheet, setSheet] = useState<"ingredient" | "fixed" | null>(null);

    const byId = useMemo(() => getPastryIngredientMap(ingredients), [ingredients]);
    const lookup = useMemo(() => new Map(ingredients.map((one) => [one.id, one])), [ingredients]);
    const usedIds = new Set(items.filter(isIngredientItem).map((one) => one.ingredientId));
    const available = ingredients.filter((one) => !one.archived && !usedIds.has(one.id));

    const setItem = (index: number, item: IPastryItem) => onChange(items.map((one, at) => (at === index ? item : one)));
    const removeItem = (index: number) => onChange(items.filter((_, at) => at !== index));

    return (
        <>
            <div>
                {items.map((item, index) => {
                    if (!isIngredientItem(item)) {
                        return (
                            <div className="pa-line" key={`fixed-${index}`}>
                                <div className="pa-line__top">
                                    <b className="is-fixed">{item.label}</b>
                                    <span className="pa-money">{formatPrice(item.fixedCost)}</span>
                                </div>
                                <div className="pa-line__bot">
                                    <span>$</span>
                                    <DecimalInput
                                        value={item.fixedCost}
                                        aria-label={`Costo de ${item.label}`}
                                        onChange={(fixedCost) => setItem(index, { ...item, fixedCost })}
                                    />
                                    <span>Costo fijo, escala con el tamaño</span>
                                    <button type="button" className="pa-link" onClick={() => removeItem(index)}>
                                        Quitar
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    const ingredient = lookup.get(item.ingredientId);
                    return (
                        <div className="pa-line" key={`ing-${item.ingredientId}`}>
                            <div className="pa-line__top">
                                <b>{ingredient?.name ?? "Ingrediente borrado"}</b>
                                <span className="pa-money">{formatPrice(getItemCost(item, byId))}</span>
                            </div>
                            {ingredient ? (
                                <div className="pa-line__bot">
                                    <DecimalInput
                                        value={item.qty}
                                        aria-label={`Cantidad de ${ingredient.name}`}
                                        onChange={(qty) => setItem(index, { ...item, qty })}
                                    />
                                    <span>{ingredient.unit}</span>
                                    {costOf === ingredient.id ? (
                                        <CostEditor
                                            token={token}
                                            ingredient={ingredient}
                                            onSaved={onIngredientSaved}
                                            onClose={() => setCostOf(null)}
                                            onSessionExpired={onSessionExpired}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            className="pa-cost-btn"
                                            title="Actualizar costo"
                                            onClick={() => setCostOf(ingredient.id)}
                                        >
                                            {formatPrice(ingredient.packageCost)} por {ingredient.packageQty} {ingredient.unit} ✎
                                        </button>
                                    )}
                                    <button type="button" className="pa-link" onClick={() => removeItem(index)}>
                                        Quitar
                                    </button>
                                </div>
                            ) : (
                                <div className="pa-line__bot">
                                    <span className="pa-line__missing">Ya no existe: quítalo para poder guardar.</span>
                                    <button type="button" className="pa-link" onClick={() => removeItem(index)}>
                                        Quitar
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {!items.length ? <p className="pa-muted">Todavía no lleva nada.</p> : null}
            </div>

            <div className="pa-actions">
                <button type="button" className="pa-btn pa-btn--small" onClick={() => setSheet("ingredient")}>
                    + Ingrediente
                </button>
                <button type="button" className="pa-btn pa-btn--small" onClick={() => setSheet("fixed")}>
                    + Otro costo
                </button>
            </div>

            {sheet === "ingredient" ? (
                <PickIngredientSheet
                    ingredients={available}
                    onPick={(ingredient) => onChange([...items, { ingredientId: ingredient.id, qty: 0 }])}
                    onClose={() => setSheet(null)}
                />
            ) : null}
            {sheet === "fixed" ? (
                <FixedCostSheet onAdd={(label, fixedCost) => onChange([...items, { label, fixedCost }])} onClose={() => setSheet(null)} />
            ) : null}
        </>
    );
};
