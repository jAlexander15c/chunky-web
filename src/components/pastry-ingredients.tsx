import { useCallback, useEffect, useMemo, useState } from "react";

import {
    HttpError,
    PASTRY_UNITS,
    archivePastryIngredient,
    createPastryIngredient,
    deletePastryIngredient,
    fetchPastryIngredients,
    formatPastryAge,
    formatPrice,
    formatUnitCost,
    updatePastryIngredient,
} from "@/helpers";
import type { IPastryIngredient, IPastryIngredientInput, PastryUnit } from "@/helpers";

import { FullSheet } from "./full-sheet";
import { DecimalInput } from "./pastry-fields";

import "./pastry.css";

interface IPastryIngredientsProps {
    token: string;
    onSessionExpired: () => void;
}

const BLANK: IPastryIngredientInput = { name: "", unit: "g", packageQty: 0, packageCost: 0 };

interface IIngredientSheetProps {
    token: string;
    /** Sin ingrediente se crea uno nuevo. */
    ingredient: IPastryIngredient | null;
    onChanged: () => Promise<void> | void;
    onClose: () => void;
    onSessionExpired: () => void;
}

/** Crear o editar un ingrediente: cuánto viene en el paquete y cuánto cuesta. */
const IngredientSheet = ({ token, ingredient, onChanged, onClose, onSessionExpired }: IIngredientSheetProps) => {
    const [form, setForm] = useState<IPastryIngredientInput>(
        ingredient
            ? { name: ingredient.name, unit: ingredient.unit, packageQty: ingredient.packageQty, packageCost: ingredient.packageCost }
            : BLANK
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const isValid = form.name.trim().length >= 2 && form.packageQty > 0 && form.packageCost >= 0;
    const unitLabel = form.unit === "u" ? "unidad" : form.unit;

    const run = async (action: () => Promise<unknown>, close: (after?: () => void) => void) => {
        setBusy(true);
        setError("");
        try {
            await action();
            close(() => void onChanged());
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) {
                onSessionExpired();
                return;
            }
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos guardar el ingrediente.");
            setBusy(false);
        }
    };

    return (
        <FullSheet title={ingredient ? "Editar ingrediente" : "Nuevo ingrediente"} onClose={onClose}>
            {(close) => (
                <form
                    className="pa pa-sheet"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!isValid || busy) return;
                        const input = { ...form, name: form.name.trim() };
                        void run(
                            () => (ingredient ? updatePastryIngredient(token, ingredient.id, input) : createPastryIngredient(token, input)),
                            close
                        );
                    }}
                >
                    <label className="pa-field">
                        Nombre
                        <input
                            className="pa-input"
                            value={form.name}
                            maxLength={80}
                            autoComplete="off"
                            placeholder="Queso crema"
                            onChange={(event) => setForm({ ...form, name: event.target.value })}
                        />
                    </label>
                    <div className="pa-split">
                        <label className="pa-field">
                            Viene en (cantidad)
                            <DecimalInput value={form.packageQty} onChange={(packageQty) => setForm({ ...form, packageQty })} />
                        </label>
                        <label className="pa-field">
                            Unidad
                            <select
                                className="pa-input"
                                value={form.unit}
                                onChange={(event) => setForm({ ...form, unit: event.target.value as PastryUnit })}
                            >
                                {PASTRY_UNITS.map((unit) => (
                                    <option key={unit.id} value={unit.id}>
                                        {unit.id}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <label className="pa-field">
                        Y cuesta ($)
                        <DecimalInput value={form.packageCost} onChange={(packageCost) => setForm({ ...form, packageCost })} />
                    </label>

                    <p className="pa-hint" aria-live="polite">
                        {form.packageQty > 0
                            ? `Te sale a $${(form.packageCost / form.packageQty).toFixed(4)} por ${unitLabel}`
                            : "Escribe cuánto viene"}
                    </p>

                    {ingredient ? (
                        <p className="pa-muted">
                            {ingredient.usedIn === 0
                                ? "Todavía no se usa en ninguna receta."
                                : `Se usa en ${ingredient.usedIn} receta${ingredient.usedIn === 1 ? "" : "s"}. Si cambias el costo, sus precios se actualizan.`}
                        </p>
                    ) : null}

                    {error ? <p className="pa-error" role="alert">{error}</p> : null}

                    <div className="pa-actions">
                        <button type="submit" className="pa-btn pa-btn--solid" disabled={!isValid || busy}>
                            {busy ? "Guardando…" : "Guardar"}
                        </button>
                        {ingredient ? (
                            <button
                                type="button"
                                className="pa-btn"
                                disabled={busy}
                                onClick={() => void run(() => archivePastryIngredient(token, ingredient.id, !ingredient.archived), close)}
                            >
                                {ingredient.archived ? "Restaurar" : "Archivar"}
                            </button>
                        ) : null}
                        {ingredient && ingredient.usedIn === 0 ? (
                            <button
                                type="button"
                                className="pa-btn pa-btn--danger"
                                disabled={busy}
                                onClick={() => void run(() => deletePastryIngredient(token, ingredient.id), close)}
                            >
                                Borrar
                            </button>
                        ) : null}
                    </div>
                    {ingredient && ingredient.usedIn > 0 ? (
                        <p className="pa-muted">Un ingrediente que se usa en recetas no se borra: se archiva y deja de salir al agregar.</p>
                    ) : null}
                </form>
            )}
        </FullSheet>
    );
};

