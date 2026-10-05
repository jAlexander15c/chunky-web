import { useCallback, useRef, useState } from "react";

import { FullSheet, SheetChevron } from "@/components";
import { HttpError, formatQuantity } from "@/helpers";
import { registerProductWaste } from "@/helpers/inventory";
import { MANUAL_WASTE_CHOICES } from "@/helpers/product-waste";
import type { IBatchProductStatus, ManualWasteReason } from "@/helpers/product-waste";

interface IProductWasteDialogProps {
    token: string;
    /** Solo los productos por lotes con unidades utilizables. */
    products: IBatchProductStatus[];
    onSaved: () => Promise<void>;
    onSessionExpired: () => void;
    /** Cambia a "Insumo": sigue el flujo de siempre. */
    onChooseSupply: () => void;
    onClose: () => void;
}

const NOTE_MAX_LENGTH = 200;

const matchesName = (name: string, query: string) => name.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es"));

/** Hoja a pantalla completa con buscador para elegir el producto, como en Salida sin venta. */
const ProductPicker = ({
    products,
    onPick,
    onClose,
}: {
    products: IBatchProductStatus[];
    onPick: (product: IBatchProductStatus) => void;
    onClose: () => void;
}) => {
    const [search, setSearch] = useState("");
    const matches = products.filter((product) => matchesName(product.name, search));

    return (
        <FullSheet title="¿Qué producto?" onClose={onClose}>
            {(close) => (
                <div className="ges-pick">
                    <input
                        className="ges-search"
                        type="search"
                        placeholder="Buscar producto"
                        aria-label="Buscar producto"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className="fsheet__choices">
                        {matches.length === 0 ? <p className="ges-empty">Ningún producto coincide.</p> : null}
                        {matches.map((product) => (
                            <button key={product.variantId} type="button" className="fsheet__choice" onClick={() => close(() => onPick(product))}>
                                <span>{product.name}</span>
                                <small>quedan {formatQuantity(product.stock)}</small>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </FullSheet>
    );
};

/** "Se dañó" sobre un producto por lotes: baja unidades del lote más viejo y deja el motivo para la merma. */
export const ProductWasteDialog = ({ token, products, onSaved, onSessionExpired, onChooseSupply, onClose }: IProductWasteDialogProps) => {
    const [variantId, setVariantId] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [reason, setReason] = useState<ManualWasteReason>("danado");
    const [note, setNote] = useState("");
    const [isPicking, setIsPicking] = useState(false);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    // Un reintento con lo mismo (se perdió la respuesta) no resta dos veces; si algo cambia, es otra merma
    const requestId = useRef(crypto.randomUUID());
    const closePicker = useCallback(() => setIsPicking(false), []);

    const product = products.find((one) => one.variantId === variantId) ?? null;
    const stock = product?.stock ?? 0;
    const amount = Number(quantity);
    const isAmountValid = Number.isInteger(amount) && amount > 0 && amount <= stock;

    const edit = (apply: () => void) => {
        apply();
        requestId.current = crypto.randomUUID();
        setError("");
    };

    const chooseProduct = (next: IBatchProductStatus) =>
        edit(() => {
            setVariantId(next.variantId);
            // Si ya había una cantidad escrita, que no pase de lo que hay
            setQuantity((current) => String(Math.min(Math.max(1, Number(current) || 1), next.stock)));
        });

    const stepQuantity = (delta: number) =>
        edit(() => setQuantity(String(Math.min(stock, Math.max(1, (Number.isInteger(amount) ? amount : 0) + delta)))));

    const submit = async () => {
        if (!product) return setError("Elige el producto que se dañó.");
        if (!isAmountValid) return setError(`Escribe cuántas fueron, de 1 a ${formatQuantity(stock)}.`);

        setIsSending(true);
        setError("");
        try {
            await registerProductWaste(token, product.variantId, {
                quantity: amount,
                reason,
                ...(note.trim() && { note: note.trim() }),
                requestId: requestId.current,
            });
            await onSaved();
            onClose();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos registrar la merma. Puedes reintentar.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Se dañó">
            <div className="ges-modal__panel">
                <h3 className="script">Se dañó</h3>

                <div className="ges-seg" role="tablist" aria-label="Qué se dañó">
                    <button type="button" role="tab" aria-selected="true">
                        Producto
                    </button>
                    <button type="button" role="tab" aria-selected="false" disabled={isSending} onClick={onChooseSupply}>
                        Insumo
                    </button>
                </div>

                {products.length === 0 ? (
                    <p className="ges-empty">Ningún producto por lotes tiene unidades ahora. Si fue un insumo, toca «Insumo».</p>
                ) : (
                    <fieldset disabled={isSending} className="ges-waste__fields">
                        <div className="ges-field">
                            <span>¿Qué producto?</span>
                            <button type="button" className="ges-waste__pick" aria-haspopup="dialog" onClick={() => setIsPicking(true)}>
                                <span className={product ? "" : "is-empty"}>{product ? product.name : "Elige un producto"}</span>
                                {product ? <small>quedan {formatQuantity(stock)}</small> : null}
                                <SheetChevron />
                            </button>
                        </div>

                        <div className="ges-field">
                            <span id="ges-waste-qty">¿Cuántas?</span>
                            <div className="lot__stepper" role="group" aria-labelledby="ges-waste-qty">
                                <button type="button" className="lot__step" aria-label="Una menos" disabled={!product || amount <= 1} onClick={() => stepQuantity(-1)}>
                                    −
                                </button>
                                <input
                                    className="dlg__input"
                                    type="text"
                                    inputMode="numeric"
                                    aria-label="Cantidad"
                                    value={quantity}
                                    onChange={(event) => edit(() => setQuantity(event.target.value.replace(/\D/g, "")))}
                                />
                                <button type="button" className="lot__step" aria-label="Una más" disabled={!product || amount >= stock} onClick={() => stepQuantity(1)}>
                                    +
                                </button>
                            </div>
                        </div>

                        <div className="ges-field" role="group" aria-label="¿Qué pasó?">
                            <span>¿Qué pasó?</span>
                            <div className="ges-waste__reasons">
                                {MANUAL_WASTE_CHOICES.map((choice) => (
                                    <button
                                        key={choice.id}
                                        type="button"
                                        className="ges-waste__reason"
                                        aria-pressed={reason === choice.id}
                                        onClick={() => edit(() => setReason(choice.id))}
                                    >
                                        {choice.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="ges-field">
                            <span>Nota (opcional)</span>
                            <input
                                value={note}
                                maxLength={NOTE_MAX_LENGTH}
                                placeholder="Ej. se quebraron al sacarlas del molde"
                                onChange={(event) => edit(() => setNote(event.target.value))}
                            />
                        </label>

                        {product && isAmountValid ? (
                            <p className="ges-field__hint">Sale del lote más viejo. Quedarán {formatQuantity(stock - amount)}.</p>
                        ) : null}
                    </fieldset>
                )}

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" disabled={isSending} onClick={onClose}>
                        Cancelar
                    </button>
                    <button type="button" className="ges-btn ges-btn--solid" disabled={isSending || products.length === 0 || !product || !isAmountValid} onClick={() => void submit()}>
                        {isSending ? "Registrando…" : isAmountValid ? `Registrar ${amount} de merma` : "Registrar merma"}
                    </button>
                </div>
            </div>

            {isPicking ? <ProductPicker products={products} onPick={chooseProduct} onClose={closePicker} /> : null}
        </div>
    );
};
