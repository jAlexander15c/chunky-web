import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { PiCheckCircleBold, PiCreditCardBold, PiMapPinBold, PiWhatsappLogoBold } from "react-icons/pi";

import { useCart } from "./use-cart";
import { YappyButton } from "./yappy-button";

import {
    CARD_MIN_TOTAL,
    DEFAULT_CARD_SERVICE_FEE,
    HttpError,
    buildOrderMessage,
    buildWhatsappOrderMessage,
    createCardOrder,
    createIdempotencyKey,
    createOrder,
    createWhatsappOrder,
    formatPhone,
    formatPrice,
    getCartTotal,
    getCheckoutErrors,
    getDeliveryReach,
    getDeliveryText,
    getMapsUrl,
    getOrderingStatusLabel,
    getWhatsAppUrl,
    isAcceptingOrders,
    parseMoney,
    readCheckoutDraft,
    rememberOrderAccess,
    saveCheckoutDraft,
    setLastOrderId,
    useSettings,
    trackEvent,
} from "@/helpers";
import type { CheckoutErrors, Fulfillment, ICheckoutForm, OrderPaymentMethod } from "@/helpers";

// El mapa para marcar dónde recibe otra persona: Leaflet va en su propio chunk, como el del seguimiento
const LocationPicker = lazy(() => import("./location-picker"));

const EMPTY_FORM: ICheckoutForm = {
    customerName: "",
    customerPhone: "",
    hasOtherWhatsapp: false,
    whatsappPhone: "",
    note: "",
    fulfillment: "pickup",
    deliveryAddress: "",
    deliveryDetails: "",
    deliveryLat: null,
    deliveryLng: null,
    isForSomeoneElse: false,
    privacyConsent: false,
};

/** Campos de texto del formulario (los demas son un casillero o coordenadas). */
type TextField = "customerName" | "customerPhone" | "whatsappPhone" | "note" | "deliveryAddress" | "deliveryDetails";

const MAX_DETAILS_LENGTH = 200;
const GEOLOCATION_TIMEOUT_MS = 10000;

// Seis decimales son ~11 cm: de sobra para encontrar una puerta
const roundCoordinate = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * El formulario completo sobrevive a cerrar y abrir el carrito, pero solo en memoria: la dirección,
 * la ubicación y la nota se pierden al recargar. Lo que sobrevive a una recarga es el borrador corto.
 */
const formInMemory: { current: ICheckoutForm | null } = { current: null };

const readStoredForm = (): ICheckoutForm => formInMemory.current ?? { ...EMPTY_FORM, ...readCheckoutDraft() };

const FULFILLMENT_OPTIONS: { value: Fulfillment; label: string; detail: string }[] = [
    { value: "pickup", label: "Retiro en el local", detail: "Pasas a buscarlo" },
    { value: "delivery", label: "Delivery", detail: "Envío gratis" },
];

const PAYMENT_OPTIONS: { value: OrderPaymentMethod; label: string; detail: string }[] = [
    { value: "yappy", label: "Yappy", detail: "Pagas ahora" },
    { value: "card", label: "Tarjeta", detail: "Visa o Mastercard" },
    { value: "whatsapp", label: "WhatsApp", detail: "Pagas al recibir" },
];

/** source dice desde donde se pidio por WhatsApp (bar cerrado, ayuda con el pago). */
const openWhatsApp = (message: string, source: string) => {
    trackEvent("whatsapp_click", source);
    window.open(getWhatsAppUrl(message), "_blank", "noopener");
};

