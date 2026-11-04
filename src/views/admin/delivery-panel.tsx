import { useState } from "react";

import { HttpError, isPastaDeliveryOnly, loadSettings, setDeliveryMode, useSettings } from "@/helpers";

/* ============ Delivery ============ */

/** Interruptor del delivery de la web. No pide confirmacion: no cambia el menu ni los pedidos ya hechos. */
export const DeliveryModePanel = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const { settings, isReady } = useSettings();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const isOn = settings.deliveryMode;

    const toggle = async () => {
        setIsSaving(true);
        setError("");

        try {
            await setDeliveryMode(token, !isOn);
            await loadSettings();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cambiar el delivery.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="adm-band adm-pasta">
            <div className="adm-band__head">
                <h2 className="script">Delivery</h2>
                <span className="adm-band__sub">Entrega a domicilio en los pedidos de la web</span>
            </div>

            <div className="adm-pasta__row">
                <label className="adm-switch">
                    <input type="checkbox" checked={isOn} onChange={() => void toggle()} disabled={!isReady || isSaving} />
                    <span className="adm-switch__track" aria-hidden />
                    <span className="adm-switch__label">Delivery</span>
                </label>
                <span className={`adm-pasta__state ${isOn ? "adm-pasta__state--on" : ""}`} role="status">
                    {isReady ? (isOn ? "Activo" : "Apagado") : "Leyendo…"}
                </span>
            </div>

            <p className="adm-pasta__desc">
                {isOn
                    ? "El cliente elige en el carrito entre retirar en el local o delivery con envío gratis."
                    : "Los pedidos de la web son solo para retirar en el local."}
            </p>

            {isPastaDeliveryOnly(settings) ? <p className="adm-warning">Hoy es día de pasta: todo pedido es delivery igual.</p> : null}
            {error ? <p className="adm-error">{error}</p> : null}
        </section>
    );
};
