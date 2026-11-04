import { useState } from "react";

import { HttpError, loadSettings, setClientUpdateNotice, useSettings } from "@/helpers";

/* ============ Aviso de version nueva ============ */

/** Interruptor del aviso "Hay una version nueva" en el sitio publico. En /admin y /gestion el aviso sale siempre. */
export const ClientUpdateNoticePanel = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const { settings, isReady } = useSettings();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const isOn = settings.clientUpdateNotice;

    const toggle = async () => {
        setIsSaving(true);
        setError("");

        try {
            await setClientUpdateNotice(token, !isOn);
            await loadSettings();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cambiar el aviso de versión.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="adm-band adm-pasta">
            <div className="adm-band__head">
                <h2 className="script">Versión nueva</h2>
                <span className="adm-band__sub">Aviso al cliente cuando se publica un cambio en la web</span>
            </div>

            <div className="adm-pasta__row">
                <label className="adm-switch">
                    <input type="checkbox" checked={isOn} onChange={() => void toggle()} disabled={!isReady || isSaving} />
                    <span className="adm-switch__track" aria-hidden />
                    <span className="adm-switch__label">Avisar al cliente</span>
                </label>
                <span className={`adm-pasta__state ${isOn ? "adm-pasta__state--on" : ""}`} role="status">
                    {isReady ? (isOn ? "Activo" : "Apagado") : "Leyendo…"}
                </span>
            </div>

            <p className="adm-pasta__desc">
                {isOn
                    ? "El cliente ve \"Hay una versión nueva\" con un botón para actualizar. Igual se actualiza sola al cambiar de página."
                    : "El cliente no ve ningún aviso: la web se actualiza sola al cambiar de página, sin tocar el carrito."}
            </p>

            {error ? <p className="adm-error">{error}</p> : null}
        </section>
    );
};
