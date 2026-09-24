import { useEffect, useId, useState } from "react";
import type { ChangeEvent } from "react";
import { PiArrowRightBold, PiCheckBold, PiImageBold, PiWhatsappLogoBold } from "react-icons/pi";

import { AnimatedPrice, useCart } from "@/components";
import {
    HttpError,
    MAX_FILLINGS,
    QUOTE_DOUGHS,
    QUOTE_FILLINGS,
    QUOTE_HEIGHTS,
    QUOTE_LEAD_DAYS,
    QUOTE_SIZES,
    TOPPER_PRICE,
    canAddFilling,
    compressImage,
    formatPhone,
    formatPrice,
    getFillingsLabel,
    getQuoteBasePrice,
    getQuoteBreakdown,
    getQuoteMissing,
    getQuoteSurcharge,
    getEarliestQuoteDate,
    getWhatsAppUrl,
    isQuoteSizeAvailable,
    submitQuote,
    trackEvent,
} from "@/helpers";
import type { IQuote, IQuoteDraft, IQuoteOption, QuoteHeight, QuoteSize } from "@/helpers";

import "./cotizador.css";

const INITIAL_DRAFT: IQuoteDraft = {
    size: "6",
    height: 2,
    doughId: QUOTE_DOUGHS[0].id,
    fillingIds: [],
    topper: false,
    customerName: "",
    customerPhone: "",
    desiredDate: "",
    note: "",
    cakeImage: null,
    topperImage: null,
};

const useCotizadorHead = () => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Cotiza tu cake · Chunky Bites";
        return () => {
            document.title = previousTitle;
        };
    }, []);
};

/* ============ Piezas ============ */

/** El cake dibujado: una capa o dos, para que la altura se vea y no solo se lea. */
const CakeDrawing = ({ isDouble }: { isDouble: boolean }) => {
    const top = isDouble ? 22 : 32;

    return (
        <svg className="quote-size__drawing" viewBox="0 0 92 78" aria-hidden="true">
            <ellipse cx="46" cy="72" rx="40" ry="4" fill="var(--mora)" opacity=".14" />
            {isDouble ? (
                <>
                    <rect x="14" y="30" width="64" height="20" rx="5" fill="var(--orquidea)" />
                    <rect x="14" y="50" width="64" height="20" rx="5" fill="var(--mantequilla)" />
                    <rect x="12" y="49" width="68" height="3" fill="var(--crema)" />
                </>
            ) : (
                <rect x="14" y="40" width="64" height="24" rx="5" fill="var(--mantequilla)" />
            )}
            <path
                d={`M14 ${top + 12}q8 -14 16 0t16 0t16 0t16 0H14z`}
                fill="var(--mora)"
                transform={isDouble ? "translate(0,-2)" : undefined}
            />
            <circle cx="46" cy={top - 4} r="4.5" fill="var(--lima)" stroke="var(--mora)" strokeWidth="2" />
        </svg>
    );
};

interface IOptionChipProps {
    type: "radio" | "checkbox";
    name: string;
    option: IQuoteOption;
    price: number;
    checked: boolean;
    disabled?: boolean;
    onChange: () => void;
}

const OptionChip = ({ type, name, option, price, checked, disabled, onChange }: IOptionChipProps) => (
    <label className="quote-chip">
        <input
            id={`${name}-${option.id}`}
            type={type}
            name={name}
            value={option.id}
            checked={checked}
            disabled={disabled}
            onChange={onChange}
        />
        <span className={`quote-chip__body${option.extra ? " quote-chip__body--special" : ""}`}>
            {option.name}
            {option.extra ? <span className="quote-chip__extra">+{formatPrice(price)}</span> : null}
        </span>
    </label>
);

interface IPhotoPickerProps {
    id: string;
    label: string;
    hint: string;
    value: string | null;
    onChange: (value: string | null) => void;
}

