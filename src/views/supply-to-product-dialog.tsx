import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { HttpError } from "@/helpers";
import type { ISaleAvailability, ISupplyStatus } from "@/helpers";
import { convertSupplyToProduct, fetchAdminMenuProducts } from "@/helpers/inventory";

/** En el teléfono se ve la lista sin tener que hacer scroll dentro del diálogo. */
const MAX_OPTIONS = 6;

const MAX_SHELF_LIFE_DAYS = 3650;

const getMenuName = (product: ISaleAvailability) =>
    product.variantName ? `${product.name} (${product.variantName})` : product.name;

/** Lo que hay hoy prellena la cantidad solo si el insumo ya se cuenta por unidades. */
const getInitialQuantity = (supply: ISupplyStatus) => (supply.unit === "u" ? String(Math.max(0, Math.floor(supply.stock))) : "");

/**
 * Un insumo que en realidad se vende tal cual (el Tres Leche de pistacho): pasa a lotes del
 * producto del menú, se archiva y deja de avisar para comprar.
 */
export const SupplyToProductDialog = ({
    token,
    supply,
    onSaved,
    onClose,
}: {
    token: string;
    supply: ISupplyStatus;
    onSaved: () => Promise<void>;
    onClose: () => void;
}) => {
    const [products, setProducts] = useState<ISaleAvailability[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState(supply.name);
    const [target, setTarget] = useState<ISaleAvailability | null>(null);
    const [quantity, setQuantity] = useState(() => getInitialQuantity(supply));
    const [days, setDays] = useState(supply.shelfLifeDays ? String(supply.shelfLifeDays) : "");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    // Un reintento tras perder la respuesta no repite el cambio
    const [requestId] = useState(() => crypto.randomUUID());

    useEffect(() => {
        const controller = new AbortController();
        fetchAdminMenuProducts(token, controller.signal)
            // Lo que se prepara al momento con receta no se maneja por lotes
            .then((data) => setProducts(data.products.filter((product) => product.productionMode !== "MADE_TO_ORDER")))
            .catch(() => undefined)
            .finally(() => setIsLoading(false));
        return () => controller.abort();
    }, [token]);

    const matches = useMemo(() => {
        const words = search.trim().toLocaleLowerCase("es").split(/\s+/).filter(Boolean);
        // Cualquier palabra sirve: "Tres Leche de pistacho" encuentra "Tres Leches (Pistacho)"
        const score = (product: ISaleAvailability) => {
            // Solo el nombre: "Postres" contiene "tres" y traería todo el menú
            const text = getMenuName(product).toLocaleLowerCase("es");
            return words.filter((word) => word.length > 2 && text.includes(word)).length;
        };
        if (words.length === 0) return products.slice(0, MAX_OPTIONS);
        return products
            .map((product) => ({ product, points: score(product) }))
            .filter((entry) => entry.points > 0)
            .sort((a, b) => b.points - a.points)
            .slice(0, MAX_OPTIONS)
            .map((entry) => entry.product);
    }, [products, search]);

    const amount = Number(quantity);
    const shelfLife = days.trim() === "" ? undefined : Number(days);
    const isAmountValid = quantity.trim() !== "" && Number.isInteger(amount) && amount >= 0;
    const isShelfLifeValid = shelfLife === undefined || (Number.isInteger(shelfLife) && shelfLife >= 1 && shelfLife <= MAX_SHELF_LIFE_DAYS);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!target) return setError("Elige el producto del menú.");
        if (!isAmountValid) return setError("Escribe cuántas hay ahora, en números enteros (0 si no queda ninguna).");
        if (!isShelfLifeValid) return setError(`Los días van de 1 a ${MAX_SHELF_LIFE_DAYS}, o déjalo vacío.`);
        setIsSending(true);
        setError("");
        try {
            await convertSupplyToProduct(token, supply.id, { variantId: target.variantId, quantity: amount, shelfLifeDays: shelfLife, requestId });
            await onSaved();
            onClose();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo pasar a producto. Puedes reintentar.");
            setIsSending(false);
        }
    };

    return (
        <div className="dlg" role="dialog" aria-modal="true" aria-label="Pasar a producto">
            <form className="dlg__panel lot" onSubmit={submit}>
                <h3 className="script">Pasar a producto</h3>
                <p className="dlg__hint">{supply.name} deja de ser insumo y se maneja por lotes, como las galletas y los postres.</p>

                {target ? (
                    <div className="lot__chosen">
                        <span>
                            <b>{getMenuName(target)}</b>
                            <small>{target.categoryName}</small>
                        </span>
                        <button type="button" className="lot__change" onClick={() => setTarget(null)}>
                            Cambiar
                        </button>
                    </div>
                ) : (
                    <div className="lot__pick">
                        <label className="lot__label" htmlFor="to-product-search">Producto del menú</label>
                        <input
                            id="to-product-search"
                            className="lot__input"
                            type="search"
                            placeholder="Busca el producto"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        <ul className="lot__options" aria-label="Productos del menú">
                            {isLoading ? (
                                <li className="lot__empty">Cargando el menú…</li>
                            ) : matches.length === 0 ? (
                                <li className="lot__empty">Ningún producto coincide. Revisa que esté en el menú de Loyverse.</li>
                            ) : (
                                matches.map((candidate) => (
                                    <li key={candidate.variantId}>
                                        <button type="button" className="lot__option" onClick={() => setTarget(candidate)}>
                                            <span>
                                                {getMenuName(candidate)}
                                                <small>{candidate.categoryName}</small>
                                            </span>
                                            <small>
                                                {candidate.productionMode === "BATCH" ? `${Number(candidate.usableStock ?? 0)} u` : "nuevo"}
                                            </small>
                                        </button>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                )}

                <div className="lot__fields">
                    <div>
                        <label className="lot__label" htmlFor="to-product-quantity">¿Cuántas hay ahora?</label>
                        <div className="dlg__field lot__other">
                            <input
                                id="to-product-quantity"
                                className="dlg__input"
                                type="text"
                                inputMode="numeric"
                                value={quantity}
                                onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))}
                            />
                            <span className="dlg__unit">u</span>
                        </div>
                    </div>
                    <div>
                        <label className="lot__label" htmlFor="to-product-days">
                            Dura <small>(opcional)</small>
                        </label>
                        <div className="dlg__field lot__other">
                            <input
                                id="to-product-days"
                                className="dlg__input"
                                type="text"
                                inputMode="numeric"
                                placeholder="—"
                                value={days}
                                onChange={(event) => setDays(event.target.value.replace(/\D/g, ""))}
                            />
                            <span className="dlg__unit">días</span>
                        </div>
                    </div>
                </div>

                <ul className="lot__summary lot__summary--list">
                    <li>No vuelve a mandar “Comprar” ni sale en el resumen de la mañana.</li>
                    <li>Cada venta en Loyverse lo descuenta solo; si se acaba, la web no lo ofrece.</li>
                    <li>Lo nuevo entra con “Llegó un lote”.</li>
                    <li>El insumo se archiva; su historial queda.</li>
                </ul>

                {error ? <p className="dlg__error" role="alert">{error}</p> : null}

                <div className="dlg__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>
                        Cancelar
                    </button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending || !target}>
                        {isSending ? "Guardando…" : "Pasar a producto"}
                    </button>
                </div>
            </form>
        </div>
    );
};
