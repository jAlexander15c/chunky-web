import { useCallback, useEffect, useMemo, useState } from "react";

import { HttpError, fetchPastryProducts, formatPrice } from "@/helpers";
import type { IPastryProductSummary } from "@/helpers";

import { PastryRecipeEditor } from "./pastry-recipe-editor";

import "./pastry.css";

interface IPastryRecipesProps {
    token: string;
    onSessionExpired: () => void;
}

type RecipeFilter = "todas" | "web" | "borradores";

const FILTERS: { id: RecipeFilter; label: string }[] = [
    { id: "todas", label: "Todas" },
    { id: "web", label: "En la web" },
    { id: "borradores", label: "Borradores" },
];

/** Las recetas de postres: cada una publicada sale en el cotizador de la web. */
export const PastryRecipes = ({ token, onSessionExpired }: IPastryRecipesProps) => {
    const [products, setProducts] = useState<IPastryProductSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState<RecipeFilter>("todas");
    // null: la lista; "new": una receta nueva; un número: esa receta
    const [editing, setEditing] = useState<number | "new" | null>(null);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                setProducts(await fetchPastryProducts(token, signal));
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) {
                    onSessionExpired();
                    return;
                }
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar las recetas.");
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

    const tabs = useMemo(() => Array.from(new Set(products.map((one) => one.tab))), [products]);
    const visible = products.filter((one) => filter === "todas" || (filter === "web" ? one.active : !one.active));

    if (editing !== null) {
        return (
            <PastryRecipeEditor
                key={editing}
                token={token}
                productId={editing === "new" ? null : editing}
                tabs={tabs}
                onBack={() => setEditing(null)}
                onChanged={() => void load()}
                onSessionExpired={onSessionExpired}
            />
        );
    }

    return (
        <div className="pa">
            <div className="pa-head">
                <div>
                    <h2 className="pa-title script">Recetas</h2>
                    <p className="pa-sub">Cada receta publicada sale en el cotizador de la web.</p>
                </div>
                <button type="button" className="pa-btn pa-btn--solid" onClick={() => setEditing("new")}>
                    + Crear receta
                </button>
            </div>

            <div className="pa-chips" role="group" aria-label="Ver">
                {FILTERS.map((one) => (
                    <button key={one.id} type="button" className="pa-chip" aria-pressed={filter === one.id} onClick={() => setFilter(one.id)}>
                        {one.label}
                    </button>
                ))}
            </div>

            {error ? <p className="pa-error" role="alert">{error}</p> : null}

            {isLoading ? (
                <div className="pa-grid" aria-busy="true">
                    <div className="pa-skeleton" />
                    <div className="pa-skeleton" />
                    <div className="pa-skeleton" />
                </div>
            ) : visible.length === 0 ? (
                <p className="pa-empty">
                    {products.length ? "No hay recetas en este filtro." : "Todavía no hay recetas. Crea la primera con “+ Crear receta”."}
                </p>
            ) : (
                <div className="pa-grid">
                    {visible.map((one) => (
                        <button key={one.id} type="button" className="pa-card pa-card--button" onClick={() => setEditing(one.id)}>
                            <span className="pa-card__top">
                                <b>{one.name}</b>
                                <span className={`pa-pill${one.active ? " pa-pill--good" : ""}`}>{one.active ? "En la web" : "Borrador"}</span>
                            </span>
                            <span className="pa-muted">{one.tab}</span>
                            <span className="pa-num">
                                Costo {one.baseSizeLabel}: <b>{formatPrice(one.baseCost)}</b> · Precio <b>{formatPrice(one.basePrice)}</b>
                            </span>
                            {one.stale ? (
                                <span>
                                    <span className="pa-pill pa-pill--warn">Un costo cambió: revisa el precio</span>
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