/** Foto obligatoria: se achica aquí mismo y se muestra antes de enviar. */
const PhotoPicker = ({ id, label, hint, value, onChange }: IPhotoPickerProps) => {
    const [isReading, setIsReading] = useState(false);
    const [error, setError] = useState("");
    const hintId = useId();

    const pick = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setIsReading(true);
        setError("");
        try {
            onChange(await compressImage(file));
        } catch (readError) {
            setError(readError instanceof Error ? readError.message : "No pudimos leer esa foto.");
        } finally {
            setIsReading(false);
        }
    };

    return (
        <div className="quote-photo">
            <span className="quote-photo__label">
                {label} <span className="quote-photo__req" aria-hidden="true">*</span>
            </span>
            <label className={`quote-photo__drop${value ? " is-filled" : ""}`}>
                <input id={id} type="file" accept="image/*" onChange={pick} aria-describedby={hintId} required />
                <span className="quote-photo__thumb">
                    {value ? <img src={value} alt={`Vista previa: ${label.toLowerCase()}`} /> : <PiImageBold aria-hidden />}
                </span>
                <span className="quote-photo__text">
                    <b>{isReading ? "Preparando la foto…" : value ? "Cambiar foto" : "Subir foto"}</b>
                    <small id={hintId}>{hint}</small>
                </span>
            </label>
            {error ? <p className="quote-photo__error" role="alert">{error}</p> : null}
            {value ? (
                <button type="button" className="quote-photo__remove" onClick={() => onChange(null)}>
                    Quitar foto
                </button>
            ) : null}
        </div>
    );
};

/* ============ Enviada ============ */

const QuoteSent = ({ quote, onRestart }: { quote: IQuote; onRestart: () => void }) => {
    const message =
        `Hola Chunky Bites, soy ${quote.customerName}. Acabo de enviar la cotización ${quote.code} desde la web ` +
        `(total estimado ${formatPrice(quote.total)}). Ya subí mis fotos de referencia.`;

    return (
        <div className="quote-sent" role="status">
            <p className="quote-summary__kicker script">¡listo!</p>
            <h2>Recibimos tu cotización, {quote.customerName.split(" ")[0]}</h2>
            <p className="quote-sent__code script">{quote.code}</p>
            <p>
                Guardamos tu selección y tus fotos. Falta un paso: escríbenos por WhatsApp con este código y te
                respondemos con el total final.
            </p>
            <a className="quote-button" href={getWhatsAppUrl(message)} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("whatsapp_click", "cotizador")}>
                <PiWhatsappLogoBold aria-hidden /> Continuar en WhatsApp
            </a>
            <button type="button" className="quote-button quote-button--ghost" onClick={onRestart}>
                Hacer otra cotización
            </button>
        </div>
    );
};

/* ============ Vista ============ */

