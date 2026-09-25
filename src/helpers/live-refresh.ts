import { useEffect, useRef } from "react";

const LIVE_REFRESH_MS = 30 * 1000;

/**
 * Para las pantallas del equipo que quedan abiertas todo el dia (la caja): vuelve a pedir el menu
 * cada 30 s con la pestaña visible y al volver a ella, asi un cambio hecho en /admin llega sin recargar.
 */
export const useLiveRefresh = (refresh: () => void, isEnabled: boolean) => {
    const refreshRef = useRef(refresh);
    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    useEffect(() => {
        if (!isEnabled) return;
        const run = () => {
            if (document.visibilityState === "visible") refreshRef.current();
        };
        const timer = window.setInterval(run, LIVE_REFRESH_MS);
        document.addEventListener("visibilitychange", run);
        window.addEventListener("focus", run);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", run);
            window.removeEventListener("focus", run);
        };
    }, [isEnabled]);
};

/** Sin cambios se conserva el valor anterior: la caja no se vuelve a pintar entera cada 30 s. */
export const keepIfSame = <T,>(current: T, next: T) => (JSON.stringify(current) === JSON.stringify(next) ? current : next);
