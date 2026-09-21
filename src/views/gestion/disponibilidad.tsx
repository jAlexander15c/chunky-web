import { useCallback, useEffect, useMemo, useState } from "react";

import {
    HttpError,
    changeGestionAvailability,
    fetchGestionAvailability,
    formatCash,
    formatQuantity,
} from "@/helpers";
import type { ISaleAvailability } from "@/helpers";

type StateFilter = "todos" | "disponibles" | "apagados";

const STATE_FILTERS: { id: StateFilter; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "disponibles", label: "Disponibles" },
    { id: "apagados", label: "Apagados" },
];

const ALL_CATEGORIES = "todas";

const PAGE_SIZE = 20;

/** Sin tildes ni mayúsculas: "pina" encuentra "Piña". */
const getSearchKey = (value: string) =>
    value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const isInStateFilter = (product: ISaleAvailability, filter: StateFilter) =>
    filter === "todos" || (filter === "disponibles" ? product.isAvailable : !product.isAvailable);

interface IGestionDisponibilidadProps {
    token: string;
    onSessionExpired: () => void;
}

export const GestionDisponibilidad = ({ token, onSessionExpired }: IGestionDisponibilidadProps) => {
    const [products, setProducts] = useState<ISaleAvailability[]>([]);
    const [search, setSearch] = useState("");
    const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
    const [stateFilter, setStateFilter] = useState<StateFilter>("todos");
    const [page, setPage] = useState(1);
    const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const handleRequestError = useCallback(
        (requestError: unknown, fallback: string) => {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : fallback);
        },
        [onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();

        const loadProducts = async () => {
            try {
                const data = await fetchGestionAvailability(token, controller.signal);
                setProducts(data.products);
                setError("");
            } catch (requestError) {
                if (controller.signal.aborted) return;
                handleRequestError(requestError, "No pudimos cargar los productos.");
            } finally {
                setIsLoading(false);
            }
        };

        void loadProducts();
        return () => controller.abort();
    }, [token, handleRequestError]);

    const categories = useMemo(() => {
        const byId = new Map<string, { id: string; name: string; count: number }>();
        products.forEach((product) => {
            const id = product.categoryId ?? "";
            const current = byId.get(id) ?? { id, name: product.categoryName, count: 0 };
            byId.set(id, { ...current, count: current.count + 1 });
        });
        return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
    }, [products]);

    // Categoría y búsqueda primero: así cada filtro de estado muestra cuántos quedarían
    const matching = useMemo(() => {
        const key = getSearchKey(search);
        return products.filter(
            (product) =>
                (categoryId === ALL_CATEGORIES || (product.categoryId ?? "") === categoryId) &&
                (!key || getSearchKey(`${product.name} ${product.variantName}`).includes(key))
        );
    }, [products, search, categoryId]);

    const stateCounts = useMemo(
        () =>
            Object.fromEntries(
                STATE_FILTERS.map(({ id }) => [id, matching.filter((product) => isInStateFilter(product, id)).length])
            ) as Record<StateFilter, number>,
        [matching]
    );

    const visible = useMemo(
        () => matching.filter((product) => isInStateFilter(product, stateFilter)),
        [matching, stateFilter]
    );

    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const setAvailabilityLocally = (variantId: string, isAvailable: boolean) =>
        setProducts((current) =>
            current.map((product) => (product.variantId === variantId ? { ...product, isAvailable } : product))
        );

    const setPending = (variantId: string, isPending: boolean) =>
        setPendingIds((current) => {
            const next = new Set(current);
            if (isPending) next.add(variantId);
            else next.delete(variantId);
            return next;
        });

    // Se cambia en pantalla al instante y se deshace si Loyverse no lo acepta
    const toggleAvailability = async (product: ISaleAvailability) => {
        if (pendingIds.has(product.variantId)) return;

        const nextValue = !product.isAvailable;
        setError("");
        setPending(product.variantId, true);
        setAvailabilityLocally(product.variantId, nextValue);

        try {
            await changeGestionAvailability(token, product.itemId, product.variantId, nextValue);
        } catch (requestError) {
            setAvailabilityLocally(product.variantId, product.isAvailable);
            handleRequestError(requestError, `No pudimos cambiar ${product.name}. Quedó como estaba; intenta de nuevo.`);
        } finally {
            setPending(product.variantId, false);
        }
    };

    const changeFilter = (apply: () => void) => {
        apply();
        setPage(1);
    };

    return (
        <main className="ges-main">
            <div className="ges-avail-filters">
                <label className="ges-sr-only" htmlFor="ges-avail-search">Buscar producto</label>
                <input
                    id="ges-avail-search"
                    className="ges-search"
                    type="search"
                    placeholder="Buscar producto…"
                    autoComplete="off"
                    value={search}
                    onChange={(event) => changeFilter(() => setSearch(event.target.value))}
                />

                <div className="ges-tabs ges-tabs--flush" aria-label="Categoría">
                    <button
                        type="button"
                        className="ges-tab"
                        aria-pressed={categoryId === ALL_CATEGORIES}
                        onClick={() => changeFilter(() => setCategoryId(ALL_CATEGORIES))}
                    >
                        Todas
                        <small>{products.length}</small>
                    </button>
                    {categories.map((category) => (
                        <button
                            key={category.id}
                            type="button"
                            className="ges-tab"
                            aria-pressed={categoryId === category.id}
                            onClick={() => changeFilter(() => setCategoryId(category.id))}
                        >
                            {category.name}
                            <small>{category.count}</small>
                        </button>
                    ))}
                </div>

                <div className="ges-avail-states" aria-label="Estado">
                    {STATE_FILTERS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className="ges-tab"
                            aria-pressed={stateFilter === option.id}
                            onClick={() => changeFilter(() => setStateFilter(option.id))}
                        >
                            {option.label}
                            <small>{stateCounts[option.id]}</small>
                        </button>
                    ))}
                </div>
            </div>

            {error ? <p className="ges-error" role="alert">{error}</p> : null}

            {isLoading ? (
                <p className="ges-empty">Cargando…</p>
            ) : products.length === 0 ? (
                <p className="ges-empty">No hay productos a la venta en esta tienda.</p>
            ) : pageItems.length === 0 ? (
                <p className="ges-empty">Ningún producto coincide con los filtros.</p>
            ) : (
                <ul className="ges-avail-list">
                    {pageItems.map((product) => {
                        const isPending = pendingIds.has(product.variantId);
                        const fullName = product.variantName ? `${product.name} · ${product.variantName}` : product.name;

                        return (
                            <li key={product.variantId} className={`ges-avail${product.isAvailable ? "" : " is-off"}`}>
                                <div className="ges-avail__body">
                                    <div className="ges-avail__name">
                                        {product.name}
                                        {product.variantName ? <em> · {product.variantName}</em> : null}
                                    </div>
                                    <div className="ges-avail__meta">
                                        {product.categoryName}
                                        {product.price !== null ? ` · ${formatCash(product.price)}` : ""}
                                    </div>
                                    {product.stock !== null ? (
                                        <div className="ges-avail__stock">
                                            Stock: {formatQuantity(product.stock)} u · se apaga solo al llegar a 0
                                        </div>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    className={`ges-switch${isPending ? " is-busy" : ""}`}
                                    aria-checked={product.isAvailable}
                                    aria-busy={isPending}
                                    aria-label={`${fullName} disponible`}
                                    disabled={isPending}
                                    onClick={() => void toggleAvailability(product)}
                                >
                                    <span className="ges-switch__label">
                                        {product.isAvailable ? "Disponible" : "Apagado"}
                                    </span>
                                    <span className="ges-switch__track" aria-hidden="true">
                                        <span className="ges-switch__thumb" />
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {pageCount > 1 ? (
                <nav className="ges-pager" aria-label="Páginas">
                    <button
                        type="button"
                        className="ges-btn ges-btn--sm"
                        disabled={currentPage <= 1}
                        onClick={() => setPage(currentPage - 1)}
                    >
                        ‹ Anterior
                    </button>
                    <span>
                        {currentPage} de {pageCount}
                    </span>
                    <button
                        type="button"
                        className="ges-btn ges-btn--sm"
                        disabled={currentPage >= pageCount}
                        onClick={() => setPage(currentPage + 1)}
                    >
                        Siguiente ›
                    </button>
                </nav>
            ) : null}
        </main>
    );
};
