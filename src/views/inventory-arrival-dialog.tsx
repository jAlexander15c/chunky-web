import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { HttpError, fetchGestionAvailability } from "@/helpers";
import type { ISaleAvailability } from "@/helpers";
import { receiveProductBatch } from "@/helpers/inventory";

/** El producto que recibe el lote. Puede venir elegido desde su fila o buscarse en el menú. */
export interface ILotTarget {
    variantId: string;
    name: string;
    shelfLifeDays?: number | null;
    stock?: number | null;
}

const MAX_SHELF_LIFE_DAYS = 3650;

/** En el teléfono se ve la lista sin tener que hacer scroll dentro del diálogo. */
const MAX_OPTIONS = 6;

const expirationFormatter = new Intl.DateTimeFormat("es-PA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Panama",
});

const getMenuName = (product: ISaleAvailability) =>
    product.variantName ? `${product.name} (${product.variantName})` : product.name;

const toLotTarget = (product: ISaleAvailability): ILotTarget => ({
    variantId: product.variantId,
    name: getMenuName(product),
    shelfLifeDays: product.productionMode === "BATCH" ? product.shelfLifeDays ?? null : null,
    stock: product.productionMode === "BATCH" ? Number(product.usableStock ?? 0) : null,
});

/** Cualquier producto del menú que no se prepare al momento con receta puede llegar por lotes. */
const useLotCandidates = (token: string, isEnabled: boolean) => {
    const [products, setProducts] = useState<ISaleAvailability[]>([]);
    const [isLoading, setIsLoading] = useState(isEnabled);

    useEffect(() => {
        if (!isEnabled) return;
        const controller = new AbortController();
        fetchGestionAvailability(token, controller.signal)
            .then((data) => setProducts(data.products.filter((product) => product.productionMode !== "MADE_TO_ORDER")))
            .catch(() => undefined)
            .finally(() => setIsLoading(false));
        return () => controller.abort();
    }, [token, isEnabled]);

    return { products, isLoading };
};

export const ProductLotDialog = ({
    token,
    product,
    scope = "admin",
    onSaved,
    onClose,
}: {
    token: string;
    /** Sin producto, el diálogo deja buscarlo en el menú (solo en Gestión). */
    product?: ILotTarget;
    scope?: "admin" | "gestion";
    onSaved: () => Promise<void>;
    onClose: () => void;
}) => {
    const [target, setTarget] = useState<ILotTarget | null>(product ?? null);
    const [search, setSearch] = useState("");
    // La vista previa del vencimiento se calcula desde que se abrió el diálogo
    const [openedAt] = useState(() => Date.now());
    const [quantity, setQuantity] = useState("");
    const [days, setDays] = useState(product?.shelfLifeDays ? String(product.shelfLifeDays) : "");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    // Estable mientras el producto no cambie: un reintento tras perder la respuesta no duplica el lote
    const [requestId, setRequestId] = useState(() => crypto.randomUUID());
    const { products, isLoading } = useLotCandidates(token, !product && scope === "gestion");
    const buttonClass = scope === "gestion" ? "ges-btn" : "adm-btn";

    const matches = useMemo(() => {
        const query = search.trim().toLocaleLowerCase("es");
        return products
            .filter((candidate) =>
                `${getMenuName(candidate)} ${candidate.categoryName}`.toLocaleLowerCase("es").includes(query)
            )
            .slice(0, MAX_OPTIONS);
    }, [products, search]);

    const choose = (candidate: ISaleAvailability) => {
        const next = toLotTarget(candidate);
        setTarget(next);
        setDays(next.shelfLifeDays ? String(next.shelfLifeDays) : "");
        setRequestId(crypto.randomUUID());
        setError("");
    };

    const amount = Number(quantity);
    const shelfLife = days.trim() === "" ? null : Number(days);
    const isAmountValid = Number.isInteger(amount) && amount > 0;
    const isShelfLifeValid = shelfLife === null || (Number.isInteger(shelfLife) && shelfLife >= 1 && shelfLife <= MAX_SHELF_LIFE_DAYS);
    const expiration = shelfLife && isShelfLifeValid ? expirationFormatter.format(openedAt + shelfLife * 86400000) : null;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!target) return setError("Elige el producto que llegó.");
        if (!isAmountValid) return setError("Escribe cuántas unidades llegaron, en números enteros.");
        if (!isShelfLifeValid) return setError(`Los días van de 1 a ${MAX_SHELF_LIFE_DAYS}, o déjalo vacío si no vence.`);

        setIsSending(true);
        setError("");
        try {
            await receiveProductBatch(token, target.variantId, String(amount), scope, requestId, shelfLife);
            await onSaved();
            onClose();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo registrar el lote.");
            setIsSending(false);
        }
    };

    return (
        <div className="dlg" role="dialog" aria-modal="true" aria-label="Registrar lote">
            <form className="dlg__panel lot" onSubmit={submit}>
                <h3 className="script">Registrar lote</h3>

                {target ? (
                    <div className="lot__chosen">
                        <span>
                            <b>{target.name}</b>
                            {target.stock != null ? <small>Hay {target.stock} u</small> : <small>Primer lote</small>}
                        </span>
                        {!product ? (
                            <button type="button" className="lot__change" onClick={() => setTarget(null)}>
                                Cambiar
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <div className="lot__pick">
                        <label className="lot__label" htmlFor="lot-search">Producto</label>
                        <input
                            id="lot-search"
                            className="lot__input"
                            type="search"
                            placeholder="Busca la galleta o el postre"
                            autoFocus
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        <ul className="lot__options" aria-label="Productos del menú">
                            {isLoading ? (
                                <li className="lot__empty">Cargando el menú…</li>
                            ) : matches.length === 0 ? (
                                <li className="lot__empty">Ningún producto coincide.</li>
                            ) : (
                                matches.map((candidate) => (
                                    <li key={candidate.variantId}>
                                        <button type="button" className="lot__option" onClick={() => choose(candidate)}>
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
                        <label className="lot__label" htmlFor="lot-quantity">Llegaron</label>
                        <div className="dlg__field">
                            <input
                                id="lot-quantity"
                                className="dlg__input"
                                type="text"
                                inputMode="numeric"
                                autoFocus={Boolean(product)}
                                value={quantity}
                                onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))}
                            />
                            <span className="dlg__unit">u</span>
                        </div>
                    </div>
                    <div>
                        <label className="lot__label" htmlFor="lot-days">Dura (días)</label>
                        <div className="dlg__field">
                            <input
                                id="lot-days"
                                className="dlg__input"
                                type="text"
                                inputMode="numeric"
                                placeholder="—"
                                value={days}
                                onChange={(event) => setDays(event.target.value.replace(/\D/g, ""))}
                            />
                        </div>
                    </div>
                </div>

                <p className="dlg__hint">
                    {expiration ? `Vence el ${expiration}. ` : "Sin días, el lote no vence. "}
                    La llegada se registra con la hora del guardado y se suma a lo que ya hay.
                </p>

                {error ? <p className="dlg__error" role="alert">{error}</p> : null}

                <div className="dlg__actions">
                    <button type="button" className={buttonClass} onClick={onClose} disabled={isSending}>
                        Cancelar
                    </button>
                    <button type="submit" className={`${buttonClass} ${buttonClass}--solid`} disabled={isSending || !target}>
                        {isSending
                            ? "Guardando…"
                            : target && isAmountValid
                              ? `Registrar ${amount}`
                              : "Registrar lote"}
                    </button>
                </div>
            </form>
        </div>
    );
};
