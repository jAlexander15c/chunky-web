import { useEffect } from "react";

import { reloadApp, useAppUpdate } from "@/helpers";

// Sin tocar la pantalla este rato (iPad de cocina en reposo) se puede recargar sin cortar a nadie
const IDLE_RELOAD_MS = 2 * 60 * 1000;

/** Alguien esta escribiendo: un conteo de caja o un formulario a medias se perderia. */
const isTyping = () => {
    const element = document.activeElement;
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
        || (element instanceof HTMLElement && element.isContentEditable);
};

/**
 * /admin, /gestion y /staff: con una version nueva se recarga solo al volver a la pestana o tras un rato
 * sin uso. Devuelve si hay version nueva para mostrar el aviso mientras tanto.
 */
export const useOperationalAutoUpdate = () => {
    const isUpdateAvailable = useAppUpdate();

    useEffect(() => {
        if (!isUpdateAvailable) return;
        let idleTimer: number | undefined;

        const reloadWhenIdle = () => {
            if (document.visibilityState === "visible" && !isTyping()) reloadApp();
            else scheduleIdleReload();
        };

        const scheduleIdleReload = () => {
            window.clearTimeout(idleTimer);
            idleTimer = window.setTimeout(reloadWhenIdle, IDLE_RELOAD_MS);
        };

        // Volver a la pestana (iPad desbloqueado, vuelven al tablero) es el momento mas seguro
        const reloadWhenVisible = () => {
            if (document.visibilityState === "visible") reloadApp();
        };

        scheduleIdleReload();
        const activityEvents = ["pointerdown", "keydown"] as const;
        activityEvents.forEach((name) => window.addEventListener(name, scheduleIdleReload));
        document.addEventListener("visibilitychange", reloadWhenVisible);

        return () => {
            window.clearTimeout(idleTimer);
            activityEvents.forEach((name) => window.removeEventListener(name, scheduleIdleReload));
            document.removeEventListener("visibilitychange", reloadWhenVisible);
        };
    }, [isUpdateAvailable]);

    return isUpdateAvailable;
};
