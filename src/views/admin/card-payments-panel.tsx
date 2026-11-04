import { useState } from "react";

import { HttpError, formatMoney, loadSettings, setCardPayments, useSettings } from "@/helpers";

/* ============ Pago con tarjeta ============ */

/** Interruptor del pago con tarjeta en la web. Los pedidos ya pagados con tarjeta siguen su curso al apagarlo. */
export const CardPaymentsPanel = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const { settings, isReady } = useSettings();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const isOn = Boolean(settings.cardPayments);
    const fee = settings.cardServiceFee ?? 0;

    const toggle = async () => {
        setIsSaving(true);
        setError("");

        try {
            await setCardPayments(token, !isOn);
            await loadSettings();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cambiar el pago con tarjeta.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="adm-band adm-pasta">
            <div className="adm-band__head">
                <h2 className="script">Tarjeta</h2>
                <span className="adm-band__sub">Pago con Visa o Mastercard por PagueloFacil</span>
            </div>

            <div className="adm-pasta__row">
                <label className="adm-switch">
                    <input type="checkbox" checked={isOn} onChange={() => void toggle()} disabled={!isReady || isSaving} />
                    <span className="adm-switch__track" aria-hidden />
                    <span className="adm-switch__label">Pago con tarjeta</span>
                </label>
                <span className={`adm-pasta__state ${isOn ? "adm-pasta__state--on" : ""}`} role="status">
                    {isReady ? (isOn ? "Activo" : "Apagado") : "Leyendo…"}
                </span>
            </div>

            <p className="adm-pasta__desc">
                {isOn
                    ? `El carrito ofrece pagar con tarjeta, con $${formatMoney(fee)} de servicio web.`
                    : "El carrito solo ofrece Yappy y coordinar por WhatsApp."}
            </p>

            {error ? <p className="adm-error">{error}</p> : null}
        </section>
    );
};
