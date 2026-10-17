import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { PiArrowRightBold, PiCheckBold, PiImageBold, PiWhatsappLogoBold } from "react-icons/pi";

import { AnimatedPrice, QuantityStepper, QuoteGallery, useCart, useCatalog } from "@/components";
import {
    HttpError,
    MAX_QUOTE_QUANTITY,
    QUOTE_LEAD_DAYS,
    canAddCatalogOption,
    compressImage,
    formatPhone,
    formatPrice,
    getCatalogBreakdown,
    getCatalogGroupRule,
    getCatalogOptionPrice,
    getCatalogMeasures,
    getCatalogPickFor,
    getCatalogSizeFor,
    getCatalogSizeText,
    getCatalogVariants,
    isDoubleVariant,
    getEarliestQuoteDate,
    getQuoteMissing,
    getQuoteQuantityTotal,
    getWhatsAppUrl,
    resolveCatalogPick,
    resolveMeasureChange,
    resolveVariantChange,
    submitQuote,
    toggleCatalogOption,
    trackEvent,
} from "@/helpers";
import type { ICatalogGroup, ICatalogOption, ICatalogPick, ICatalogProduct, IQuote, IQuoteDraft, QuoteKind } from "@/helpers";

import "./cotizador.css";

type ICustomerDraft = Omit<IQuoteDraft, keyof ICatalogPick | "topper" | "cakeImage" | "topperImage" | "quantity">;

const INITIAL_CUSTOMER: ICustomerDraft = {
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    desiredDate: "",
    note: "",
    privacyConsent: false,
};

const INITIAL_PICK: ICatalogPick = { productId: null, sizeId: null, optionIds: [] };

/** Pasos del embudo del cotizador (quote_step). Los de antes se conservan: masa y rellenos son el primer grupo de opciones y los demás. */
type QuoteStep = "postre" | "tamano" | "masa" | "rellenos" | "fotos" | "datos";

/** El tablero separa el embudo en cakes (con foto) y postres enteros: se sigue mandando así. */
const getTrackKind = (product: ICatalogProduct): QuoteKind => (product.needsPhoto ? "cake" : "postre");

/** Marca cada paso una sola vez por tipo: el tablero cuenta sesiones, no clics. */
const useQuoteStepTracking = () => {
    const tracked = useRef(new Set<string>());
    return useCallback((kind: QuoteKind, step: QuoteStep) => {
        const key = `${kind}:${step}`;
        if (tracked.current.has(key)) return;
        tracked.current.add(key);
        trackEvent("quote_step", step, kind);
    }, []);
};

const useCotizadorHead = () => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = "Cotiza tu postre · Chunky Bites";
        return () => {
            document.title = previousTitle;
        };
    }, []);
};

/* ============ Piezas ============ */

/** El cake dibujado: dos capas, para las recetas que piden foto de referencia. */
const CakeDrawing = () => (
    <svg className="quote-dessert__drawing" viewBox="0 0 92 78" aria-hidden="true">
        <ellipse cx="46" cy="72" rx="40" ry="4" fill="var(--mora)" opacity=".14" />
        <rect x="14" y="30" width="64" height="20" rx="5" fill="var(--orquidea)" />
        <rect x="14" y="50" width="64" height="20" rx="5" fill="var(--mantequilla)" />
        <rect x="12" y="49" width="68" height="3" fill="var(--crema)" />
        <path d="M14 34q8 -14 16 0t16 0t16 0t16 0H14z" fill="var(--mora)" transform="translate(0,-2)" />
        <circle cx="46" cy="18" r="4.5" fill="var(--lima)" stroke="var(--mora)" strokeWidth="2" />
    </svg>
);

