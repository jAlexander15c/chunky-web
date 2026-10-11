import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    HttpError,
    createPastryProduct,
    deletePastryProduct,
    fetchPastryIngredients,
    fetchPastryProduct,
    formatPrice,
    getPastryBasePrice,
    getPastryIngredientMap,
    getPastryOptionPrice,
    getPastryProductMissing,
    getPastrySizeMargin,
    getRecipeCost,
    createEmptyPastryProduct,
    updatePastryProduct,
} from "@/helpers";
import type { IPastryGroup, IPastryIngredient, IPastryOption, IPastryProductInput, IPastrySize } from "@/helpers";

import { FullSheet } from "./full-sheet";
import { DecimalInput } from "./pastry-fields";
import { PastryItems } from "./pastry-items";

import "./pastry.css";

const NEW_TAB = "__nueva__";
const FREE_MAX_CHOICES = [0, 1, 2, 3, 4, 5];

/** Lo que se manda al API: solo los campos del contrato, sin lo que trae de más la respuesta. */
const getInput = (product: IPastryProductInput): IPastryProductInput => ({
    name: product.name.trim(),
    description: product.description.trim(),
    tab: product.tab.trim(),
    factor: product.factor,
    active: product.active,
    needsPhoto: product.needsPhoto,
    allowsTopper: product.allowsTopper,
    topperPrice: product.topperPrice,
    sort: product.sort,
    sizes: product.sizes.map((size) => ({ id: size.id, label: size.label.trim(), scale: size.scale, isBase: size.isBase })),
    base: product.base,
    groups: product.groups.map((group) => ({
        id: group.id,
        name: group.name.trim(),
        min: group.min,
        max: group.max,
        freeMax: group.freeMax,
        options: group.options.map((option) => ({ id: option.id, name: option.name.trim(), active: option.active, items: option.items })),
    })),
});

interface IPastryRecipeEditorProps {
    token: string;
    /** Sin id se crea una receta nueva. */
    productId: number | null;
    /** Las pestañas que ya existen en el cotizador. */
    tabs: string[];
    onBack: () => void;
    /** Guardó o borró: la lista de recetas se vuelve a pedir. */
    onChanged: () => void;
    onSessionExpired: () => void;
}

interface IOptionSheetProps {
    token: string;
    option: IPastryOption;
    ingredients: IPastryIngredient[];
    baseLabel: string;
    price: number;
    cost: number;
    onChange: (option: IPastryOption) => void;
    onIngredientSaved: (ingredient: IPastryIngredient) => void;
    onClose: () => void;
    onSessionExpired: () => void;
}

/** La mini-receta de una opción: lo que cuesta sumarla a cualquier tamaño. */
const OptionSheet = ({ token, option, ingredients, baseLabel, price, cost, onChange, onIngredientSaved, onClose, onSessionExpired }: IOptionSheetProps) => (
    <FullSheet title={option.name.trim() || "Nueva opción"} onClose={onClose}>
        {(close) => (
            <div className="pa pa-sheet">
                <label className="pa-field">
                    Nombre de la opción
                    <input
                        className="pa-input"
                        value={option.name}
                        maxLength={80}
                        autoComplete="off"
                        placeholder="Zanahoria"
                        onChange={(event) => onChange({ ...option, name: event.target.value })}
                    />
                </label>
                <label className="pa-toggle">
                    <span>Se ofrece en la web</span>
                    <input type="checkbox" checked={option.active} onChange={(event) => onChange({ ...option, active: event.target.checked })} />
                </label>
                <h3 className="pa-muted">Lo que lleva</h3>
                <PastryItems
                    token={token}
                    items={option.items}
                    ingredients={ingredients}
                    onChange={(items) => onChange({ ...option, items })}
                    onIngredientSaved={onIngredientSaved}
                    onSessionExpired={onSessionExpired}
                />
                <div className="pa-total">
                    <span>Costo</span>
                    <span className="pa-money">{formatPrice(cost)}</span>
                </div>
                <p className="pa-hint">
                    En el {baseLabel || "tamaño base"} suma {formatPrice(price)} al precio
                </p>
                <button type="button" className="pa-btn pa-btn--solid" onClick={() => close()}>
                    Listo
                </button>
            </div>
        )}
    </FullSheet>
);

