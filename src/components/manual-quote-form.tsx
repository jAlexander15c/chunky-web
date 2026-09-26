import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import {
    DESSERT_SIZES,
    HttpError,
    QUOTE_DESSERTS,
    QUOTE_DOUGHS,
    QUOTE_FILLINGS,
    QUOTE_HEIGHTS,
    QUOTE_SIZES,
    canAddFilling,
    createManualQuote,
    formatPrice,
    getDessertPrice,
    getFillingsLabel,
    getManualQuoteMissing,
    getPanamaTodayText,
    getQuoteBreakdown,
    getQuoteDessert,
    getQuoteSurcharge,
    isQuoteSizeAvailable,
} from "@/helpers";
import type { IManualQuoteDraft, IQuote, QuoteSize } from "@/helpers";

import "./manual-quote-form.css";

interface IManualQuoteFormProps {
    token: string;
    onSaved: (quote: IQuote) => void;
    onCancel: () => void;
    onSessionExpired: () => void;
}

const getEmptyDraft = (): IManualQuoteDraft => ({
    kind: "cake",
    size: "6",
    height: 2,
    doughId: QUOTE_DOUGHS[0].id,
    fillingIds: [],
    dessertId: QUOTE_DESSERTS[0].id,
    dessertSize: "8",
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
 * La pastelera anota un pedido que llegó por WhatsApp o en persona. Solo cakes del catálogo y
 * postres, sin fotos ni topper: los personalizados siguen entrando por /cotizador.
 */
export const ManualQuoteForm = ({ token, onSaved, onCancel, onSessionExpired }: IManualQuoteFormProps) => {
    const [draft, setDraft] = useState<IManualQuoteDraft>(getEmptyDraft);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const update = (changes: Partial<IManualQuoteDraft>) => setDraft((current) => ({ ...current, ...changes }));

    // El 4.5" solo va en doble altura: al elegirlo se sube la altura
    const changeSize = (size: QuoteSize) =>
        update({ size, height: isQuoteSizeAvailable(size, draft.height) ? draft.height : 2 });

    const toggleFilling = (id: string) =>
        update({
            fillingIds: draft.fillingIds.includes(id)
                ? draft.fillingIds.filter((one) => one !== id)
                : [...draft.fillingIds, id],
        });

    const breakdown = getQuoteBreakdown({ ...draft, topper: false });
    const dessert = getQuoteDessert(draft.dessertId);
    const dessertPrice = getDessertPrice(dessert, draft.dessertSize);
    const missing = getManualQuoteMissing(draft);

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

    return (
        <form className="mq" onSubmit={save} aria-label="Registrar cotización">
            <div className="mq-head">
                <h2 className="mq-title script">Nueva cotización</h2>
                <div className="mq-seg" role="group" aria-label="Tipo">
                    <button type="button" aria-pressed={draft.kind === "cake"} onClick={() => update({ kind: "cake" })}>
                        Cake
                    </button>
                    <button type="button" aria-pressed={draft.kind === "postre"} onClick={() => update({ kind: "postre" })}>
                        Flan y cheesecake
                    </button>
                </div>
            </div>

            <div className="mq-grid">
                <div className="mq-options">
                    {draft.kind === "cake" ? (
                        <>
                            <fieldset className="mq-fs">
                                <legend>Tamaño</legend>
                                <div className="mq-chips">
                                    {QUOTE_SIZES.map((size) => (
                                        <Chip key={size} isOn={draft.size === size} onClick={() => changeSize(size)}>
                                            {size}"
                                        </Chip>
                                    ))}
                                </div>
                            </fieldset>

                            <fieldset className="mq-fs">
                                <legend>Altura</legend>
                                <div className="mq-chips">
                                    {QUOTE_HEIGHTS.map((height) => (
                                        <Chip
                                            key={height.value}
                                            isOn={draft.height === height.value}
                                            isDisabled={!isQuoteSizeAvailable(draft.size, height.value)}
                                            onClick={() => update({ height: height.value })}
                                        >
                                            {height.label}
                                        </Chip>
                                    ))}
                                </div>
                            </fieldset>

                            <fieldset className="mq-fs">
                                <legend>Masa</legend>
                                <div className="mq-chips">
                                    {QUOTE_DOUGHS.map((dough) => {
                                        const extra = getQuoteSurcharge(dough.extra, draft.size, draft.height);
                                        return (
                                            <Chip key={dough.id} isOn={draft.doughId === dough.id} onClick={() => update({ doughId: dough.id })}>
                                                {dough.name}
                                                {extra ? <small>+{formatPrice(extra)}</small> : null}
                                            </Chip>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <fieldset className="mq-fs">
                                <legend>
                                    Rellenos <small>{getFillingsLabel(draft.fillingIds)}</small>
                                </legend>
                                <div className="mq-chips">
                                    {QUOTE_FILLINGS.map((filling) => {
                                        const extra = getQuoteSurcharge(filling.extra, draft.size, draft.height);
                                        return (
                                            <Chip
                                                key={filling.id}
                                                isOn={draft.fillingIds.includes(filling.id)}
                                                isDisabled={!canAddFilling(draft.fillingIds, filling.id)}
                                                onClick={() => toggleFilling(filling.id)}
                                            >
                                                {filling.name}
                                                {extra ? <small>+{formatPrice(extra)}</small> : null}
                                            </Chip>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <p className="mq-hint">Sin fotos ni topper: esto es para cakes del catálogo. Los personalizados siguen entrando por el cotizador de la web.</p>
                        </>
                    ) : (
                        <>
                            <fieldset className="mq-fs">
                                <legend>Postre</legend>
                                <div className="mq-chips">
                                    {QUOTE_DESSERTS.map((one) => (
                                        <Chip key={one.id} isOn={draft.dessertId === one.id} onClick={() => update({ dessertId: one.id })}>
                                            {one.name}
                                        </Chip>
                                    ))}
                                </div>
                            </fieldset>

                            <fieldset className="mq-fs">
                                <legend>Tamaño</legend>
                                <div className="mq-chips">
                                    {DESSERT_SIZES.map((size) => (
                                        <Chip key={size} isOn={draft.dessertSize === size} onClick={() => update({ dessertSize: size })}>
                                            {size}" <small>{formatPrice(getDessertPrice(dessert, size))}</small>
                                        </Chip>
                                    ))}
                                </div>
                            </fieldset>
                        </>
                    )}
                </div>

                <div className="mq-side">
                    <div className="mq-field">
                        <label htmlFor="mq-name">Cliente</label>
                        <input
                            id="mq-name"
                            value={draft.customerName}
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
                                value={draft.customerPhone}
                                onChange={(event) => update({ customerPhone: event.target.value })}
                            />
                        </div>
                        <div className="mq-field">
                            <label htmlFor="mq-date">Entrega</label>
                            <input
                                id="mq-date"
                                type="date"
                                value={draft.desiredDate}
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
                            value={draft.note}
                            onChange={(event) => update({ note: event.target.value })}
                        />
                    </div>

                    <fieldset className="mq-fs">
                        <legend>Estado inicial</legend>
                        <div className="mq-chips">
                            <Chip isOn={draft.status === "nueva"} onClick={() => update({ status: "nueva" })}>
                                Nueva
                            </Chip>
                            <Chip isOn={draft.status === "confirmada"} onClick={() => update({ status: "confirmada" })}>
                                Confirmada
                            </Chip>
                        </div>
                    </fieldset>

                    <div className="mq-receipt">
                        <ul className="qp-spec">
                            {draft.kind === "cake" ? (
                                <>
                                    <li>
                                        <span>Cake {draft.size}" · {draft.height === 2 ? "doble altura" : "1 altura"}</span>
                                        <span>{formatPrice(breakdown.base)}</span>
                                    </li>
                                    {breakdown.lines.map((line) => (
                                        <li key={line.label}>
                                            <span>{line.label} · {line.name}</span>
                                            {line.price ? <span>+{formatPrice(line.price)}</span> : <span className="is-free">incluido</span>}
                                        </li>
                                    ))}
                                </>
                            ) : (
                                <li>
                                    <span>{dessert.name} {draft.dessertSize}"</span>
                                    <span>{formatPrice(dessertPrice)}</span>
                                </li>
                            )}
                            <li className="qp-spec__sum">
                                <span>Total</span>
                                <span>{formatPrice(draft.kind === "cake" ? breakdown.total : dessertPrice)}</span>
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
