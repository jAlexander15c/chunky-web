/* Detecta si se desplego una version nueva del sitio comparando el build actual con /version.json. */
import { useSyncExternalStore } from "react";

// En dev no existe /version.json: el chequeo queda apagado
const isVersionCheckEnabled = !import.meta.env.DEV;

// Una pestana abierta todo el dia (cocina, caja) se entera del despliegue en menos de 5 minutos
const VERSION_CHECK_MS = 5 * 60 * 1000;

let isUpdateAvailable = false;
let request: Promise<void> | null = null;
let checkTimer: number | undefined;
const listeners = new Set<() => void>();

const fetchLatestBuildId = async () => {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { buildId?: string };
    return data.buildId ?? null;
};

const stopChecking = () => {
    window.clearInterval(checkTimer);
    document.removeEventListener("visibilitychange", checkWhenVisible);
    window.removeEventListener("online", checkWhenVisible);
};

/** Consulta /version.json; al ver otro build marca la actualizacion y deja de consultar. */
const checkForUpdate = () => {
    if (!isVersionCheckEnabled || isUpdateAvailable) return Promise.resolve();

    if (!request) {
        request = fetchLatestBuildId()
            .then((buildId) => {
                if (!buildId || buildId === __APP_BUILD_ID__) return;
                isUpdateAvailable = true;
                stopChecking();
                listeners.forEach((listener) => listener());
            })
            // Sin red o en pleno despliegue: se reintenta en el proximo chequeo
            .catch(() => undefined)
            .finally(() => {
                request = null;
            });
    }

    return request;
};

const checkWhenVisible = () => {
    if (document.visibilityState === "visible") void checkForUpdate();
};

let isReloading = false;

export const reloadApp = () => {
    isReloading = true;
    window.location.reload();
};

/** true desde que se pidio la recarga: la pagina nueva ya registra su propia visita. */
export const isAppReloading = () => isReloading;

// Un chunk del build anterior que ya no existe en el servidor: recargar trae el build nuevo
if (isVersionCheckEnabled) window.addEventListener("vite:preloadError", reloadApp);

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    if (listeners.size === 1 && !isUpdateAvailable) {
        void checkForUpdate();
        checkTimer = window.setInterval(checkWhenVisible, VERSION_CHECK_MS);
        document.addEventListener("visibilitychange", checkWhenVisible);
        window.addEventListener("online", checkWhenVisible);
    }

    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopChecking();
    };
};

const getSnapshot = () => isUpdateAvailable;

/** true cuando el servidor ya tiene un build distinto al que corre esta pestana. */
export const useAppUpdate = () => useSyncExternalStore(subscribe, getSnapshot);
