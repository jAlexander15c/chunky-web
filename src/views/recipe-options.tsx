import { useState } from "react";

import { HttpError } from "@/helpers/getHttp";
import { compatibleUnits, saveOptionRules } from "@/helpers/inventory";
import type { IOptionRule, IOptionRuleInput } from "@/helpers/inventory";
import type { IModifier, IModifierOption } from "@/helpers/modifiers";

import "./recipe-options.css";

/** Lo mínimo de un insumo que necesitan las reglas. */
export interface IRuleSupply {
    id: number;
    name: string;
    unit: string;
}

type RuleMode = "none" | "add" | "swap";

interface IAddRow {
    supplyId: number | "";
    quantity: string;
    unit: string;
}

interface ISwapRow {
    replacesSupplyId: number | "";
    supplyId: number | "";
    /** Vacía = la misma cantidad de cada receta. */
    quantity: string;
    unit: string;
}

const getRuleMode = (rules: IOptionRule[]): RuleMode =>
    rules.length === 0 ? "none" : rules.some((rule) => rule.replacesSupplyId !== null) ? "swap" : "add";

/** "Leche entera → Leche de almendra, misma cantidad" o "18 g Café en grano". */
const getRuleSummary = (rule: IOptionRule) =>
    rule.replacesSupplyId !== null
        ? `${rule.replacesName ?? "Insumo"} → ${rule.name}, ${rule.quantity ? `${rule.quantity} ${rule.unit}` : "misma cantidad"}`
        : `${rule.quantity} ${rule.unit} ${rule.name}`;

interface IOptionRuleModalProps {
    token: string;
    scope: "admin" | "gestion";
    modifier: IModifier;
    option: IModifierOption;
    rules: IOptionRule[];
    supplies: IRuleSupply[];
    /** Los insumos de la receta abierta van primero en "Quita de la receta". */
    recipeSupplyIds: number[];
    onSaved: (rules: IOptionRule[]) => void;
    onClose: () => void;
}

