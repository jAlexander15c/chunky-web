import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import {
    HttpError,
    MAX_QUOTE_QUANTITY,
    canAddCatalogOption,
    createManualQuote,
    formatPrice,
    getCatalogBreakdown,
    getCatalogGroupRule,
    getCatalogOptionPrice,
    getCatalogMeasures,
    getCatalogPickFor,
    getCatalogSizeFor,
    getCatalogSizeText,
    getCatalogVariants,
    getManualQuoteMissing,
    getPanamaTodayText,
    getQuoteQuantityTotal,
    resolveCatalogPick,
    resolveMeasureChange,
    resolveVariantChange,
    toggleCatalogOption,
} from "@/helpers";
import type { ICatalogPick, IManualQuoteDraft, IQuote } from "@/helpers";

import { QuantityStepper } from "./quantity-stepper";
import { useCatalog } from "./use-catalog";

import "./manual-quote-form.css";

interface IManualQuoteFormProps {
    token: string;
    onSaved: (quote: IQuote) => void;
    onCancel: () => void;
    onSessionExpired: () => void;
}

type IManualDetails = Omit<IManualQuoteDraft, keyof ICatalogPick | "quantity">;

const getEmptyDetails = (): IManualDetails => ({
    customerName: "",
    customerPhone: "",
    desiredDate: getPanamaTodayText(),
    note: "",
    status: "confirmada",
});

