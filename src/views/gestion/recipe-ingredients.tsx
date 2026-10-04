import { SUPPLY_CATEGORY_LABEL } from "@/helpers";
import type { ISupplyStatus } from "@/helpers";
import { compatibleUnits, isIntermediate } from "@/helpers/inventory";

export interface IRecipeIngredient {
    inventoryItemId: number;
    name?: string;
    quantity: string;
    unit: string;
    baseUnit?: string;
}

interface IRecipeIngredientsProps<T extends IRecipeIngredient> {
    ingredients: T[];
    /** Lo que se puede agregar. Los elaborados salen en su propio grupo. */
    supplies: ISupplyStatus[];
    onChange: (ingredients: T[]) => void;
}

/** Filas de ingredientes (cantidad y unidad compatible) y el selector para agregar otro. Lo usan productos y elaborados. */
export const RecipeIngredients = <T extends IRecipeIngredient>({ ingredients, supplies, onChange }: IRecipeIngredientsProps<T>) => {
    const supplyOf = (id: number) => supplies.find((supply) => supply.id === id);
    const update = (index: number, next: Partial<IRecipeIngredient>) =>
        onChange(ingredients.map((entry, n) => (n === index ? { ...entry, ...next } : entry)));

    const addable = supplies.filter((supply) => !ingredients.some((entry) => entry.inventoryItemId === supply.id));
    const bought = addable.filter((supply) => !isIntermediate(supply));
    const elaborados = addable.filter(isIntermediate);
    const categories = [...new Set(bought.map((supply) => supply.category))];

    return (
        <>
            {ingredients.length ? (
                <ul className="ges-rec-ings">
                    {ingredients.map((ingredient, index) => {
                        const supply = supplyOf(ingredient.inventoryItemId);
                        const name = ingredient.name ?? supply?.name ?? "Insumo";
                        const baseUnit = ingredient.baseUnit ?? supply?.unit ?? ingredient.unit;
                        return (
                            <li key={ingredient.inventoryItemId} className="ges-rec-ing">
                                <b>
                                    {name}
                                    {supply && isIntermediate(supply) ? <small className="ges-elab-tag">Elaborado</small> : null}
                                </b>
                                <label className="ges-field ges-field--sm ges-rec-ing__qty">
                                    <span className="ges-sr-only">Cantidad de {name}</span>
                                    <input
                                        inputMode="decimal"
                                        value={ingredient.quantity}
                                        onChange={(event) => update(index, { quantity: event.target.value.replace(",", ".") })}
                                    />
                                </label>
                                <label className="ges-field ges-field--sm ges-rec-ing__unit">
                                    <span className="ges-sr-only">Unidad de {name}</span>
                                    <select value={ingredient.unit} onChange={(event) => update(index, { unit: event.target.value })}>
                                        {compatibleUnits(baseUnit).map((unit) => (
                                            <option key={unit} value={unit}>
                                                {unit === "unit" ? "u" : unit}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    className="ropt-remove"
                                    aria-label={`Quitar ${name}`}
                                    onClick={() => onChange(ingredients.filter((_, n) => n !== index))}
                                >
                                    ×
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
            {ingredients.some((entry) => ["u", "unit"].includes(entry.baseUnit ?? entry.unit)) ? (
                <p className="ropt-hint">
                    Lo que se mide en u solo acepta u. Si la receta lo usa en ml o g (ej. leche en cartón), el admin lo cambia en el
                    tablero: Inventario → Editar insumo → Cambiar a ml o g.
                </p>
            ) : null}
            <label className="ges-field ges-field--sm">
                <span className="ges-sr-only">Agregar ingrediente</span>
                <select
                    value=""
                    onChange={(event) => {
                        const supply = supplyOf(Number(event.target.value));
                        if (supply)
                            onChange([
                                ...ingredients,
                                { inventoryItemId: supply.id, name: supply.name, quantity: "1", unit: supply.unit, baseUnit: supply.unit } as T,
                            ]);
                    }}
                >
                    <option value="">+ Agregar ingrediente</option>
                    {categories.map((category) => (
                        <optgroup key={category} label={SUPPLY_CATEGORY_LABEL[category]}>
                            {bought
                                .filter((supply) => supply.category === category)
                                .map((supply) => (
                                    <option key={supply.id} value={supply.id}>
                                        {supply.name} · {supply.unit}
                                    </option>
                                ))}
                        </optgroup>
                    ))}
                    {elaborados.length ? (
                        <optgroup label="Elaborados">
                            {elaborados.map((supply) => (
                                <option key={supply.id} value={supply.id}>
                                    {supply.name} · {supply.unit}
                                </option>
                            ))}
                        </optgroup>
                    ) : null}
                </select>
            </label>
        </>
    );
};