type IngredientView = "activos" | "archivados";

/** Lo que pagas por cada ingrediente. No es inventario: solo sirve para costear las recetas. */
export const PastryIngredients = ({ token, onSessionExpired }: IPastryIngredientsProps) => {
    const [ingredients, setIngredients] = useState<IPastryIngredient[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [view, setView] = useState<IngredientView>("activos");
    const [editing, setEditing] = useState<IPastryIngredient | "new" | null>(null);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                setIngredients(await fetchPastryIngredients(token, true, signal));
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) {
                    onSessionExpired();
                    return;
                }
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar los ingredientes.");
            } finally {
                if (!signal?.aborted) setIsLoading(false);
            }
        },
        [token, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const closeSheet = useCallback(() => setEditing(null), []);

    const archivedCount = ingredients.filter((one) => one.archived).length;
    const visible = useMemo(() => {
        const query = search.trim().toLowerCase();
        return ingredients.filter((one) => one.archived === (view === "archivados") && one.name.toLowerCase().includes(query));
    }, [ingredients, search, view]);

    return (
        <div className="pa">
            <div className="pa-head">
                <div>
                    <h2 className="pa-title script">Ingredientes</h2>
                    <p className="pa-sub">Lo que pagas por cada cosa. No es inventario: solo sirve para costear recetas.</p>
                </div>
                <button type="button" className="pa-btn pa-btn--solid" onClick={() => setEditing("new")}>
                    + Agregar
                </button>
            </div>

            <input
                className="pa-input"
                style={{ maxWidth: "22rem" }}
                type="search"
                placeholder="Buscar ingrediente"
                aria-label="Buscar ingrediente"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
            />

            {archivedCount ? (
                <div className="pa-chips" role="group" aria-label="Ver">
                    <button type="button" className="pa-chip" aria-pressed={view === "activos"} onClick={() => setView("activos")}>
                        Activos
                    </button>
                    <button type="button" className="pa-chip" aria-pressed={view === "archivados"} onClick={() => setView("archivados")}>
                        Archivados ({archivedCount})
                    </button>
                </div>
            ) : null}

            {error ? <p className="pa-error" role="alert">{error}</p> : null}

            {isLoading ? (
                <div className="pa-grid" aria-busy="true">
                    <div className="pa-skeleton" />
                    <div className="pa-skeleton" />
                    <div className="pa-skeleton" />
                </div>
            ) : visible.length === 0 ? (
                <p className="pa-empty">
                    {search.trim()
                        ? "Ningún ingrediente se llama así."
                        : view === "archivados"
                          ? "No hay ingredientes archivados."
                          : "Todavía no hay ingredientes. Agrega el primero con “+ Agregar”."}
                </p>
            ) : (
                <div className="pa-grid">
                    {visible.map((one) => (
                        <button key={one.id} type="button" className="pa-card pa-card--button" onClick={() => setEditing(one)}>
                            <span className="pa-card__top">
                                <b>{one.name}</b>
                                <span className="pa-money">{formatPrice(one.packageCost)}</span>
                            </span>
                            <span className="pa-num">
                                por {one.packageQty} {one.unit} · {formatUnitCost(one)}
                            </span>
                            <span className="pa-muted">
                                {one.usedIn === 0 ? "Sin usar" : `En ${one.usedIn} receta${one.usedIn === 1 ? "" : "s"}`} · {formatPastryAge(one.updatedAt)}
                                {one.updatedBy ? ` · ${one.updatedBy}` : ""}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {editing ? (
                <IngredientSheet
                    key={editing === "new" ? "new" : editing.id}
                    token={token}
                    ingredient={editing === "new" ? null : editing}
                    onChanged={load}
                    onClose={closeSheet}
                    onSessionExpired={onSessionExpired}
                />
            ) : null}
        </div>
    );
};
