import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { PiCheckCircleBold, PiMapPinBold, PiWhatsappLogoBold } from "react-icons/pi";

import { useCart } from "./use-cart";
import { YappyButton } from "./yappy-button";

import {
    HttpError,
    buildOrderMessage,
    buildPaymentHelpMessage,
    createOrder,
    formatPhone,
    getCheckoutErrors,
    getDeliveryText,
    getMapsUrl,
    getOpeningStatusLabel,
    getWhatsAppUrl,
    isAcceptingOrders,
    setLastOrderId,
    useSettings,
} from "@/helpers";
import type { CheckoutErrors, ICheckoutForm } from "@/helpers";

const FORM_STORAGE_KEY = "chunky-checkout";

const EMPTY_FORM: ICheckoutForm = {
    customerName: "",
    customerPhone: "",
    hasOtherWhatsapp: false,
    whatsappPhone: "",
    note: "",
    deliveryAddress: "",
    deliveryDetails: "",
    deliveryLat: null,
    deliveryLng: null,
};

/** Campos de texto del formulario (los demas son un casillero o coordenadas). */
type TextField = "customerName" | "customerPhone" | "whatsappPhone" | "note" | "deliveryAddress" | "deliveryDetails";

const MAX_DETAILS_LENGTH = 200;
const GEOLOCATION_TIMEOUT_MS = 10000;

// Seis decimales son ~11 cm: de sobra para encontrar una puerta
const roundCoordinate = (value: number) => Math.round(value * 1e6) / 1e6;

const readStoredForm = (): ICheckoutForm => {
    try {
        const raw = window.sessionStorage.getItem(FORM_STORAGE_KEY);
        return raw ? { ...EMPTY_FORM, ...JSON.parse(raw) } : EMPTY_FORM;
    } catch {
        return EMPTY_FORM;
    }
};

const openWhatsApp = (message: string) => {
    window.open(getWhatsAppUrl(message), "_blank", "noopener");
};