/** El cake de cada tamaño dibujado con una capa o dos, para que la altura se vea y no solo se lea. */
const HeightDrawing = ({ isDouble }: { isDouble: boolean }) => {
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

const DESSERT_COLORS: Record<string, { body: string; top: string }> = {
    flan: { body: "var(--mantequilla)", top: "#b8742a" },
    beso: { body: "var(--crema)", top: "var(--orquidea)" },
    cheesecake: { body: "var(--mantequilla)", top: "var(--lima)" },
};

const DEFAULT_DESSERT_COLORS = { body: "var(--mantequilla)", top: "var(--orquidea)" };

/** Los colores de los postres conocidos salen del nombre; cualquier receta nueva usa los de siempre. */
const getDessertColors = (name: string) => {
    const lower = name.toLowerCase();
    const key = Object.keys(DESSERT_COLORS).find((one) => lower.includes(one));
    return key ? DESSERT_COLORS[key] : DEFAULT_DESSERT_COLORS;
};

/** El postre dibujado: una sola capa baja con su cobertura. */
const DessertDrawing = ({ name }: { name: string }) => {
    const colors = getDessertColors(name);

    return (
        <svg className="quote-dessert__drawing" viewBox="0 0 92 70" aria-hidden="true">
            <ellipse cx="46" cy="64" rx="40" ry="4" fill="var(--mora)" opacity=".14" />
            <rect x="12" y="30" width="68" height="30" rx="6" fill={colors.body} stroke="var(--mora)" strokeWidth="2" />
            <path d="M12 36q9 10 17 0t17 0t17 0t17 0V30H12z" fill={colors.top} />
        </svg>
    );
};

interface ICustomerStepProps {
    step: number;
    draft: ICustomerDraft;
    update: <K extends keyof ICustomerDraft>(key: K, value: ICustomerDraft[K]) => void;
}

/** Los datos del cliente: iguales para un cake y un postre, y se conservan al cambiar de pestaña. */
const CustomerStep = ({ step, draft, update }: ICustomerStepProps) => (
    <fieldset className="quote-step">
        <legend className="quote-step__title">
            <span className="quote-step__n script">{step}</span>Tus datos
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
                <label htmlFor="quote-email">Correo</label>
                <input
                    id="quote-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="off"
                    spellCheck={false}
                    maxLength={254}
                    placeholder="tu@correo.com"
                    aria-describedby="quote-email-hint"
                    value={draft.customerEmail}
                    onChange={(event) => update("customerEmail", event.target.value)}
                />
                <small id="quote-email-hint" className="quote-field__hint">
                    Te mandamos ahí el resumen y la confirmación.
                </small>
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
            <div className="quote-field quote-field--wide">
                <label className="quote-consent" htmlFor="quote-privacy">
                    <input
                        id="quote-privacy"
                        type="checkbox"
                        checked={draft.privacyConsent}
                        onChange={(event) => update("privacyConsent", event.target.checked)}
                    />
                    <span>
                        Acepto el <a href="/privacidad" target="_blank" rel="noopener">aviso de privacidad</a>: usan
                        mi nombre, WhatsApp y correo para cotizar y coordinar mi pedido.
                    </span>
                </label>
            </div>
        </div>
    </fieldset>
);

interface IOptionChipProps {
    type: "radio" | "checkbox";
    name: string;
    option: ICatalogOption;
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
        <span className={`quote-chip__body${price ? " quote-chip__body--special" : ""}`}>
            {option.name}
            {price ? <span className="quote-chip__extra">+{formatPrice(price)}</span> : null}
        </span>
    </label>
);

/** Cómo se elige un grupo: "Elige 1", "Elige de 1 a 2"… y cuántas pueden ir sin recargo. */
const getGroupHint = (group: ICatalogGroup) =>
    group.freeMax !== null && group.max > 1
        ? `${getCatalogGroupRule(group)}. ${group.freeMax === 0 ? "Todas suman su recargo." : `Máximo ${group.freeMax} sin recargo: las demás suman el suyo.`}`
        : getCatalogGroupRule(group);

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

const QuoteSent = ({ quote, hasPhotos, onRestart }: { quote: IQuote; hasPhotos: boolean; onRestart: () => void }) => {
    const message =
        `Hola Chunky Bites, soy ${quote.customerName}. Acabo de enviar la cotización ${quote.code} desde la web ` +
        `(total estimado ${formatPrice(quote.total)}).${hasPhotos ? " Ya subí mis fotos de referencia." : ""}`;

    return (
        <div className="quote-sent" role="status">
            <p className="quote-summary__kicker script">¡listo!</p>
            <h2>Recibimos tu cotización, {quote.customerName.split(" ")[0]}</h2>
            <p className="quote-sent__code script">{quote.code}</p>
            <p>
                Guardamos tu selección{hasPhotos ? " y tus fotos" : ""}. Te mandamos el resumen a <b>{quote.customerEmail}</b>. La
                pastelera la revisa y te llega otro correo cuando la confirme.
            </p>
            <p>Si quieres adelantar algo, escríbenos por WhatsApp con este código.</p>
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
    const { catalog, isLoading, error: catalogError, reload, refresh } = useCatalog();
    const [pick, setPick] = useState<ICatalogPick>(INITIAL_PICK);
    const [customer, setCustomer] = useState<ICustomerDraft>(INITIAL_CUSTOMER);
    const [topper, setTopper] = useState(false);
    const [quantity, setQuantity] = useState(1);
    const [cakeImage, setCakeImage] = useState<string | null>(null);
    const [topperImage, setTopperImage] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState("");
    const [sent, setSent] = useState<{ quote: IQuote; hasPhotos: boolean } | null>(null);

    const markStep = useQuoteStepTracking();

    const { product, sizeId, optionIds } = resolveCatalogPick(catalog, pick);
    const size = product?.sizes.find((one) => one.id === sizeId);
    const variants = product ? getCatalogVariants(product) : [];
    const hasTopper = Boolean(product?.allowsTopper && topper);
    const breakdown = product ? getCatalogBreakdown(product, sizeId, optionIds, hasTopper) : null;
    const unitTotal = breakdown?.total ?? 0;
    const total = getQuoteQuantityTotal(unitTotal, quantity);
    const draft: IQuoteDraft = {
        ...customer,
        productId: product?.id ?? null,
        sizeId,
        optionIds,
        topper: hasTopper,
        cakeImage,
        topperImage,
        quantity,
    };
    const missing = getQuoteMissing(draft, product);

    const updateCustomer = <K extends keyof ICustomerDraft>(key: K, value: ICustomerDraft[K]) => {
        if (product && key !== "privacyConsent") markStep(getTrackKind(product), "datos");
        setCustomer((current) => ({ ...current, [key]: value }));
    };

    const selectProduct = (next: ICatalogProduct) => {
        markStep(getTrackKind(next), "postre");
        setPick(getCatalogPickFor(next));
        setTopper(false);
        setTopperImage(null);
    };

    const selectSize = (id: number | null) => {
        if (!product || id === null) return;
        markStep(getTrackKind(product), "tamano");
        setPick({ productId: product.id, sizeId: id, optionIds });
    };

    const toggleOption = (group: ICatalogGroup, groupIndex: number, optionId: number) => {
        if (!product) return;
        markStep(getTrackKind(product), groupIndex === 0 ? "masa" : "rellenos");
        setPick({ productId: product.id, sizeId, optionIds: toggleCatalogOption(group, optionIds, sizeId, optionId) });
    };

    const send = async () => {
        if (!product || !size || missing.length || isSending) return;
        setIsSending(true);
        setSendError("");
        try {
            const { quote } = await submitQuote(draft, product, total);
            trackEvent("quote_submit", getTrackKind(product), `${product.name} ${getCatalogSizeText(size)}`, quote.total);
            setSent({ quote, hasPhotos: product.needsPhoto });
            document.getElementById("resumen")?.scrollIntoView({ block: "start" });
        } catch (error) {
            if (error instanceof HttpError && error.status === 409 && error.code === "PRICE_CHANGED") {
                // El precio cambió mientras armaba: se vuelve a pedir el catálogo y se avisa
                await refresh();
                setSendError("El precio cambió, revisa el total");
            } else {
                setSendError(
                    error instanceof HttpError && error.status < 500
                        ? error.message
                        : "No pudimos enviar tu cotización. Revisa tu conexión e inténtalo otra vez."
                );
            }
        } finally {
            setIsSending(false);
        }
    };

    const restart = () => {
        setSent(null);
        setPick((current) => ({ ...INITIAL_PICK, productId: current.productId }));
        setCustomer(INITIAL_CUSTOMER);
        setTopper(false);
        setQuantity(1);
        setCakeImage(null);
        setTopperImage(null);
        window.scrollTo(0, 0);
    };

    const tabProducts = catalog?.products.filter((one) => one.tab === product?.tab) ?? [];
    // Con un solo postre en la pestaña no hay nada que elegir: el paso se esconde y los demás suben un número
    const showProductStep = tabProducts.length > 1;
    const sizeStep = showProductStep ? 2 : 1;
    const hasExtras = Boolean(product && (product.needsPhoto || product.allowsTopper));
    const groupsCount = product?.groups.length ?? 0;
    const extrasStep = sizeStep + 1 + groupsCount;
    const customerStep = extrasStep + (hasExtras ? 1 : 0);
    const isReady = Boolean(product && !isLoading && !catalogError);

    return (
        <main className="quote">
            <div className="quote__top">
                <section className="quote__intro">
                    <p className="quote__script script">a tu medida</p>
                    <h1>Cotiza tu postre y mira el precio al instante</h1>
                    <p>
                        {product?.needsPhoto
                            ? "Elige tamaño y opciones, sube tu foto de referencia y envíanos la cotización."
                            : "Elige el postre, el tamaño y envíanos la cotización."}{" "}
                        Te la confirmamos por correo.
                    </p>
                </section>
                <QuoteGallery />
            </div>

            {isLoading ? (
                <div className="quote-skeleton" aria-busy="true" aria-label="Cargando los postres">
                    <span /> <span /> <span />
                </div>
            ) : catalogError ? (
                <div className="quote-notice" role="alert">
                    <p>{catalogError}</p>
                    <button type="button" className="quote-button" onClick={() => void reload()}>
                        Reintentar
                    </button>
                </div>
            ) : !product ? (
                <div className="quote-notice">
                    <p className="quote__script script">Muy pronto</p>
                    <p>Estamos preparando los postres para cotizar. Vuelve en unos días.</p>
                </div>
            ) : null}

            {isReady && catalog && product ? (
                <>
                    {catalog.tabs.length > 1 ? (
                        <div className="quote-kinds" role="radiogroup" aria-label="Qué quieres cotizar">
                            {catalog.tabs.map((tab) => (
                                <label key={tab}>
                                    <input
                                        id={`kind-${tab}`}
                                        type="radio"
                                        name="kind"
                                        value={tab}
                                        checked={product.tab === tab}
                                        onChange={() => {
                                            const first = catalog.products.find((one) => one.tab === tab);
                                            if (first) selectProduct(first);
                                        }}
                                    />
                                    <span>{tab}</span>
                                </label>
                            ))}
                        </div>
                    ) : null}

                    <div className="quote__layout">
                        <form className="quote__form" onSubmit={(event) => event.preventDefault()} noValidate>
                            {showProductStep ? (
                                <fieldset className="quote-step">
                                    <legend className="quote-step__title">
                                        <span className="quote-step__n script">1</span>Postre
                                    </legend>
                                    <div className="quote-desserts">
                                        {tabProducts.map((option) => (
                                            <label key={option.id} className="quote-size quote-dessert">
                                                <input
                                                    id={`product-${option.id}`}
                                                    type="radio"
                                                    name="product"
                                                    value={option.id}
                                                    checked={product.id === option.id}
                                                    onChange={() => selectProduct(option)}
                                                />
                                                <span className="quote-size__card">
                                                    {option.needsPhoto ? <CakeDrawing /> : <DessertDrawing name={option.name} />}
                                                    <span className="quote-dessert__text">
                                                        <b>{option.name}</b>
                                                        {option.description ? <small>{option.description}</small> : null}
                                                    </span>
                                                    {option.sizes.length ? (
                                                        <span className="quote-size__price">
                                                            desde {formatPrice(Math.min(...option.sizes.map((one) => one.price)))}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            ) : null}

                            <fieldset className="quote-step">
                                <legend className="quote-step__title">
                                    <span className="quote-step__n script">{sizeStep}</span>Tamaño
                                </legend>
                                {variants.length ? (
                                    <>
                                        <div className="quote-sizes">
                                            {getCatalogMeasures(product).map((measure) => {
                                                // Una medida que no existe en esta variante (el 4.5" en 1 altura) se ve con el precio de donde sí existe
                                                const shown = getCatalogSizeFor(product, measure, size?.variant ?? null) ?? product.sizes.find((one) => one.label === measure);
                                                return (
                                                    <label key={measure} className="quote-size">
                                                        <input
                                                            id={`size-${measure}`}
                                                            type="radio"
                                                            name="size"
                                                            value={measure}
                                                            checked={size?.label === measure}
                                                            onChange={() => selectSize(resolveMeasureChange(product, sizeId, measure)?.id ?? null)}
                                                        />
                                                        <span className="quote-size__card">
                                                            <HeightDrawing isDouble={isDoubleVariant(shown?.variant)} />
                                                            <span className={`quote-size__inch${measure.length > 6 ? " quote-size__inch--long" : ""}`}>{measure}</span>
                                                            <span className="quote-size__price">{formatPrice(shown?.price ?? 0)}</span>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        <div className="quote-heights" role="radiogroup" aria-label="Altura">
                                            {variants.map((variant) => (
                                                <label key={variant}>
                                                    <input
                                                        id={`variant-${variant}`}
                                                        type="radio"
                                                        name="variant"
                                                        value={variant}
                                                        checked={size?.variant === variant}
                                                        onChange={() => selectSize(resolveVariantChange(product, sizeId, variant)?.id ?? null)}
                                                    />
                                                    <span>{variant}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="quote-sizes">
                                        {product.sizes.map((one) => (
                                            <label key={one.id} className="quote-size">
                                                <input
                                                    id={`size-${one.id}`}
                                                    type="radio"
                                                    name="size"
                                                    value={one.id}
                                                    checked={sizeId === one.id}
                                                    onChange={() => selectSize(one.id)}
                                                />
                                                <span className="quote-size__card">
                                                    <span className={`quote-size__inch${one.label.length > 6 ? " quote-size__inch--long" : ""}`}>{one.label}</span>
                                                    <span className="quote-size__price">{formatPrice(one.price)}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                                <p className="quote-step__hint">El precio cambia con el tamaño.</p>
                            </fieldset>

                            {product.groups.map((group, groupIndex) => (
                                <fieldset className="quote-step" key={group.id}>
                                    <legend className="quote-step__title">
                                        <span className="quote-step__n script">{sizeStep + 1 + groupIndex}</span>
                                        {group.name}
                                    </legend>
                                    <p className="quote-step__hint">{getGroupHint(group)}</p>
                                    <div className="quote-chips">
                                        {group.options.map((option) => (
                                            <OptionChip
                                                key={option.id}
                                                type={group.max === 1 && group.min >= 1 ? "radio" : "checkbox"}
                                                name={`group-${group.id}`}
                                                option={option}
                                                price={getCatalogOptionPrice(option, sizeId)}
                                                checked={optionIds.includes(option.id)}
                                                disabled={!canAddCatalogOption(group, optionIds, sizeId, option.id)}
                                                onChange={() => toggleOption(group, groupIndex, option.id)}
                                            />
                                        ))}
                                    </div>
                                </fieldset>
                            ))}

                            {hasExtras ? (
                                <fieldset className="quote-step">
                                    <legend className="quote-step__title">
                                        <span className="quote-step__n script">{extrasStep}</span>
                                        {product.needsPhoto && product.allowsTopper ? "Fotos y topper" : product.needsPhoto ? "Foto de referencia" : "Topper"}
                                    </legend>
                                    <div className="quote-extras">
                                        {product.needsPhoto ? (
                                            <PhotoPicker
                                                id="cake-photo"
                                                label="Foto de referencia"
                                                hint="Una imagen del diseño que te gustaría. JPG o PNG."
                                                value={cakeImage}
                                                onChange={(value) => {
                                                    // Quitar la foto no es avanzar
                                                    if (value) markStep(getTrackKind(product), "fotos");
                                                    setCakeImage(value);
                                                }}
                                            />
                                        ) : null}

                                        {product.allowsTopper ? (
                                            <>
                                                <label className="quote-check">
                                                    <input
                                                        id="topper"
                                                        type="checkbox"
                                                        checked={topper}
                                                        onChange={(event) => setTopper(event.target.checked)}
                                                    />
                                                    <span className="quote-check__box" aria-hidden="true">
                                                        <PiCheckBold />
                                                    </span>
                                                    <span className="quote-check__text">
                                                        <b>Agregar topper</b>
                                                        <small>Un adorno para la parte de arriba.</small>
                                                    </span>
                                                    <span className="quote-check__price">+{formatPrice(product.topperPrice)}</span>
                                                </label>

                                                {topper ? (
                                                    <PhotoPicker
                                                        id="topper-photo"
                                                        label="Foto de referencia del topper"
                                                        hint="Cómo lo imaginas: letras, figura o personaje."
                                                        value={topperImage}
                                                        onChange={setTopperImage}
                                                    />
                                                ) : null}
                                            </>
                                        ) : null}
                                    </div>
                                </fieldset>
                            ) : null}

                            <CustomerStep step={customerStep} draft={customer} update={updateCustomer} />
                        </form>

                        <aside className="quote-summary" id="resumen" aria-label="Resumen de tu pedido">
                            {sent ? (
                                <QuoteSent quote={sent.quote} hasPhotos={sent.hasPhotos} onRestart={restart} />
                            ) : (
                                <>
                                    <p className="quote-summary__kicker script">tu postre</p>
                                    <ul className="quote-lines">
                                        <li>
                                            <span className="quote-lines__what">Tamaño</span>
                                            <span className="quote-lines__name">
                                                {product.name} {size ? getCatalogSizeText(size) : null}
                                            </span>
                                            <span className="quote-lines__amount">{formatPrice(breakdown?.base ?? 0)}</span>
                                        </li>
                                        {breakdown?.lines.map((line, index) => (
                                            <li key={`${line.group}-${index}`}>
                                                <span className="quote-lines__what">{line.group}</span>
                                                <span className="quote-lines__name">{line.name}</span>
                                                {line.price ? (
                                                    <span className="quote-lines__amount">+{formatPrice(line.price)}</span>
                                                ) : (
                                                    <span className="quote-lines__amount is-free">incluido</span>
                                                )}
                                            </li>
                                        ))}
                                        {breakdown && hasTopper ? (
                                            <li>
                                                <span className="quote-lines__what">Topper</span>
                                                <span className="quote-lines__name">Con topper</span>
                                                <span className="quote-lines__amount">+{formatPrice(breakdown.topperPrice)}</span>
                                            </li>
                                        ) : null}
                                    </ul>
                                    <div className="quote-qty">
                                        <span>
                                            ¿Cuántos quieres?
                                            <small>{formatPrice(unitTotal)} cada uno</small>
                                        </span>
                                        <QuantityStepper
                                            quantity={quantity}
                                            itemName={product.name}
                                            min={1}
                                            max={MAX_QUOTE_QUANTITY}
                                            onChange={setQuantity}
                                        />
                                    </div>
                                    <div className="quote-total">
                                        <span>Total estimado</span>
                                        <span className="quote-total__amount">
                                            <AnimatedPrice value={total} className="quote-total__value" />
                                            {quantity > 1 ? (
                                                <small>
                                                    {quantity} × {formatPrice(unitTotal)}
                                                </small>
                                            ) : null}
                                        </span>
                                    </div>
                                    <p className="quote-summary__fine">
                                        Precio estimado. Te lo confirmamos por correo antes de preparar nada.
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
                </>
            ) : null}
        </main>
    );
};
