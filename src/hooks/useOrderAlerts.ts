import { useCallback, useEffect, useRef, useState } from "react";

import {
    HttpError,
    canUsePush,
    fetchOrderAlerts,
    getExistingPushSubscription,
    getNotificationPermission,
    getPushSubscription,
    isAppleMobile,
    subscribeOrderAlerts,
} from "@/helpers";

/**
 * - homeScreen: iPad o iPhone en Safari; los avisos solo llegan abriendo /gestion desde el icono de inicio
 * - denied: se rechazo el permiso; se cambia en Ajustes, no desde la pagina
 */
export type OrderAlertsStatus = "loading" | "off" | "on" | "homeScreen" | "denied" | "unsupported";

export interface IOrderAlerts {
    status: OrderAlertsStatus;
    isSaving: boolean;
    error: string;
    activate: () => Promise<void>;
}

/** Avisos push de cada pedido nuevo en esta tablet: llegan aunque la pantalla este apagada o en otra app. */
export const useOrderAlerts = (token: string, isEnabled: boolean, onSessionExpired: () => void): IOrderAlerts => {
    const [status, setStatus] = useState<OrderAlertsStatus>("loading");
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const onSessionExpiredRef = useRef(onSessionExpired);
    useEffect(() => {
        onSessionExpiredRef.current = onSessionExpired;
    }, [onSessionExpired]);

    useEffect(() => {
        if (!isEnabled) return;
        const controller = new AbortController();
        const load = async () => {
            if (!canUsePush()) {
                setStatus(isAppleMobile() ? "homeScreen" : "unsupported");
                return;
            }
            const existing = await getExistingPushSubscription();
            try {
                const current = await fetchOrderAlerts(token, existing?.endpoint ?? null, controller.signal);
                setPublicKey(current.publicKey);
                setStatus(current.isSubscribed ? "on" : getNotificationPermission() === "denied" ? "denied" : "off");
            } catch (loadError) {
                if (controller.signal.aborted) return;
                if (loadError instanceof HttpError && loadError.status === 401) onSessionExpiredRef.current();
                setStatus("off");
            }
        };
        void load();
        return () => controller.abort();
    }, [token, isEnabled]);

    // Debe llamarse dentro de un toque: Safari solo pide el permiso asi
    const activate = useCallback(async () => {
        setError("");
        if (!publicKey) {
            setError("Los avisos no están configurados en el servidor.");
            return;
        }
        setIsSaving(true);
        try {
            const subscription = await getPushSubscription(publicKey);
            if (!subscription) {
                setStatus(getNotificationPermission() === "denied" ? "denied" : "off");
                return;
            }
            await subscribeOrderAlerts(token, subscription);
            setStatus("on");
        } catch (saveError) {
            if (saveError instanceof HttpError && saveError.status === 401) return onSessionExpiredRef.current();
            setError("No pudimos activar los avisos. Intenta otra vez.");
        } finally {
            setIsSaving(false);
        }
    }, [publicKey, token]);

    return { status, isSaving, error, activate };
};