/** Pie del carrito: datos del cliente y el pago, con Yappy, con tarjeta o coordinado por WhatsApp. */
export const CartCheckout = () => {
    const { lines, setIsOpen } = useCart();
    const navigate = useNavigate();
    const { settings } = useSettings();
    const [form, setForm] = useState<ICheckoutForm>(readStoredForm);
    // El dia de pasta todo pedido es con entrega a domicilio y no rige el horario semanal.
    // Los demas dias el cliente elige solo si el delivery esta activo; si no, es para retirar.
    const canChooseDelivery = settings.deliveryMode && !settings.pastaMode;
    const requiresDelivery = settings.pastaMode || (canChooseDelivery && form.fulfillment === "delivery");
    const isBarOpen = isAcceptingOrders(settings);

    const [errors, setErrors] = useState<CheckoutErrors>({});
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [isYappyOnline, setIsYappyOnline] = useState(true);
    const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>("yappy");
    // La tarjeta se ofrece solo con el interruptor del tablero encendido
    const isCardEnabled = Boolean(settings.cardPayments);
    const paymentOptions = PAYMENT_OPTIONS.filter((option) => option.value !== "card" || isCardEnabled);
    useEffect(() => {
        if (!isCardEnabled && paymentMethod === "card") setPaymentMethod("yappy");
    }, [isCardEnabled, paymentMethod]);
    const [cashText, setCashText] = useState("");
    const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);
    const [isOpeningCard, setIsOpeningCard] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);
    const orderIdRef = useRef<string | null>(null);
    // Se repite en los reintentos (doble toque, red que falla) y se renueva cuando el pedido sale
    const idempotencyKeyRef = useRef<string | null>(null);

    useEffect(() => {
        formInMemory.current = form;
        saveCheckoutDraft(form);
    }, [form]);

    // El checkout empieza cuando escribe el primer dato, no al ver el carrito
    const hasStartedRef = useRef(false);
    const markCheckoutStart = () => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;
        trackEvent("checkout_start");
    };

    const updateField = (field: TextField) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        markCheckoutStart();
        const value = field === "customerPhone" || field === "whatsappPhone"
            ? formatPhone(event.target.value)
            : event.target.value;
        setForm((current) => ({ ...current, [field]: value }));
        setErrors((current) => ({ ...current, [field]: undefined }));
    };

    const chooseFulfillment = (fulfillment: Fulfillment) => {
        setForm((current) => ({ ...current, fulfillment }));
        setErrors((current) => ({ ...current, deliveryAddress: undefined }));
    };

    const togglePrivacyConsent = (event: ChangeEvent<HTMLInputElement>) => {
        setForm((current) => ({ ...current, privacyConsent: event.target.checked }));
        setErrors((current) => ({ ...current, privacyConsent: undefined }));
    };

    const toggleOtherWhatsapp =(event: ChangeEvent<HTMLInputElement>) => {
        setForm((current) => ({ ...current, hasOtherWhatsapp: event.target.checked }));
        setErrors((current) => ({ ...current, whatsappPhone: undefined }));
    };

    /**
     * Guarda la ubicacion del celular. Es obligatoria para delivery: con ella se sabe si llegamos.
     * Si es para otra persona, en su lugar se marca en el mapa dónde recibe.
     */
    const captureLocation = () => {
        setLocationError(null);
        if (!navigator.geolocation) {
            setLocationError("Tu navegador no comparte la ubicación. Elige retirar o, si es para otra persona, márcalo.");
            return;
        }

        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setForm((current) => ({
                    ...current,
                    deliveryLat: roundCoordinate(position.coords.latitude),
                    deliveryLng: roundCoordinate(position.coords.longitude),
                }));
                setErrors((current) => ({ ...current, deliveryLocation: undefined }));
                setIsLocating(false);
            },
            (error) => {
                setLocationError(error.code === error.PERMISSION_DENIED
                    ? "No tenemos permiso para ver tu ubicación. Actívala para este sitio, elige retirar o, si es para otra persona, márcalo."
                    : "No pudimos ubicarte. Intenta de nuevo, elige retirar o, si es para otra persona, márcalo.");
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 60000 }
        );
    };

    const clearLocation = () => setForm((current) => ({ ...current, deliveryLat: null, deliveryLng: null }));

    // Para otra persona no se mide a quien pide: marca en el mapa dónde recibe. Se paga con cualquier método
    const isForSomeoneElse = requiresDelivery && form.isForSomeoneElse;
    const toggleForSomeoneElse = (event: ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;
        // El punto cambia de dueño: la ubicación de quien pide no sirve como pin de quien recibe, ni al revés
        setForm((current) => ({ ...current, isForSomeoneElse: checked, deliveryLat: null, deliveryLng: null }));
        setErrors((current) => ({ ...current, deliveryLocation: undefined }));
        setLocationError(null);
        setPaymentError(null);
    };

    const markRecipientPoint = (point: { lat: number; lng: number }) => {
        setForm((current) => ({ ...current, deliveryLat: point.lat, deliveryLng: point.lng }));
        setErrors((current) => ({ ...current, deliveryLocation: undefined }));
        setPaymentError(null);
    };

    // Con el punto (su ubicación o el pin), a cuántos km queda y si el delivery llega (el API mide igual)
    const reach = requiresDelivery && form.deliveryLat !== null && form.deliveryLng !== null
        ? getDeliveryReach(settings.store, { lat: form.deliveryLat, lng: form.deliveryLng })
        : null;
    const reachError = reach?.reach === "out"
        ? `${isForSomeoneElse ? "Ese punto queda" : "Estás"} a ${reach.km} km: el delivery llega hasta ${settings.store?.deliveryMaxKm ?? 20} km. Puedes elegir retirar.`
        : null;

    // "Pagas con": solo con WhatsApp, opcional, y tiene que alcanzar para el total
    const total = getCartTotal(lines);
    // Con tarjeta se suma el servicio web; el API calcula lo mismo y es lo que cobra PagueloFacil
    const cardServiceFee = settings.cardServiceFee ?? DEFAULT_CARD_SERVICE_FEE;
    const cardTotal = Math.round((total + cardServiceFee) * 100) / 100;
    const isCardAvailable = cardTotal + 0.005 >= CARD_MIN_TOTAL;
    const cashTendered = parseMoney(cashText);
    const cashError = paymentMethod !== "whatsapp" || !cashText.trim()
        ? null
        : cashTendered === null
          ? "Escribe un monto, por ejemplo 20."
          : cashTendered + 0.005 < total ? `Con ${formatPrice(cashTendered)} no alcanza: el total es ${formatPrice(total)}.` : null;

    /** Revisa todo lo que no deja enviar el pedido. true si se puede seguir. */
    const validateCheckout = () => {
        const formErrors = getCheckoutErrors(form, requiresDelivery);
        setErrors(formErrors);
        if (reachError) setPaymentError(reachError);
        return Object.keys(formErrors).length === 0 && !reachError && !cashError;
    };

    const createPayment = async () => {
        markCheckoutStart();
        trackEvent("pay_click");
        setPaymentError(null);
        if (!validateCheckout()) return null;

        try {
            idempotencyKeyRef.current ??= createIdempotencyKey();
            const session = await createOrder(lines, form, requiresDelivery, idempotencyKeyRef.current);
            idempotencyKeyRef.current = null;
            rememberOrderAccess(session.orderId, session.accessToken);
            orderIdRef.current = session.orderId;
            setLastOrderId(session.orderId);
            return session;
        } catch (error) {
            setPaymentError(error instanceof HttpError && error.status < 500
                ? error.message
                : "No pudimos conectar con Yappy. Intenta de nuevo o envía tu pedido por WhatsApp.");
            return null;
        }
    };

    /**
     * Guarda el pedido y lleva al cliente a la página de PagueloFacil. Al pagar, PagueloFacil lo devuelve
     * a nuestro API, que verifica el cobro y lo manda a /pedido. El carrito se vacía allá, al confirmarse.
     */
    const payWithCard = async () => {
        markCheckoutStart();
        trackEvent("pay_click", "card");
        setPaymentError(null);
        if (!validateCheckout()) return;

        setIsOpeningCard(true);
        try {
            idempotencyKeyRef.current ??= createIdempotencyKey();
            const session = await createCardOrder(lines, form, requiresDelivery, idempotencyKeyRef.current);
            idempotencyKeyRef.current = null;
            rememberOrderAccess(session.orderId, session.accessToken);
            setLastOrderId(session.orderId);
            // El siguiente pedido vuelve a pedir la casilla del aviso
            setForm((current) => ({ ...current, note: "", privacyConsent: false }));
            window.location.assign(session.paymentUrl);
        } catch (error) {
            setPaymentError(error instanceof HttpError && error.status < 500
                ? error.message
                : "No pudimos abrir el pago con tarjeta. Intenta de nuevo o paga con Yappy.");
            setIsOpeningCard(false);
        }
    };

    const goToOrder = () => {
        if (!orderIdRef.current) return;
        // El siguiente pedido vuelve a pedir la casilla del aviso
        setForm((current) => ({ ...current, note: "", privacyConsent: false }));
        setIsOpen(false);
        navigate(`/pedido/${orderIdRef.current}`);
    };

    const choosePaymentMethod = (method: OrderPaymentMethod) => {
        setPaymentMethod(method);
        setPaymentError(null);
    };

    // Sin Yappy queda WhatsApp: el pedido se guarda igual y se paga al recibir
    const changeYappyOnline = (isOnline: boolean) => {
        setIsYappyOnline(isOnline);
        if (!isOnline) setPaymentMethod("whatsapp");
    };

    /**
     * Guarda el pedido para coordinar por WhatsApp y abre el chat con el resumen y el código.
     * El chat se abre antes de esperar al API: iOS bloquea las ventanas que no salen directo del toque.
     * Si igual se bloquea, /pedido tiene el botón para abrirlo.
     */
    const sendWhatsappOrder = async () => {
        markCheckoutStart();
        trackEvent("pay_click", "whatsapp");
        setPaymentError(null);
        if (!validateCheckout()) return;
        const tendered = cashText.trim() ? cashTendered : null;

        const chat = window.open("", "_blank");
        if (chat) chat.opener = null;
        setIsSendingWhatsapp(true);
        try {
            idempotencyKeyRef.current ??= createIdempotencyKey();
            const session = await createWhatsappOrder(lines, form, requiresDelivery, idempotencyKeyRef.current, tendered);
            idempotencyKeyRef.current = null;
            rememberOrderAccess(session.orderId, session.accessToken);
            setLastOrderId(session.orderId);
            trackEvent("whatsapp_order");

            const orderUrl = `${window.location.origin}/pedido/${session.orderId}`;
            const message = buildWhatsappOrderMessage(
                lines,
                requiresDelivery ? form : { ...form, deliveryAddress: "" },
                session.orderId,
                orderUrl,
                tendered
            );
            setCashText("");
            if (chat) chat.location.href = getWhatsAppUrl(message);

            orderIdRef.current = session.orderId;
            goToOrder();
        } catch (error) {
            chat?.close();
            setPaymentError(error instanceof HttpError && error.status < 500
                ? error.message
                : "No pudimos guardar tu pedido. Revisa tu conexión e intenta de nuevo.");
        } finally {
            setIsSendingWhatsapp(false);
        }
    };

    if (!isBarOpen) {
        return (
            <div className="checkout">
                <div className="checkout__notice">
                    <strong>{getOrderingStatusLabel(settings, false)}</strong>
                    <span>Los pagos en línea funcionan dentro del horario. Puedes dejar tu pedido por WhatsApp.</span>
                </div>
                <button type="button" className="button button--whatsapp button--block" onClick={() => openWhatsApp(buildOrderMessage(lines, requiresDelivery ? getDeliveryText(form) : undefined), "bar-cerrado")}>
                    <PiWhatsappLogoBold aria-hidden /> Enviar pedido por WhatsApp
                </button>
            </div>
        );
    }

    return (
        <div className="checkout">
            <div className="checkout__fields">
                {canChooseDelivery ? (
                    <div className="checkout__fulfillment" role="radiogroup" aria-label="Cómo recibes tu pedido">
                        {FULFILLMENT_OPTIONS.map((option) => (
                            <label key={option.value} className="checkout__fulfillment-option">
                                <input
                                    type="radio"
                                    name="checkout-fulfillment"
                                    value={option.value}
                                    checked={form.fulfillment === option.value}
                                    onChange={() => chooseFulfillment(option.value)}
                                />
                                <span className="checkout__fulfillment-label">{option.label}</span>
                                <span className={`checkout__fulfillment-detail ${option.value === "delivery" ? "checkout__fulfillment-detail--free" : ""}`}>
                                    {option.detail}
                                </span>
                            </label>
                        ))}
                    </div>
                ) : !settings.pastaMode ? (
                    <p className="checkout__pickup">
                        <strong>Pedido para retirar en el local.</strong> Te avisamos cuando esté listo.
                    </p>
                ) : null}

                {requiresDelivery && (
                    <>
                        <p className="checkout__section">Entrega a domicilio</p>

                        <div className="field">
                            <label htmlFor="checkout-address" className="field__label">Dirección</label>
                            <input
                                id="checkout-address"
                                className="field__input"
                                autoComplete="street-address"
                                maxLength={200}
                                placeholder="Calle, edificio o casa, corregimiento"
                                value={form.deliveryAddress}
                                onChange={updateField("deliveryAddress")}
                                aria-invalid={Boolean(errors.deliveryAddress)}
                                aria-describedby={errors.deliveryAddress ? "checkout-address-error" : undefined}
                            />
                            {errors.deliveryAddress && <span id="checkout-address-error" className="field__error">{errors.deliveryAddress}</span>}
                        </div>

                        <div className="field">
                            <label htmlFor="checkout-details" className="field__label">
                                Detalles para el repartidor <span className="field__optional">(opcional)</span>
                            </label>
                            <textarea
                                id="checkout-details"
                                className="field__input field__input--area"
                                rows={2}
                                maxLength={MAX_DETAILS_LENGTH}
                                placeholder="Ej. apto 12B, portón negro, llamar al llegar"
                                value={form.deliveryDetails}
                                onChange={updateField("deliveryDetails")}
                            />
                            <span className="field__help field__counter">{form.deliveryDetails.length}/{MAX_DETAILS_LENGTH}</span>
                        </div>

                        <label className="field__check" htmlFor="checkout-for-someone-else">
                            <input
                                id="checkout-for-someone-else"
                                type="checkbox"
                                checked={form.isForSomeoneElse}
                                onChange={toggleForSomeoneElse}
                            />
                            Es para otra persona
                        </label>

                        {isForSomeoneElse ? (
                            <>
                                <p className="checkout__section">¿Dónde recibe?</p>
                                <Suspense fallback={<div className="delivery-map delivery-map--loading location-picker__map" />}>
                                    <LocationPicker
                                        value={form.deliveryLat !== null && form.deliveryLng !== null ? { lat: form.deliveryLat, lng: form.deliveryLng } : null}
                                        store={settings.store?.location ?? null}
                                        onChange={markRecipientPoint}
                                    />
                                </Suspense>
                                {reach && reach.reach !== "out" && (
                                    <div className="checkout__location" role="status">
                                        <PiCheckCircleBold aria-hidden />
                                        <span>Pin marcado · a {reach.km} km del local</span>
                                    </div>
                                )}
                            </>
                        ) : form.deliveryLat !== null && form.deliveryLng !== null ? (
                            <div className="checkout__location" role="status">
                                <PiCheckCircleBold aria-hidden />
                                <span>Ubicación guardada{reach ? ` · a ${reach.km} km del local` : ""}</span>
                                <a href={getMapsUrl(form.deliveryLat, form.deliveryLng)} target="_blank" rel="noopener noreferrer">Ver en Maps</a>
                                <button type="button" className="checkout__location-clear" onClick={clearLocation}>Quitar</button>
                            </div>
                        ) : (
                            <button type="button" className="button button--ghost button--block" onClick={captureLocation} disabled={isLocating}>
                                <PiMapPinBold aria-hidden /> {isLocating ? "Buscando tu ubicación…" : "Usar mi ubicación"}
                            </button>
                        )}
                        {(isForSomeoneElse ? errors.deliveryLocation : locationError ?? errors.deliveryLocation) && (
                            <span className="field__error" role="alert">{isForSomeoneElse ? errors.deliveryLocation : locationError ?? errors.deliveryLocation}</span>
                        )}
                        {reach?.reach === "far" && (
                            <p className="checkout__reach checkout__reach--far" role="status">
                                Estás a {reach.km} km: llegamos, pero puede tardar un poco más.
                            </p>
                        )}
                        {reachError && <p className="checkout__reach checkout__reach--out" role="alert">{reachError}</p>}
                    </>
                )}

                <p className="checkout__section">¿Cómo quieres pagar?</p>
                <div
                    className={`checkout__fulfillment${paymentOptions.length > 2 ? " checkout__payment" : ""}`}
                    role="radiogroup"
                    aria-label="Cómo quieres pagar"
                >
                    {paymentOptions.map((option) => (
                        <label key={option.value} className="checkout__fulfillment-option">
                            <input
                                type="radio"
                                name="checkout-payment"
                                value={option.value}
                                checked={paymentMethod === option.value}
                                disabled={option.value === "card" && !isCardAvailable}
                                onChange={() => choosePaymentMethod(option.value)}
                            />
                            <span className="checkout__fulfillment-label">{option.label}</span>
                            <span className="checkout__fulfillment-detail">
                                {option.value === "card"
                                    ? isCardAvailable ? `+${formatPrice(cardServiceFee)} servicio web` : `Mínimo ${formatPrice(CARD_MIN_TOTAL)}`
                                    : option.detail}
                            </span>
                        </label>
                    ))}
                </div>

                {paymentMethod === "whatsapp" && (
                    <div className="field">
                        <label htmlFor="checkout-cash" className="field__label">
                            Si pagas en efectivo, ¿con cuánto? <span className="field__optional">(opcional)</span>
                        </label>
                        <div className="field__phone">
                            <span className="field__prefix" aria-hidden>$</span>
                            <input
                                id="checkout-cash"
                                className="field__input"
                                type="text"
                                inputMode="decimal"
                                placeholder={total < 20 ? "20.00" : "50.00"}
                                value={cashText}
                                onChange={(event) => setCashText(event.target.value)}
                                aria-invalid={Boolean(cashError)}
                                aria-describedby="checkout-cash-help"
                            />
                        </div>
                        <span id="checkout-cash-help" className={cashError ? "field__error" : "field__help"}>
                            {cashError ?? (cashTendered !== null && cashTendered > total + 0.005
                                ? `Vuelto ${formatPrice(cashTendered - total)}: el repartidor lleva el cambio justo.`
                                : "Así el repartidor lleva el cambio justo.")}
                        </span>
                    </div>
                )}

                <p className="checkout__section">Contacto</p>

                <div className="field">
                    <label htmlFor="checkout-name" className="field__label">Tu nombre</label>
                    <input
                        id="checkout-name"
                        className="field__input"
                        autoComplete="given-name"
                        maxLength={60}
                        value={form.customerName}
                        onChange={updateField("customerName")}
                        aria-invalid={Boolean(errors.customerName)}
                        aria-describedby={errors.customerName ? "checkout-name-error" : undefined}
                    />
                    {errors.customerName && <span id="checkout-name-error" className="field__error">{errors.customerName}</span>}
                </div>

                <div className="field">
                    <label htmlFor="checkout-phone" className="field__label">
                        {paymentMethod === "yappy" ? "Celular con Yappy" : "Tu celular"}
                    </label>
                    <div className="field__phone">
                        <span className="field__prefix" aria-hidden>+507</span>
                        <input
                            id="checkout-phone"
                            className="field__input"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            placeholder="6123-4567"
                            value={form.customerPhone}
                            onChange={updateField("customerPhone")}
                            aria-invalid={Boolean(errors.customerPhone)}
                            aria-describedby="checkout-phone-help"
                        />
                    </div>
                    <span id="checkout-phone-help" className={errors.customerPhone ? "field__error" : "field__help"}>
                        {errors.customerPhone ?? (paymentMethod === "yappy"
                            ? "A este número te llega la solicitud de pago."
                            : "Te escribimos a este número para confirmar el pedido.")}
                    </span>
                </div>

                <label className="field__check" htmlFor="checkout-other-whatsapp">
                    <input
                        id="checkout-other-whatsapp"
                        type="checkbox"
                        checked={form.hasOtherWhatsapp}
                        onChange={toggleOtherWhatsapp}
                    />
                    Mi WhatsApp es otro número
                </label>

                {form.hasOtherWhatsapp && (
                    <div className="field">
                        <label htmlFor="checkout-whatsapp" className="field__label">WhatsApp</label>
                        <div className="field__phone">
                            <span className="field__prefix" aria-hidden>+507</span>
                            <input
                                id="checkout-whatsapp"
                                className="field__input"
                                type="tel"
                                inputMode="numeric"
                                placeholder="6123-4567"
                                value={form.whatsappPhone}
                                onChange={updateField("whatsappPhone")}
                                aria-invalid={Boolean(errors.whatsappPhone)}
                                aria-describedby={errors.whatsappPhone ? "checkout-whatsapp-error" : undefined}
                            />
                        </div>
                        {errors.whatsappPhone && <span id="checkout-whatsapp-error" className="field__error">{errors.whatsappPhone}</span>}
                    </div>
                )}

                <div className="field">
                    <label htmlFor="checkout-note" className="field__label">Nota del pedido <span className="field__optional">(opcional)</span></label>
                    <textarea
                        id="checkout-note"
                        className="field__input field__input--area"
                        rows={2}
                        maxLength={200}
                        placeholder="Ej. sin nueces, paso a las 10:30"
                        value={form.note}
                        onChange={updateField("note")}
                    />
                </div>

                <div className="checkout__privacy">
                    <label className="field__check checkout__consent" htmlFor="checkout-privacy">
                        <input
                            id="checkout-privacy"
                            type="checkbox"
                            checked={form.privacyConsent}
                            onChange={togglePrivacyConsent}
                            aria-invalid={Boolean(errors.privacyConsent)}
                            aria-describedby={errors.privacyConsent ? "checkout-privacy-error" : undefined}
                        />
                        <span>
                            Acepto el{" "}
                            <a href="/privacidad" target="_blank" rel="noopener">aviso de privacidad</a>: usan mi
                            nombre y celular para preparar y entregar mi pedido y guardar mis compras.
                        </span>
                    </label>
                    {errors.privacyConsent && (
                        <span id="checkout-privacy-error" className="field__error" role="alert">{errors.privacyConsent}</span>
                    )}
                </div>
            </div>

            {!isYappyOnline && paymentMethod === "yappy" && (
                <div className="checkout__notice">
                    <strong>Yappy no está disponible en este momento.</strong>
                    <span>Elige coordinar por WhatsApp: guardamos tu pedido y pagas al recibir.</span>
                </div>
            )}

            {paymentError && (
                <div className="checkout__notice checkout__notice--error" role="alert">
                    <strong>{paymentError}</strong>
                    <span>Si el problema sigue, envíanos el pedido por WhatsApp.</span>
                </div>
            )}

            {/* El botón de Yappy sigue montado con WhatsApp elegido: así se sabe si vuelve a estar en línea */}
            <div
                className={`checkout__yappy${isYappyOnline ? "" : " checkout__yappy--off"}${paymentMethod === "yappy" ? "" : " checkout__yappy--hidden"}`}
                aria-hidden={paymentMethod !== "yappy"}
            >
                <YappyButton
                    onCreatePayment={createPayment}
                    onSuccess={goToOrder}
                    onError={() => setPaymentError("El pago con Yappy no se completó. No se hizo ningún cobro.")}
                    onOnlineChange={changeYappyOnline}
                />
            </div>

            {paymentMethod === "card" ? (
                <>
                    <p className="carrito__hint">
                        Te llevamos a la página segura de PagueloFacil para pagar con Visa o Mastercard, y vuelves aquí a ver tu pedido.
                        {cardServiceFee > 0 && ` Incluye ${formatPrice(cardServiceFee)} de servicio web.`}
                    </p>
                    <button
                        type="button"
                        className="button button--primary button--block"
                        onClick={() => void payWithCard()}
                        disabled={isOpeningCard || !isCardAvailable}
                    >
                        <PiCreditCardBold aria-hidden /> {isOpeningCard ? "Abriendo el pago…" : `Pagar con tarjeta · ${formatPrice(cardTotal)}`}
                    </button>
                    <button type="button" className="checkout__help" onClick={() => choosePaymentMethod("whatsapp")}>
                        <PiWhatsappLogoBold aria-hidden /> ¿Problemas para pagar? Coordínalo por WhatsApp
                    </button>
                </>
            ) : paymentMethod === "yappy" ? (
                isYappyOnline ? (
                    <>
                        <p className="carrito__hint">Aprueba el pago en tu app de Yappy. Tienes 5 minutos.</p>
                        <button type="button" className="checkout__help" onClick={() => choosePaymentMethod("whatsapp")}>
                            <PiWhatsappLogoBold aria-hidden /> ¿Problemas para pagar? Coordínalo por WhatsApp
                        </button>
                    </>
                ) : null
            ) : (
                <>
                    <p className="carrito__hint">
                        Guardamos tu pedido y se abre WhatsApp con el resumen. Te confirmamos por ahí y pagas al recibir:
                        efectivo, tarjeta o Yappy.
                    </p>
                    <button
                        type="button"
                        className="button button--whatsapp button--block"
                        onClick={() => void sendWhatsappOrder()}
                        disabled={isSendingWhatsapp}
                    >
                        <PiWhatsappLogoBold aria-hidden /> {isSendingWhatsapp ? "Guardando tu pedido…" : "Enviar pedido por WhatsApp"}
                    </button>
                </>
            )}
        </div>
    );
};
