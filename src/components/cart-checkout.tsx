import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { PiWhatsappLogoBold } from "react-icons/pi";

import { useCart } from "./use-cart";
import { YappyButton } from "./yappy-button";

import {
    HttpError,
    buildOrderMessage,
    buildPaymentHelpMessage,
    createOrder,
    formatPhone,
    getCheckoutErrors,
    getOpeningStatusLabel,
    getWhatsAppUrl,
    isWithinOperatingHours,
    setLastOrderId,
} from "@/helpers";
import type { CheckoutErrors, ICheckoutForm } from "@/helpers";

const FORM_STORAGE_KEY = "chunky-checkout";

const EMPTY_FORM: ICheckoutForm = { customerName: "", customerPhone: "", hasOtherWhatsapp: false, whatsappPhone: "", note: "" };

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
    const isBarOpen = isWithinOperatingHours();

    const [form, setForm] = useState<ICheckoutForm>(readStoredForm);
    const [errors, setErrors] = useState<CheckoutErrors>({});
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [isYappyOnline, setIsYappyOnline] = useState(true);
    const orderIdRef = useRef<string | null>(null);

    useEffect(() => {
        try {
            window.sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
        } catch {
            return;
        }
    }, [form]);

    const updateField = (field: keyof ICheckoutForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

    const createPayment = async () => {
        setPaymentError(null);
        const formErrors = getCheckoutErrors(form);
        setErrors(formErrors);
        if (Object.keys(formErrors).length > 0) return null;

        try {
            const session = await createOrder(lines, form);
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

    const sendHelpMessage = () => openWhatsApp(buildPaymentHelpMessage(lines, form, orderIdRef.current));

    if (!isBarOpen) {
        return (
            <div className="checkout">
                <div className="checkout__notice">
                    <strong>{getOpeningStatusLabel(false)}.</strong>
                    <span>Los pagos en línea funcionan dentro del horario. Puedes dejar tu pedido por WhatsApp.</span>
                </div>
                <button type="button" className="button button--whatsapp button--block" onClick={() => openWhatsApp(buildOrderMessage(lines))}>
                    <PiWhatsappLogoBold aria-hidden /> Enviar pedido por WhatsApp
                </button>
            </div>
        );
    }

    return (
        <div className="checkout">
            <div className="checkout__fields">
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