/** Pie del carrito: datos del cliente, pago con Yappy y WhatsApp como alternativa. */
export const CartCheckout = () => {
    const { lines, setIsOpen } = useCart();
    const navigate = useNavigate();
    const { settings } = useSettings();
    // El dia de pasta todo pedido es con entrega a domicilio y no rige el horario semanal
    const requiresDelivery = settings.pastaMode;
    const isBarOpen = isAcceptingOrders(settings.pastaMode);

    const [form, setForm] = useState<ICheckoutForm>(readStoredForm);
    const [errors, setErrors] = useState<CheckoutErrors>({});
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [isYappyOnline, setIsYappyOnline] = useState(true);
    const [isLocating, setIsLocating] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);
    const orderIdRef = useRef<string | null>(null);

    useEffect(() => {
        try {
            window.sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
        } catch {
            return;
        }
    }, [form]);

    const updateField = (field: TextField) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = field === "customerPhone" || field === "whatsappPhone"
            ? formatPhone(event.target.value)
            : event.target.value;
        setForm((current) => ({ ...current, [field]: value }));
        setErrors((current) => ({ ...current, [field]: undefined }));
    };

    const toggleOtherWhatsapp = (event: ChangeEvent<HTMLInputElement>) => {
        setForm((current) => ({ ...current, hasOtherWhatsapp: event.target.checked }));
        setErrors((current) => ({ ...current, whatsappPhone: undefined }));
    };

    /** Guarda la ubicacion del celular. Es un extra: sin ella el pedido sale igual con la direccion escrita. */
    const captureLocation = () => {
        setLocationError(null);
        if (!navigator.geolocation) {
            setLocationError("Tu navegador no comparte la ubicación. Escribe la dirección y las referencias.");
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
                setIsLocating(false);
            },
            (error) => {
                setLocationError(error.code === error.PERMISSION_DENIED
                    ? "No tenemos permiso para ver tu ubicación. Escribe la dirección y las referencias."
                    : "No pudimos ubicarte. Escribe la dirección y las referencias.");
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 60000 }
        );
    };

    const clearLocation = () => setForm((current) => ({ ...current, deliveryLat: null, deliveryLng: null }));

    const createPayment = async () => {
        setPaymentError(null);
        const formErrors = getCheckoutErrors(form, requiresDelivery);
        setErrors(formErrors);
        if (Object.keys(formErrors).length > 0) return null;

        try {
            const session = await createOrder(lines, form, requiresDelivery);
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

    const goToOrder = () => {
        if (!orderIdRef.current) return;
        setForm((current) => ({ ...current, note: "" }));
        setIsOpen(false);
        navigate(`/pedido/${orderIdRef.current}`);
    };

    const sendHelpMessage = () => openWhatsApp(buildPaymentHelpMessage(lines, requiresDelivery ? form : { ...form, deliveryAddress: "" }, orderIdRef.current));

    if (!isBarOpen) {
        return (
            <div className="checkout">
                <div className="checkout__notice">
                    <strong>{getOpeningStatusLabel(false)}.</strong>
                    <span>Los pagos en línea funcionan dentro del horario. Puedes dejar tu pedido por WhatsApp.</span>
                </div>
                <button type="button" className="button button--whatsapp button--block" onClick={() => openWhatsApp(buildOrderMessage(lines, requiresDelivery ? getDeliveryText(form) : undefined))}>
                    <PiWhatsappLogoBold aria-hidden /> Enviar pedido por WhatsApp
                </button>
            </div>
        );
    }

    return (
        <div className="checkout">
            <div className="checkout__fields">
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

                        {form.deliveryLat !== null && form.deliveryLng !== null ? (
                            <div className="checkout__location" role="status">
                                <PiCheckCircleBold aria-hidden />
                                <span>Ubicación guardada</span>
                                <a href={getMapsUrl(form.deliveryLat, form.deliveryLng)} target="_blank" rel="noopener noreferrer">Ver en Maps</a>
                                <button type="button" className="checkout__location-clear" onClick={clearLocation}>Quitar</button>
                            </div>
                        ) : (
                            <button type="button" className="button button--ghost button--block" onClick={captureLocation} disabled={isLocating}>
                                <PiMapPinBold aria-hidden /> {isLocating ? "Buscando tu ubicación…" : "Usar mi ubicación"}
                            </button>
                        )}
                        {locationError && <span className="field__error" role="alert">{locationError}</span>}

                        <p className="checkout__section">Contacto</p>
                    </>
                )}

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
                    <label htmlFor="checkout-phone" className="field__label">Celular con Yappy</label>
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
                        {errors.customerPhone ?? "A este número te llega la solicitud de pago."}
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
            </div>

            {!isYappyOnline && (
                <div className="checkout__notice">
                    <strong>Yappy no está disponible en este momento.</strong>
                    <span>Envía tu pedido por WhatsApp y lo coordinamos por ahí.</span>
                </div>
            )}

            {paymentError && (
                <div className="checkout__notice checkout__notice--error" role="alert">
                    <strong>{paymentError}</strong>
                    <span>Si el problema sigue, envíanos el pedido por WhatsApp.</span>
                </div>
            )}

            <div className={isYappyOnline ? "checkout__yappy" : "checkout__yappy checkout__yappy--off"}>
                <YappyButton
                    onCreatePayment={createPayment}
                    onSuccess={goToOrder}
                    onError={() => setPaymentError("El pago con Yappy no se completó. No se hizo ningún cobro.")}
                    onOnlineChange={setIsYappyOnline}
                />
            </div>

            {isYappyOnline ? (
                <>
                    <p className="carrito__hint">Aprueba el pago en tu app de Yappy. Tienes 5 minutos.</p>
                    <button type="button" className="checkout__help" onClick={sendHelpMessage}>
                        <PiWhatsappLogoBold aria-hidden /> ¿Problemas para pagar? Pide por WhatsApp
                    </button>
                </>
            ) : (
                <button type="button" className="button button--whatsapp button--block" onClick={sendHelpMessage}>
                    <PiWhatsappLogoBold aria-hidden /> Enviar pedido por WhatsApp
                </button>
            )}
        </div>
    );
};