export const Cotizador = () => {
    useCotizadorHead();
    const { count: cartCount } = useCart();
    const [draft, setDraft] = useState<IQuoteDraft>(INITIAL_DRAFT);
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState("");
    const [sent, setSent] = useState<IQuote | null>(null);

    const update = <K extends keyof IQuoteDraft>(key: K, value: IQuoteDraft[K]) =>
        setDraft((current) => ({ ...current, [key]: value }));

    // El 4.5" solo viene en doble altura: elegirlo en 1 altura pasa solo a doble
    const selectSize = (size: QuoteSize) =>
        setDraft((current) => ({
            ...current,
            size,
            height: isQuoteSizeAvailable(size, current.height) ? current.height : 2,
        }));

    const toggleFilling = (id: string) =>
        setDraft((current) => ({
            ...current,
            fillingIds: current.fillingIds.includes(id)
                ? current.fillingIds.filter((one) => one !== id)
                : canAddFilling(current.fillingIds, id)
                  ? [...current.fillingIds, id]
                  : current.fillingIds,
        }));

    const { base, lines, total } = getQuoteBreakdown(draft);
    const missing = getQuoteMissing(draft);
    const surcharge = (extra: number) => getQuoteSurcharge(extra, draft.size, draft.height);

    const send = async () => {
        if (missing.length || isSending) return;
        setIsSending(true);
        setSendError("");
        try {
            const { quote } = await submitQuote(draft);
            trackEvent("quote_submit");
            setSent(quote);
            document.getElementById("resumen")?.scrollIntoView({ block: "start" });
        } catch (error) {
            setSendError(
                error instanceof HttpError && error.status < 500
                    ? error.message
                    : "No pudimos enviar tu cotización. Revisa tu conexión e inténtalo otra vez."
            );
        } finally {
            setIsSending(false);
        }
    };

    const restart = () => {
        setSent(null);
        setDraft(INITIAL_DRAFT);
        window.scrollTo(0, 0);
    };

    const includedDoughs = QUOTE_DOUGHS.filter((one) => !one.extra);
    const specialDoughs = QUOTE_DOUGHS.filter((one) => one.extra);
    const includedFillings = QUOTE_FILLINGS.filter((one) => !one.extra);
    const specialFillings = QUOTE_FILLINGS.filter((one) => one.extra);

    return (
        <main className="quote">
            <section className="quote__intro">
                <p className="quote__script script">a tu medida</p>
                <h1>Cotiza tu cake y mira el precio al instante</h1>
                <p>
                    Elige tamaño, masa y rellenos, sube tu foto de referencia y envíanos la cotización. La confirmamos
                    contigo por WhatsApp.
                </p>
            </section>

            <div className="quote__layout">
                <form className="quote__form" onSubmit={(event) => event.preventDefault()} noValidate>
                    <fieldset className="quote-step">
                        <legend className="quote-step__title">
                            <span className="quote-step__n script">1</span>Tamaño y altura
                        </legend>
                        <div className="quote-sizes">
                            {QUOTE_SIZES.map((size) => {
                                const isAvailable = isQuoteSizeAvailable(size, draft.height);
                                const height: QuoteHeight = isAvailable ? draft.height : 2;

                                return (
                                    <label key={size} className="quote-size">
                                        <input
                                            id={`size-${size}`}
                                            type="radio"
                                            name="size"
                                            value={size}
                                            checked={draft.size === size}
                                            onChange={() => selectSize(size)}
                                        />
                                        <span className="quote-size__card">
                                            <CakeDrawing isDouble={height === 2} />
                                            <span className="quote-size__inch">{size}"</span>
                                            <span className="quote-size__price">{formatPrice(getQuoteBasePrice(size, height))}</span>
                                            {isAvailable ? null : <span className="quote-size__note">Solo doble altura</span>}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                        <div className="quote-heights" role="radiogroup" aria-label="Altura">
                            {QUOTE_HEIGHTS.map((height) => (
                                <label key={height.value}>
                                    <input
                                        id={`height-${height.value}`}
                                        type="radio"
                                        name="height"
                                        value={height.value}
                                        checked={draft.height === height.value}
                                        disabled={!isQuoteSizeAvailable(draft.size, height.value)}
                                        onChange={() => update("height", height.value as QuoteHeight)}
                                    />
                                    <span>{height.label}</span>
                                </label>
                            ))}
                        </div>
                        {draft.size === "4.5" ? (
                            <p className="quote-step__hint">El 4.5" solo lo hacemos en doble altura.</p>
                        ) : null}
                    </fieldset>

                    <fieldset className="quote-step">
                        <legend className="quote-step__title">
                            <span className="quote-step__n script">2</span>Masa
                        </legend>
                        <p className="quote-step__hint">Los recargos se ajustan al tamaño y la altura.</p>
                        <p className="quote-group">Incluida</p>
                        <div className="quote-chips">
                            {includedDoughs.map((option) => (
                                <OptionChip
                                    key={option.id}
                                    type="radio"
                                    name="dough"
                                    option={option}
                                    price={0}
                                    checked={draft.doughId === option.id}
                                    onChange={() => update("doughId", option.id)}
                                />
                            ))}
                        </div>
                        <p className="quote-group">Especiales</p>
                        <div className="quote-chips">
                            {specialDoughs.map((option) => (
                                <OptionChip
                                    key={option.id}
                                    type="radio"
                                    name="dough"
                                    option={option}
                                    price={surcharge(option.extra)}
                                    checked={draft.doughId === option.id}
                                    onChange={() => update("doughId", option.id)}
                                />
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className="quote-step">
                        <legend className="quote-step__title">
                            <span className="quote-step__n script">3</span>Rellenos
                        </legend>
                        <span
                            className={`quote-counter${draft.fillingIds.length ? " is-set" : ""}`}
                            aria-live="polite"
                        >
                            {getFillingsLabel(draft.fillingIds)}
                        </span>
                        {[
                            { label: "Incluidos", options: includedFillings },
                            { label: "Especiales", options: specialFillings },
                        ].map((group) => (
                            <div key={group.label}>
                                <p className="quote-group">{group.label}</p>
                                <div className="quote-chips">
                                    {group.options.map((option) => (
                                        <OptionChip
                                            key={option.id}
                                            type="checkbox"
                                            name="filling"
                                            option={option}
                                            price={surcharge(option.extra)}
                                            checked={draft.fillingIds.includes(option.id)}
                                            disabled={!canAddFilling(draft.fillingIds, option.id)}
                                            onChange={() => toggleFilling(option.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                        <p className="quote-step__rule">
                            Elige uno o {MAX_FILLINGS}. Dos rellenos incluidos no se pueden combinar: uno de los dos tiene que
                            ser especial. Cada relleno especial suma su recargo.
                        </p>
                    </fieldset>

                    <fieldset className="quote-step">
                        <legend className="quote-step__title">
                            <span className="quote-step__n script">4</span>Fotos y topper
                        </legend>
                        <div className="quote-extras">
                            <PhotoPicker
                                id="cake-photo"
                                label="Foto de referencia del cake"
                                hint="Una imagen del diseño que te gustaría. JPG o PNG."
                                value={draft.cakeImage}
                                onChange={(value) => update("cakeImage", value)}
                            />

                            <label className="quote-check">
                                <input
                                    id="topper"
                                    type="checkbox"
                                    checked={draft.topper}
                                    onChange={(event) => update("topper", event.target.checked)}
                                />
                                <span className="quote-check__box" aria-hidden="true">
                                    <PiCheckBold />
                                </span>
                                <span className="quote-check__text">
                                    <b>Agregar topper</b>
                                    <small>Un adorno para la parte de arriba del cake.</small>
                                </span>
                                <span className="quote-check__price">+{formatPrice(TOPPER_PRICE)}</span>
                            </label>

                            {draft.topper ? (
                                <PhotoPicker
                                    id="topper-photo"
                                    label="Foto de referencia del topper"
                                    hint="Cómo lo imaginas: letras, figura o personaje."
                                    value={draft.topperImage}
                                    onChange={(value) => update("topperImage", value)}
                                />
                            ) : null}
                        </div>
                    </fieldset>

                    <fieldset className="quote-step">
                        <legend className="quote-step__title">
                            <span className="quote-step__n script">5</span>Tus datos
                        </legend>
                        <div className="quote-fields">
                            <div className="quote-field">
                                <label htmlFor="quote-name">Tu nombre</label>
                                <input
                                    id="quote-name"
                                    type="text"
                                    autoComplete="name"
                                    value={draft.customerName}
                                    onChange={(event) => update("customerName", event.target.value)}
                                />
                            </div>
                            <div className="quote-field">
                                <label htmlFor="quote-phone">WhatsApp</label>
                                <input
                                    id="quote-phone"
                                    type="tel"
                                    inputMode="tel"
                                    autoComplete="tel-national"
                                    placeholder="6123-4567"
                                    value={draft.customerPhone}
                                    onChange={(event) => update("customerPhone", formatPhone(event.target.value))}
                                />
                            </div>
                            <div className="quote-field">
                                <label htmlFor="quote-date">Fecha deseada</label>
                                <input
                                    id="quote-date"
                                    type="date"
                                    min={getEarliestQuoteDate()}
                                    aria-describedby="quote-date-hint"
                                    value={draft.desiredDate}
                                    onChange={(event) => update("desiredDate", event.target.value)}
                                />
                                <small id="quote-date-hint" className="quote-field__hint">
                                    Con {QUOTE_LEAD_DAYS} días de anticipación como mínimo.
                                </small>
                            </div>
                            <div className="quote-field quote-field--wide">
                                <label htmlFor="quote-note">Nota (opcional)</label>
                                <textarea
                                    id="quote-note"
                                    maxLength={500}
                                    placeholder="Detalles de entrega o cualquier comentario sobre la preparación"
                                    value={draft.note}
                                    onChange={(event) => update("note", event.target.value)}
                                />
                            </div>
                        </div>
                    </fieldset>
                </form>

                <aside className="quote-summary" id="resumen" aria-label="Resumen de tu cake">
                    {sent ? (
                        <QuoteSent quote={sent} onRestart={restart} />
                    ) : (
                        <>
                            <p className="quote-summary__kicker script">tu cake</p>
                            <ul className="quote-lines">
                                <li>
                                    <span className="quote-lines__what">Tamaño</span>
                                    <span className="quote-lines__name">
                                        Cake de {draft.size}" · {draft.height === 2 ? "doble altura" : "1 altura"}
                                    </span>
                                    <span className="quote-lines__amount">{formatPrice(base)}</span>
                                </li>
                                {lines.map((line) => (
                                    <li key={line.label}>
                                        <span className="quote-lines__what">{line.label}</span>
                                        <span className="quote-lines__name">{line.name}</span>
                                        {line.price ? (
                                            <span className="quote-lines__amount">+{formatPrice(line.price)}</span>
                                        ) : (
                                            <span className="quote-lines__amount is-free">incluido</span>
                                        )}
                                    </li>
                                ))}
                                {!draft.fillingIds.length ? (
                                    <li>
                                        <span className="quote-lines__what">Rellenos</span>
                                        <span className="quote-lines__name is-empty">Elige al menos uno</span>
                                    </li>
                                ) : null}
                            </ul>
                            <div className="quote-total">
                                <span>Total estimado</span>
                                <AnimatedPrice value={total} className="quote-total__value" />
                            </div>
                            <p className="quote-summary__fine">
                                Precio estimado. Lo confirmamos contigo por WhatsApp antes de preparar nada.
                            </p>
                            {missing.length ? (
                                <ul className="quote-missing" aria-live="polite">
                                    {missing.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            ) : null}
                            {sendError ? <p className="quote-summary__error" role="alert">{sendError}</p> : null}
                            <button
                                type="button"
                                className="quote-button"
                                onClick={send}
                                disabled={missing.length > 0 || isSending}
                            >
                                {isSending ? "Enviando…" : "Enviar cotización"}
                            </button>
                        </>
                    )}
                </aside>
            </div>

            {/* En el celular el resumen queda abajo: esta barra muestra el total mientras se elige */}
            {!sent && cartCount === 0 ? (
                <div className="quote-bar">
                    <div>
                        <span className="quote-bar__label">Total estimado</span>
                        <AnimatedPrice value={total} className="quote-bar__value" />
                    </div>
                    <a href="#resumen" className="quote-bar__link">
                        Revisar y enviar <PiArrowRightBold aria-hidden />
                    </a>
                </div>
            ) : null}
        </main>
    );
};