const OptionRuleModal = ({
    token,
    scope,
    modifier,
    option,
    rules,
    supplies,
    recipeSupplyIds,
    onSaved,
    onClose,
}: IOptionRuleModalProps) => {
    const swapRule = rules.find((rule) => rule.replacesSupplyId !== null);
    const [mode, setMode] = useState<RuleMode>(getRuleMode(rules));
    const [adds, setAdds] = useState<IAddRow[]>(() => {
        const existing = rules.filter((rule) => rule.replacesSupplyId === null);
        return existing.length
            ? existing.map((rule) => ({ supplyId: rule.supplyId, quantity: rule.quantity ?? "", unit: rule.unit }))
            : [{ supplyId: "", quantity: "", unit: "" }];
    });
    const [swap, setSwap] = useState<ISwapRow>({
        replacesSupplyId: swapRule?.replacesSupplyId ?? "",
        supplyId: swapRule?.supplyId ?? "",
        quantity: swapRule?.quantity ?? "",
        unit: swapRule?.unit ?? "",
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const supplyById = (id: number | "") => supplies.find((supply) => supply.id === id);
    const inRecipe = supplies.filter((supply) => recipeSupplyIds.includes(supply.id));
    const others = supplies.filter((supply) => !recipeSupplyIds.includes(supply.id));

    const supplyOptions = () => (
        <>
            {inRecipe.length ? (
                <optgroup label="En esta receta">
                    {inRecipe
                        .map((supply) => (
                            <option key={supply.id} value={supply.id}>
                                {supply.name} · {supply.unit}
                            </option>
                        ))}
                </optgroup>
            ) : null}
            <optgroup label="Otros insumos">
                {others
                    .map((supply) => (
                        <option key={supply.id} value={supply.id}>
                            {supply.name} · {supply.unit}
                        </option>
                    ))}
            </optgroup>
        </>
    );

    const getInputs = (): IOptionRuleInput[] => {
        if (mode === "none") return [];
        if (mode === "swap") {
            if (!swap.replacesSupplyId || !swap.supplyId) throw new Error("Elige qué insumo sale y cuál entra.");
            return [
                {
                    supplyId: swap.supplyId,
                    replacesSupplyId: swap.replacesSupplyId,
                    quantity: swap.quantity.trim() || null,
                    unit: swap.unit || supplyById(swap.supplyId)?.unit,
                },
            ];
        }
        const rows = adds.filter((row) => row.supplyId !== "");
        if (!rows.length) throw new Error("Elige al menos un insumo para sumar.");
        if (rows.some((row) => !row.quantity.trim())) throw new Error("Indica cuánto suma cada insumo.");
        return rows.map((row) => ({
            supplyId: row.supplyId as number,
            quantity: row.quantity.trim(),
            unit: row.unit || supplyById(row.supplyId)?.unit,
        }));
    };

    const save = async () => {
        setError("");
        let inputs: IOptionRuleInput[];
        try {
            inputs = getInputs();
        } catch (validation) {
            setError((validation as Error).message);
            return;
        }
        setBusy(true);
        try {
            const result = await saveOptionRules(token, scope, option.id, inputs);
            onSaved(result.rules);
            onClose();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos guardar la opción.");
        } finally {
            setBusy(false);
        }
    };

    const swapTarget = supplyById(swap.supplyId);

    return (
        <div className="ropt-modal" role="dialog" aria-modal="true" aria-label={`${modifier.name} · ${option.name}`}>
            <div className="ropt-modal__panel">
                <h3>
                    {modifier.name} · {option.name}
                </h3>
                <div className="ropt-seg" role="radiogroup" aria-label="Qué hace esta opción">
                    {(
                        [
                            ["none", "Nada"],
                            ["add", "Suma"],
                            ["swap", "Cambia"],
                        ] as [RuleMode, string][]
                    ).map(([id, label]) => (
                        <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)}>
                            {label}
                        </button>
                    ))}
                </div>

                {mode === "none" ? (
                    <p className="ropt-hint">Esta opción no cambia la receta. Se vende sin descontar nada extra.</p>
                ) : null}

                {mode === "add" ? (
                    <div className="ropt-rows">
                        {adds.map((row, index) => {
                            const supply = supplyById(row.supplyId);
                            const update = (next: Partial<IAddRow>) =>
                                setAdds((current) => current.map((entry, n) => (n === index ? { ...entry, ...next } : entry)));
                            return (
                                <div key={index} className="ropt-row">
                                    <label className="ropt-field ropt-field--grow">
                                        <span>Insumo</span>
                                        <select
                                            value={row.supplyId}
                                            onChange={(event) => {
                                                const id = Number(event.target.value) || "";
                                                update({ supplyId: id, unit: supplyById(id)?.unit ?? "" });
                                            }}
                                        >
                                            <option value="">Elegir…</option>
                                            {supplyOptions()}
                                        </select>
                                    </label>
                                    <label className="ropt-field ropt-field--qty">
                                        <span>Cantidad</span>
                                        <input
                                            inputMode="decimal"
                                            value={row.quantity}
                                            placeholder="18"
                                            onChange={(event) => update({ quantity: event.target.value.replace(",", ".") })}
                                        />
                                    </label>
                                    <label className="ropt-field ropt-field--unit">
                                        <span>Unidad</span>
                                        <select value={row.unit} disabled={!supply} onChange={(event) => update({ unit: event.target.value })}>
                                            {supply ? compatibleUnits(supply.unit).map((unit) => <option key={unit} value={unit}>{unit === "unit" ? "u" : unit}</option>) : <option>—</option>}
                                        </select>
                                    </label>
                                    {adds.length > 1 ? (
                                        <button
                                            type="button"
                                            className="ropt-remove"
                                            aria-label="Quitar este insumo"
                                            onClick={() => setAdds((current) => current.filter((_, n) => n !== index))}
                                        >
                                            ×
                                        </button>
                                    ) : null}
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            className="ropt-add"
                            onClick={() => setAdds((current) => [...current, { supplyId: "", quantity: "", unit: "" }])}
                        >
                            + Sumar otro insumo
                        </button>
                    </div>
                ) : null}

                {mode === "swap" ? (
                    <div className="ropt-rows">
                        <label className="ropt-field">
                            <span>Quita de la receta</span>
                            <select
                                value={swap.replacesSupplyId}
                                onChange={(event) => setSwap({ ...swap, replacesSupplyId: Number(event.target.value) || "" })}
                            >
                                <option value="">Elegir…</option>
                                {supplyOptions()}
                            </select>
                        </label>
                        <label className="ropt-field">
                            <span>Pone en su lugar</span>
                            <select
                                value={swap.supplyId}
                                onChange={(event) => {
                                    const id = Number(event.target.value) || "";
                                    setSwap({ ...swap, supplyId: id, unit: supplyById(id)?.unit ?? "" });
                                }}
                            >
                                <option value="">Elegir…</option>
                                {supplyOptions()}
                            </select>
                        </label>
                        <div className="ropt-row">
                            <label className="ropt-field ropt-field--grow">
                                <span>Cantidad</span>
                                <input
                                    inputMode="decimal"
                                    value={swap.quantity}
                                    placeholder="La misma de cada receta"
                                    onChange={(event) => setSwap({ ...swap, quantity: event.target.value.replace(",", ".") })}
                                />
                            </label>
                            {swap.quantity.trim() && swapTarget ? (
                                <label className="ropt-field ropt-field--unit">
                                    <span>Unidad</span>
                                    <select value={swap.unit} onChange={(event) => setSwap({ ...swap, unit: event.target.value })}>
                                        {compatibleUnits(swapTarget.unit).map((unit) => (
                                            <option key={unit} value={unit}>{unit === "unit" ? "u" : unit}</option>
                                        ))}
                                    </select>
                                </label>
                            ) : null}
                        </div>
                        <p className="ropt-hint">
                            Elige el mismo insumo en ambos campos para cambiar solo su cantidad. La cantidad indicada reemplaza la de la receta.
                            Vacía, conserva la misma cantidad que trae cada receta. Si un producto no lleva el insumo que se quita,
                            esta opción no descuenta nada en ese producto.
                        </p>
                    </div>
                ) : null}

                {error ? (
                    <p className="ropt-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <div className="ropt-modal__acts">
                    <button type="button" className="ropt-btn" disabled={busy} onClick={onClose}>
                        Cancelar
                    </button>
                    <button type="button" className="ropt-btn ropt-btn--solid" disabled={busy} onClick={() => void save()}>
                        {busy ? "Guardando…" : "Guardar opción"}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface IRecipeOptionsProps {
    token: string;
    scope: "admin" | "gestion";
    /** Los modificadores del producto, en el orden de Loyverse. */
    modifiers: IModifier[];
    /** Por modificador, los productos que lo usan: la regla aplica en todos. */
    usedBy?: Record<string, string[]>;
    supplies: IRuleSupply[];
    recipeSupplyIds: number[];
    rules: IOptionRule[];
    /** Las reglas nuevas de esa opción, ya guardadas. */
    onRulesSaved: (optionId: string, rules: IOptionRule[]) => void;
    /** Por lotes: la receta base ya se gastó al producir, solo cuentan las sumas. */
    isBatch?: boolean;
}

/** La sección "Opciones" del editor de recetas: qué hace cada opción de los modificadores del producto. */
export const RecipeOptions = ({
    token,
    scope,
    modifiers,
    usedBy,
    supplies,
    recipeSupplyIds,
    rules,
    onRulesSaved,
    isBatch = false,
}: IRecipeOptionsProps) => {
    const [editing, setEditing] = useState<{ modifier: IModifier; option: IModifierOption } | null>(null);

    if (!modifiers.length)
        return <p className="ropt-hint">Este producto no tiene modificadores en Loyverse. Se vende solo con su receta.</p>;

    return (
        <div className="ropt">
            {isBatch ? (
                <p className="ropt-hint">
                    Se prepara por lotes: la receta ya se gastó al producir. Aquí solo cuentan las opciones que suman, como
                    un topping extra.
                </p>
            ) : null}
            {modifiers.map((modifier) => {
                const products = usedBy?.[modifier.id] ?? [];
                return (
                    <section key={modifier.id} className="ropt-mod">
                        <h4>{modifier.name}</h4>
                        {products.length > 1 ? (
                            <p className="ropt-mod__note">Aplica en todos los productos con este modificador: {products.join(", ")}.</p>
                        ) : null}
                        <ul className="ropt-list">
                            {modifier.options.map((option) => {
                                const optionRules = rules.filter((rule) => rule.optionId === option.id);
                                return (
                                    <li key={option.id} className="ropt-opt">
                                        <div className="ropt-opt__body">
                                            <b>{option.name}</b>
                                            <div className="ropt-opt__rules">
                                                {optionRules.length === 0 ? <span className="ropt-chip">Sin cambios</span> : null}
                                                {optionRules.map((rule) => (
                                                    <span key={rule.supplyId} className="ropt-opt__rule">
                                                        <span className={`ropt-chip ${rule.replacesSupplyId !== null ? "is-swap" : "is-add"}`}>
                                                            {rule.replacesSupplyId !== null ? "Cambia" : "Suma"}
                                                        </span>
                                                        {getRuleSummary(rule)}
                                                    </span>
                                                ))}
                                                {option.isOutOfStock ? <span className="ropt-chip is-out">Agotada</span> : null}
                                            </div>
                                        </div>
                                        <button type="button" className="ropt-edit" onClick={() => setEditing({ modifier, option })}>
                                            Editar
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
            {editing ? (
                <OptionRuleModal
                    token={token}
                    scope={scope}
                    modifier={editing.modifier}
                    option={editing.option}
                    rules={rules.filter((rule) => rule.optionId === editing.option.id)}
                    supplies={supplies}
                    recipeSupplyIds={recipeSupplyIds}
                    onSaved={(saved) => onRulesSaved(editing.option.id, saved)}
                    onClose={() => setEditing(null)}
                />
            ) : null}
        </div>
    );
};
