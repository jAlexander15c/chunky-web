import { useState } from "react";

import { HttpError, loadSettings, setPastaFullMenu, setPastaMode, useSettings } from "@/helpers";

/* ============ Modo pasta ============ */

/** Interruptor del dia de pasta. Cambiarlo pide confirmacion: afecta el menu de todos los clientes. */
export const PastaModePanel = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const { settings, isReady } = useSettings();
    const [isConfirming, setIsConfirming] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const isOn = settings.pastaMode;
    const isFullMenu = Boolean(settings.pastaFullMenu);

    const changeFullMenu = async () => {
        setIsSaving(true);
        setError("");

        try {
            await setPastaFullMenu(token, !isFullMenu);
            await loadSettings();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cambiar el menú del día de pasta.");
        } finally {
            setIsSaving(false);
        }
    };

    const change = async (enabled: boolean) => {
        setIsSaving(true);
        setError("");

        try {
            await setPastaMode(token, enabled);
            // Los clientes con la pagina abierta lo leen en menos de un minuto; aqui se ve al instante
            await loadSettings();
            setIsConfirming(false);
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cambiar el modo pasta.");
        } finally {
            setIsSaving(false);
        }
    };

    // Apagar no necesita confirmacion (vuelve el menu completo); encender si
    const toggle = () => (isOn ? void change(false) : setIsConfirming(true));

    return (
        <section className="adm-band adm-pasta">
            <div className="adm-band__head">
                <h2 className="script">Modo pasta</h2>
                <span className="adm-band__sub">Un día de pasta: la pasta armable, solo con bebidas o con todo el menú</span>
            </div>

            <div className="adm-pasta__row">
                <label className="adm-switch">
                    <input type="checkbox" checked={isOn} onChange={toggle} disabled={!isReady || isSaving} />
                    <span className="adm-switch__track" aria-hidden />
                    <span className="adm-switch__label">Modo pasta</span>
                </label>
                <span className={`adm-pasta__state ${isOn ? "adm-pasta__state--on" : ""}`} role="status">
                    {isReady ? (isOn ? "Activo" : "Apagado") : "Leyendo…"}
                </span>
            </div>

            <p className="adm-pasta__desc">
                {!isOn
                    ? "Ahora el menú se ve completo y la entrega sigue lo que diga el panel de Delivery."
                    : isFullMenu
                        ? "Ahora se vende la pasta armable y todo el menú en el horario de la semana; fuera de ese horario, solo pasta y bebidas. La entrega sigue lo que diga el panel de Delivery."
                        : "Ahora el menú muestra solo la pasta armable y las bebidas, y los pedidos son con entrega a domicilio."}
            </p>

            {isOn ? (
                <div className="adm-pasta__row adm-pasta__row--sub">
                    <label className="adm-switch">
                        <input type="checkbox" checked={isFullMenu} onChange={() => void changeFullMenu()} disabled={!isReady || isSaving} />
                        <span className="adm-switch__track" aria-hidden />
                        <span className="adm-switch__label">Vender también el resto del menú</span>
                    </label>
                    <span className={`adm-pasta__state ${isFullMenu ? "adm-pasta__state--on" : ""}`} role="status">
                        {isFullMenu ? "Activo" : "Apagado"}
                    </span>
                </div>
            ) : null}

            {isOn && !settings.pasta ? (
                <p className="adm-warning">
                    La pasta no aparece en el menú: revisa que el item esté activo en Loyverse y que LOYVERSE_PASTA_ITEM_ID sea el correcto.
                </p>
            ) : null}
            {error ? <p className="adm-error">{error}</p> : null}

            {isConfirming ? (
                <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Activar el modo pasta">
                    <div className="adm-modal__panel">
                        <h3 className="script">¿Activar el modo pasta?</h3>
                        <ul className="adm-pasta__list">
                            {isFullMenu ? (
                                <>
                                    <li>El menú sumará la pasta armable; el resto se vende en el horario de la semana.</li>
                                    <li>La entrega sigue lo que diga el panel de Delivery.</li>
                                </>
                            ) : (
                                <>
                                    <li>El menú mostrará solo la pasta armable y las bebidas.</li>
                                    <li>Todo pedido nuevo será delivery y pedirá dirección.</li>
                                </>
                            )}
                            <li>Los pedidos ya creados no cambian.</li>
                        </ul>
                        <div className="adm-modal__actions">
                            <button type="button" className="adm-btn" onClick={() => setIsConfirming(false)} disabled={isSaving}>Cancelar</button>
                            <button type="button" className="adm-btn adm-btn--solid" onClick={() => void change(true)} disabled={isSaving}>
                                {isSaving ? "Activando…" : "Activar modo pasta"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
};