/** Crear o editar una receta: datos, ingredientes, tamaños, opciones y el precio que sale de todo. */
export const PastryRecipeEditor = ({ token, productId, tabs, onBack, onChanged, onSessionExpired }: IPastryRecipeEditorProps) => {
    const [product, setProduct] = useState<IPastryProductInput | null>(null);
    const [savedId, setSavedId] = useState(productId);
    const [ingredients, setIngredients] = useState<IPastryIngredient[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [isNewTab, setIsNewTab] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [editingOption, setEditingOption] = useState<{ group: number; option: number } | null>(null);
    const saved = useRef("");

    const handleError = useCallback(
        (requestError: unknown, fallback: string) => {
            if (requestError instanceof HttpError && requestError.status === 401) {
                onSessionExpired();
                return;
            }
            setError(requestError instanceof HttpError ? requestError.message : fallback);
        },
        [onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        Promise.all([
            fetchPastryIngredients(token, true, controller.signal),
            productId === null ? Promise.resolve(null) : fetchPastryProduct(token, productId, controller.signal),
        ])
            .then(([loadedIngredients, loaded]) => {
                const next = loaded ? getInput(loaded) : createEmptyPastryProduct();
                saved.current = JSON.stringify(next);
                setIngredients(loadedIngredients);
                setProduct(next);
                setIsNewTab(!next.tab && !tabs.length);
            })
            .catch((requestError) => {
                if (!controller.signal.aborted) handleError(requestError, "No pudimos abrir la receta.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoading(false);
            });
        return () => controller.abort();
        // La lista de pestañas solo importa al abrir
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, productId, handleError]);

    const byId = useMemo(() => getPastryIngredientMap(ingredients), [ingredients]);

    const patch = (changes: Partial<IPastryProductInput>) => {
        setNotice("");
        setProduct((current) => (current ? { ...current, ...changes } : current));
    };

    const patchSize = (index: number, changes: Partial<IPastrySize>) =>
        patch({ sizes: product!.sizes.map((size, at) => (at === index ? { ...size, ...changes } : size)) });

    const setBaseSize = (index: number) => patch({ sizes: product!.sizes.map((size, at) => ({ ...size, isBase: at === index })) });

    const patchGroup = (index: number, changes: Partial<IPastryGroup>) =>
        patch({ groups: product!.groups.map((group, at) => (at === index ? { ...group, ...changes } : group)) });

    const patchOption = (groupIndex: number, optionIndex: number, option: IPastryOption) =>
        patchGroup(groupIndex, { options: product!.groups[groupIndex].options.map((one, at) => (at === optionIndex ? option : one)) });

    const handleIngredientSaved = (ingredient: IPastryIngredient) =>
        setIngredients((current) => current.map((one) => (one.id === ingredient.id ? { ...one, ...ingredient } : one)));

    const missing = product ? getPastryProductMissing(product) : [];
    const baseSize = product?.sizes.find((size) => size.isBase) ?? product?.sizes[0];
    const isDirty = product ? JSON.stringify(product) !== saved.current : false;

    const goBack = () => {
        if (isDirty && !window.confirm("Tienes cambios sin guardar. ¿Salir sin guardar?")) return;
        onBack();
    };

    const save = async () => {
        if (!product || busy || missing.length) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const input = getInput(product);
            const result = savedId === null ? await createPastryProduct(token, input) : await updatePastryProduct(token, savedId, input);
            const next = getInput(result);
            saved.current = JSON.stringify(next);
            setSavedId(result.id);
            setProduct(next);
            setNotice(next.active ? "Guardada. Ya sale en el cotizador." : "Guardada como borrador.");
            onChanged();
        } catch (requestError) {
            handleError(requestError, "No pudimos guardar la receta.");
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (savedId === null || busy) return;
        setBusy(true);
        setError("");
        try {
            await deletePastryProduct(token, savedId);
            onChanged();
            onBack();
        } catch (requestError) {
            handleError(requestError, "No pudimos borrar la receta.");
            setBusy(false);
        }
    };

    if (isLoading || !product || !baseSize) {
        return (
            <div className="pa" aria-busy={isLoading}>
                <button type="button" className="pa-btn pa-btn--small" style={{ justifySelf: "start" }} onClick={onBack}>
                    ← Recetas
                </button>
                {error ? <p className="pa-error" role="alert">{error}</p> : <div className="pa-skeleton" />}
            </div>
        );
    }

    const baseCost = getRecipeCost(product.base, byId);
    const tabOptions = Array.from(new Set([...tabs, ...(product.tab.trim() && !isNewTab ? [product.tab.trim()] : [])]));
    const isOpen = editingOption !== null ? product.groups[editingOption.group]?.options[editingOption.option] : undefined;

    return (
        <div className="pa">
            <div className="pa-head">
                <button type="button" className="pa-btn pa-btn--small" onClick={goBack}>
                    ← Recetas
                </button>
                <span className={`pa-pill${product.active ? " pa-pill--good" : ""}`}>{product.active ? "En la web" : "Borrador"}</span>
            </div>

            <div className="pa-ed">
                <div className="pa-ed__main">
                    <section className="pa-block">
                        <h3>Datos</h3>
                        <label className="pa-field">
                            Nombre del postre
                            <input
                                className="pa-input"
                                value={product.name}
                                maxLength={80}
                                autoComplete="off"
                                placeholder="Cheesecake NY"
                                onChange={(event) => patch({ name: event.target.value })}
                            />
                        </label>
                        <label className="pa-field">
                            Descripción para el cliente <small>(opcional)</small>
                            <input
                                className="pa-input"
                                value={product.description}
                                maxLength={200}
                                autoComplete="off"
                                onChange={(event) => patch({ description: event.target.value })}
                            />
                        </label>
                        <label className="pa-field">
                            Pestaña en el cotizador
                            <select
                                className="pa-input"
                                value={isNewTab ? NEW_TAB : product.tab}
                                onChange={(event) => {
                                    if (event.target.value === NEW_TAB) {
                                        setIsNewTab(true);
                                        patch({ tab: "" });
                                    } else {
                                        setIsNewTab(false);
                                        patch({ tab: event.target.value });
                                    }
                                }}
                            >
                                {!isNewTab && !product.tab ? <option value="">Elige una pestaña</option> : null}
                                {tabOptions.map((one) => (
                                    <option key={one} value={one}>
                                        {one}
                                    </option>
                                ))}
                                <option value={NEW_TAB}>+ Nueva pestaña…</option>
                            </select>
                        </label>
                        {isNewTab ? (
                            <label className="pa-field">
                                Nombre de la pestaña nueva
                                <input
                                    className="pa-input"
                                    value={product.tab}
                                    maxLength={80}
                                    autoComplete="off"
                                    placeholder="Tartas"
                                    onChange={(event) => patch({ tab: event.target.value })}
                                />
                            </label>
                        ) : null}
                    </section>

                    <section className="pa-block">
                        <h3>
                            Receta base <small>{baseSize.scale === 1 && baseSize.label.trim() ? `para el tamaño ${baseSize.label.trim()}` : "a escala 1"}</small>
                        </h3>
                        <PastryItems
                            token={token}
                            items={product.base}
                            ingredients={ingredients}
                            onChange={(base) => patch({ base })}
                            onIngredientSaved={handleIngredientSaved}
                            onSessionExpired={onSessionExpired}
                        />
                        <div className="pa-total">
                            <span>Costo estimado</span>
                            <span className="pa-money">{formatPrice(baseCost)}</span>
                        </div>
                    </section>

                    <section className="pa-block">
                        <h3>
                            Tamaños <small>la escala multiplica la receta; se puede corregir</small>
                        </h3>
                        <div className="pa-sizes">
                            {product.sizes.map((size, index) => (
                                <div className="pa-size" key={size.id ?? `nuevo-${index}`}>
                                    <label className="pa-field">
                                        Tamaño
                                        <input
                                            className="pa-input"
                                            value={size.label}
                                            maxLength={40}
                                            autoComplete="off"
                                            placeholder={'8"'}
                                            onChange={(event) => patchSize(index, { label: event.target.value })}
                                        />
                                    </label>
                                    <label className="pa-field">
                                        Escala
                                        <DecimalInput value={size.scale} onChange={(scale) => patchSize(index, { scale })} />
                                    </label>
                                    <div className="pa-size__foot">
                                        <button
                                            type="button"
                                            className={`pa-chip`}
                                            aria-pressed={size.isBase}
                                            onClick={() => setBaseSize(index)}
                                        >
                                            {size.isBase ? "Tamaño base" : "Hacer base"}
                                        </button>
                                        {!size.isBase ? (
                                            <button
                                                type="button"
                                                className="pa-link"
                                                onClick={() => patch({ sizes: product.sizes.filter((_, at) => at !== index) })}
                                            >
                                                Quitar
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="pa-btn pa-btn--small"
                            style={{ justifySelf: "start" }}
                            onClick={() => patch({ sizes: [...product.sizes, { label: "", scale: 1, isBase: false }] })}
                        >
                            + Tamaño
                        </button>
                    </section>

                    <section className="pa-block">
                        <h3>
                            Opciones <small>masas, rellenos, coberturas…</small>
                        </h3>
                        {product.groups.map((group, groupIndex) => (
                            <div className="pa-group" key={group.id ?? `nuevo-${groupIndex}`}>
                                <label className="pa-field">
                                    Nombre del grupo
                                    <input
                                        className="pa-input"
                                        value={group.name}
                                        maxLength={80}
                                        autoComplete="off"
                                        placeholder="Cobertura"
                                        onChange={(event) => patchGroup(groupIndex, { name: event.target.value })}
                                    />
                                </label>
                                <div className="pa-group__rules">
                                    <label className="pa-field">
                                        Mínimo
                                        <DecimalInput value={group.min} onChange={(min) => patchGroup(groupIndex, { min: Math.floor(min) })} />
                                    </label>
                                    <label className="pa-field">
                                        Máximo
                                        <DecimalInput value={group.max} onChange={(max) => patchGroup(groupIndex, { max: Math.floor(max) })} />
                                    </label>
                                    <label className="pa-field">
                                        Incluidas
                                        <select
                                            className="pa-input"
                                            value={group.freeMax === null ? "" : String(group.freeMax)}
                                            onChange={(event) => patchGroup(groupIndex, { freeMax: event.target.value === "" ? null : Number(event.target.value) })}
                                        >
                                            <option value="">Sin límite</option>
                                            {FREE_MAX_CHOICES.map((one) => (
                                                <option key={one} value={one}>
                                                    Hasta {one}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                                <p className="pa-muted">
                                    El cliente elige de {group.min} a {group.max}. “Incluidas” limita cuántas sin recargo puede combinar.
                                </p>

                                {group.options.map((option, optionIndex) => {
                                    const cost = getRecipeCost(option.items, byId);
                                    return (
                                        <div className={`pa-option${option.active ? "" : " is-off"}`} key={option.id ?? `nueva-${optionIndex}`}>
                                            <div className="pa-option__top">
                                                <b>{option.name.trim() || "Opción sin nombre"}</b>
                                                <span className="pa-money">+{formatPrice(getPastryOptionPrice(option, product, baseSize, byId))}</span>
                                            </div>
                                            <span className="pa-muted">
                                                Costo {formatPrice(cost)}
                                                {option.active ? "" : " · oculta en la web"}
                                            </span>
                                            <div className="pa-actions">
                                                <button
                                                    type="button"
                                                    className="pa-btn pa-btn--small"
                                                    onClick={() => setEditingOption({ group: groupIndex, option: optionIndex })}
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="pa-link"
                                                    onClick={() => patchGroup(groupIndex, { options: group.options.filter((_, at) => at !== optionIndex) })}
                                                >
                                                    Quitar
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="pa-actions">
                                    <button
                                        type="button"
                                        className="pa-btn pa-btn--small"
                                        onClick={() => {
                                            patchGroup(groupIndex, { options: [...group.options, { name: "", active: true, items: [] }] });
                                            setEditingOption({ group: groupIndex, option: group.options.length });
                                        }}
                                    >
                                        + Opción
                                    </button>
                                    <button
                                        type="button"
                                        className="pa-link"
                                        onClick={() => patch({ groups: product.groups.filter((_, at) => at !== groupIndex) })}
                                    >
                                        Quitar el grupo
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button
                            type="button"
                            className="pa-btn pa-btn--small"
                            style={{ justifySelf: "start" }}
                            onClick={() => patch({ groups: [...product.groups, { name: "", min: 1, max: 1, freeMax: null, options: [] }] })}
                        >
                            + Grupo (ej. Masa 1–1, Relleno 1–2)
                        </button>
                    </section>

                    <section className="pa-block">
                        <h3>Para el cliente</h3>
                        <label className="pa-toggle">
                            <span>Pide foto de referencia</span>
                            <input type="checkbox" checked={product.needsPhoto} onChange={(event) => patch({ needsPhoto: event.target.checked })} />
                        </label>
                        <label className="pa-toggle">
                            <span>Permite topper</span>
                            <input type="checkbox" checked={product.allowsTopper} onChange={(event) => patch({ allowsTopper: event.target.checked })} />
                        </label>
                        {product.allowsTopper ? (
                            <label className="pa-field">
                                Precio del topper ($)
                                <DecimalInput value={product.topperPrice} onChange={(topperPrice) => patch({ topperPrice })} />
                            </label>
                        ) : null}
                        <label className="pa-toggle">
                            <span>Publicado en la web</span>
                            <input type="checkbox" checked={product.active} onChange={(event) => patch({ active: event.target.checked })} />
                        </label>
                    </section>
                </div>

                <aside className="pa-block pa-ed__aside" aria-label="Costo y precio">
                    <h3>Costo y precio</h3>
                    <label className="pa-field">
                        Multiplicador
                        <DecimalInput value={product.factor} onChange={(factor) => patch({ factor })} />
                    </label>
                    <p className="pa-muted">Precio = costo × escala × multiplicador, redondeado al dólar.</p>
                    <div className="pa-prices">
                        {product.sizes.map((size, index) => {
                            const { cost, price, margin } = getPastrySizeMargin(product, size, byId);
                            return (
                                <div key={size.id ?? `nuevo-${index}`}>
                                    <div className="pa-price-row pa-price-row--big">
                                        <span>{size.label.trim() || "Tamaño sin nombre"}</span>
                                        <span className="pa-money">{formatPrice(getPastryBasePrice(product, size, byId))}</span>
                                    </div>
                                    <div className="pa-price-row">
                                        <span className="pa-muted">costo {formatPrice(cost)}</span>
                                        <span className={`pa-margin${margin < 0 ? " is-loss" : ""}`}>
                                            {margin < 0 ? "pierdes" : "te deja"} {formatPrice(Math.abs(price - cost))}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {product.groups.some((group) => group.options.length) ? (
                        <p className="pa-muted">
                            Opciones en {baseSize.label.trim() || "el tamaño base"}:{" "}
                            {product.groups
                                .flatMap((group) => group.options)
                                .map((option) => `${option.name.trim() || "Sin nombre"} +$${getPastryOptionPrice(option, product, baseSize, byId)}`)
                                .join(" · ")}
                        </p>
                    ) : null}

                    {missing.length ? <p className="pa-muted" aria-live="polite">{missing[0]}</p> : null}
                    {error ? <p className="pa-error" role="alert">{error}</p> : null}
                    {notice ? <p className="pa-notice" role="status">{notice}</p> : null}
                    <button type="button" className="pa-btn pa-btn--solid" disabled={busy || missing.length > 0} onClick={() => void save()}>
                        {busy ? "Guardando…" : "Guardar receta"}
                    </button>
                    {savedId !== null ? (
                        isConfirmingDelete ? (
                            <div className="pa-actions">
                                <button type="button" className="pa-btn pa-btn--danger" disabled={busy} onClick={() => void remove()}>
                                    Sí, borrar la receta
                                </button>
                                <button type="button" className="pa-btn" disabled={busy} onClick={() => setIsConfirmingDelete(false)}>
                                    No
                                </button>
                            </div>
                        ) : (
                            <button type="button" className="pa-link" onClick={() => setIsConfirmingDelete(true)}>
                                Borrar esta receta
                            </button>
                        )
                    ) : null}
                </aside>
            </div>

            {editingOption && isOpen ? (
                <OptionSheet
                    key={`${editingOption.group}-${editingOption.option}`}
                    token={token}
                    option={isOpen}
                    ingredients={ingredients}
                    baseLabel={baseSize.label.trim()}
                    price={getPastryOptionPrice(isOpen, product, baseSize, byId)}
                    cost={getRecipeCost(isOpen.items, byId)}
                    onChange={(option) => patchOption(editingOption.group, editingOption.option, option)}
                    onIngredientSaved={handleIngredientSaved}
                    onClose={() => setEditingOption(null)}
                    onSessionExpired={onSessionExpired}
                />
            ) : null}
        </div>
    );
};