/** Chip de una opción: un botón que se marca, igual en todo el formulario. */
const Chip = ({
    isOn,
    isDisabled,
    onClick,
    children,
}: {
    isOn: boolean;
    isDisabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) => (
    <button type="button" className="mq-chip" aria-pressed={isOn} disabled={isDisabled} onClick={onClick}>
        {children}
    </button>
);

/**
 * La pastelera anota un pedido que llegó por WhatsApp o en persona. Usa las recetas publicadas, sin
 * fotos ni topper: los personalizados siguen entrando por /cotizador.
 */
export const ManualQuoteForm = ({ token, onSaved, onCancel, onSessionExpired }: IManualQuoteFormProps) => {
    const { catalog, isLoading, error: catalogError, reload } = useCatalog();
    const [pick, setPick] = useState<ICatalogPick>({ productId: null, sizeId: null, optionIds: [] });
    const [details, setDetails] = useState<IManualDetails>(getEmptyDetails);
    // Apagado es una sola; al prenderlo arranca en 2 y el contador no baja de ahí
    const [isMultiple, setIsMultiple] = useState(false);
    const [count, setCount] = useState(2);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const update = (changes: Partial<IManualDetails>) => setDetails((current) => ({ ...current, ...changes }));

    const { product, sizeId, optionIds } = resolveCatalogPick(catalog, pick);
    const chosenSize = product?.sizes.find((size) => size.id === sizeId);
    const quantity = isMultiple ? count : 1;
    const draft: IManualQuoteDraft = { ...details, productId: product?.id ?? null, sizeId, optionIds, quantity };
    const breakdown = product ? getCatalogBreakdown(product, sizeId, optionIds, false) : null;
    const total = getQuoteQuantityTotal(breakdown?.total ?? 0, quantity);
    const missing = getManualQuoteMissing(draft, product);
    const tabs = catalog?.tabs ?? [];
    const tabProducts = catalog?.products.filter((one) => one.tab === product?.tab) ?? [];

    const save = async (event: FormEvent) => {
        event.preventDefault();
        if (missing.length || isSaving) return;
        setIsSaving(true);
        setError("");
        try {
            const { quote } = await createManualQuote(token, draft);
            onSaved(quote);
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) {
                onSessionExpired();
                return;
            }
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos guardar la cotización.");
            setIsSaving(false);
        }
    };

    if (isLoading || catalogError || !catalog?.products.length) {
        return (
            <div className="mq" aria-busy={isLoading}>
                <h2 className="mq-title script">Nueva cotización</h2>
                {isLoading ? (
                    <p className="mq-hint">Cargando las recetas…</p>
                ) : catalogError ? (
                    <>
                        <p className="qp-error" role="alert">{catalogError}</p>
                        <button type="button" className="qp-btn" onClick={() => void reload()}>
                            Reintentar
                        </button>
                    </>
                ) : (
                    <p className="mq-hint">No hay recetas publicadas todavía. Publica una desde la pestaña Recetas.</p>
                )}
                <div className="mq-actions">
                    <button type="button" className="qp-btn" onClick={onCancel}>
                        Cancelar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form className="mq" onSubmit={save} aria-label="Registrar cotización">
            <div className="mq-head">
                <h2 className="mq-title script">Nueva cotización</h2>
                <div className="mq-seg" role="group" aria-label="Tipo">
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            aria-pressed={product?.tab === tab}
                            onClick={() => {
                                const first = catalog.products.find((one) => one.tab === tab);
                                if (first) setPick(getCatalogPickFor(first));
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mq-grid">
                <div className="mq-options">
                    {product ? (
                        <>
                            <fieldset className="mq-fs">
                                <legend>Postre</legend>
                                <div className="mq-chips">
                                    {tabProducts.map((one) => (
                                        <Chip key={one.id} isOn={one.id === product.id} onClick={() => setPick(getCatalogPickFor(one))}>
                                            {one.name}
                                        </Chip>
                                    ))}
                                </div>
                            </fieldset>

                            <fieldset className="mq-fs">
                                <legend>Tamaño</legend>
                                {getCatalogVariants(product).length ? (
                                    <>
                                        <div className="mq-chips">
                                            {getCatalogMeasures(product).map((measure) => {
                                                const shown = getCatalogSizeFor(product, measure, chosenSize?.variant ?? null) ?? product.sizes.find((one) => one.label === measure);
                                                return (
                                                    <Chip
                                                        key={measure}
                                                        isOn={chosenSize?.label === measure}
                                                        onClick={() => setPick({ productId: product.id, sizeId: resolveMeasureChange(product, sizeId, measure)?.id ?? sizeId, optionIds })}
                                                    >
                                                        {measure} <small>{formatPrice(shown?.price ?? 0)}</small>
                                                    </Chip>
                                                );
                                            })}
                                        </div>
                                        <div className="mq-chips" role="radiogroup" aria-label="Altura">
                                            {getCatalogVariants(product).map((variant) => (
                                                <Chip
                                                    key={variant}
                                                    isOn={chosenSize?.variant === variant}
                                                    onClick={() => setPick({ productId: product.id, sizeId: resolveVariantChange(product, sizeId, variant)?.id ?? sizeId, optionIds })}
                                                >
                                                    {variant}
                                                </Chip>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="mq-chips">
                                        {product.sizes.map((size) => (
                                            <Chip key={size.id} isOn={size.id === sizeId} onClick={() => setPick({ productId: product.id, sizeId: size.id, optionIds })}>
                                                {size.label} <small>{formatPrice(size.price)}</small>
                                            </Chip>
                                        ))}
                                    </div>
                                )}
                            </fieldset>

                            {product.groups.map((group) => (
                                <fieldset className="mq-fs" key={group.id}>
                                    <legend>
                                        {group.name} <small>{getCatalogGroupRule(group)}</small>
                                    </legend>
                                    <div className="mq-chips">
                                        {group.options.map((option) => {
                                            const price = getCatalogOptionPrice(option, sizeId);
                                            return (
                                                <Chip
                                                    key={option.id}
                                                    isOn={optionIds.includes(option.id)}
                                                    isDisabled={!canAddCatalogOption(group, optionIds, sizeId, option.id)}
                                                    onClick={() =>
                                                        setPick({ productId: product.id, sizeId, optionIds: toggleCatalogOption(group, optionIds, sizeId, option.id) })
                                                    }
                                                >
                                                    {option.name}
                                                    {price ? <small>+{formatPrice(price)}</small> : null}
                                                </Chip>
                                            );
                                        })}
                                    </div>
                                </fieldset>
                            ))}

                            <p className="mq-hint">Sin fotos ni topper: esto es para recetas del catálogo. Los personalizados siguen entrando por el cotizador de la web.</p>
                        </>
                    ) : null}
                </div>

                <div className="mq-side">
                    <div className="mq-field">
                        <label htmlFor="mq-name">Cliente</label>
                        <input
                            id="mq-name"
                            value={details.customerName}
                            autoComplete="off"
                            maxLength={60}
                            onChange={(event) => update({ customerName: event.target.value })}
                        />
                    </div>
                    <div className="mq-pair">
                        <div className="mq-field">
                            <label htmlFor="mq-phone">
                                Celular <small>opcional</small>
                            </label>
                            <input
                                id="mq-phone"
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="6000-0000"
                                value={details.customerPhone}
                                onChange={(event) => update({ customerPhone: event.target.value })}
                            />
                        </div>
                        <div className="mq-field">
                            <label htmlFor="mq-date">Entrega</label>
                            <input
                                id="mq-date"
                                type="date"
                                value={details.desiredDate}
                                onChange={(event) => update({ desiredDate: event.target.value })}
                            />
                        </div>
                    </div>
                    <div className="mq-field">
                        <label htmlFor="mq-note">
                            Nota <small>opcional</small>
                        </label>
                        <textarea
                            id="mq-note"
                            maxLength={500}
                            value={details.note}
                            onChange={(event) => update({ note: event.target.value })}
                        />
                    </div>

                    <fieldset className="mq-fs">
                        <legend>Estado inicial</legend>
                        <div className="mq-chips">
                            <Chip isOn={details.status === "nueva"} onClick={() => update({ status: "nueva" })}>
                                Nueva
                            </Chip>
                            <Chip isOn={details.status === "confirmada"} onClick={() => update({ status: "confirmada" })}>
                                Confirmada
                            </Chip>
                        </div>
                    </fieldset>

                    <div className="mq-qty">
                        <div className="mq-qty__row">
                            <span id="mq-multi-label">
                                Varias unidades
                                <small>{isMultiple ? "El total se multiplica" : "Apagado: se cotiza 1"}</small>
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={isMultiple}
                                aria-labelledby="mq-multi-label"
                                className="mq-switch"
                                onClick={() => setIsMultiple((current) => !current)}
                            >
                                <span className="mq-switch__track">
                                    <span className="mq-switch__knob" />
                                </span>
                            </button>
                        </div>
                        {isMultiple ? (
                            <div className="mq-qty__row">
                                <span>Cantidad</span>
                                <QuantityStepper
                                    quantity={count}
                                    itemName={product?.name ?? "postre"}
                                    min={2}
                                    max={MAX_QUOTE_QUANTITY}
                                    onChange={setCount}
                                />
                            </div>
                        ) : null}
                    </div>

                    <div className="mq-receipt">
                        <ul className="qp-spec">
                            {product && breakdown ? (
                                <>
                                    <li>
                                        <span>
                                            {product.name} {chosenSize ? getCatalogSizeText(chosenSize) : null}
                                        </span>
                                        <span>{formatPrice(breakdown.base)}</span>
                                    </li>
                                    {breakdown.lines.map((line, index) => (
                                        <li key={`${line.group}-${index}`}>
                                            <span>{line.group} · {line.name}</span>
                                            {line.price ? <span>+{formatPrice(line.price)}</span> : <span className="is-free">incluido</span>}
                                        </li>
                                    ))}
                                    {quantity > 1 ? (
                                        <li>
                                            <span>Cantidad</span>
                                            <span>× {quantity}</span>
                                        </li>
                                    ) : null}
                                </>
                            ) : null}
                            <li className="qp-spec__sum">
                                <span>Total</span>
                                <span>{formatPrice(total)}</span>
                            </li>
                        </ul>

                        {error ? <p className="qp-error" role="alert">{error}</p> : null}
                        {missing.length ? <p className="mq-missing">{missing[0]}</p> : null}

                        <div className="mq-actions">
                            <button type="button" className="qp-btn" onClick={onCancel} disabled={isSaving}>
                                Cancelar
                            </button>
                            <button type="submit" className="qp-btn qp-btn--solid" disabled={isSaving || missing.length > 0}>
                                {isSaving ? "Guardando…" : "Guardar"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
};
