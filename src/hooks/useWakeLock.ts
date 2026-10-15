import { useEffect } from "react";

/**
 * Mantiene la pantalla encendida (Safari 16.4+). Con la pantalla apagada el iPad congela la pagina
 * y la campana de pedidos no suena; al volver a la pagina se pide de nuevo.
 */
export const useWakeLock = (isEnabled = true) => {
    useEffect(() => {
        if (!isEnabled) return;
        let sentinel: WakeLockSentinel | null = null;

        const requestWakeLock = async () => {
            try {
                if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
                sentinel = await navigator.wakeLock.request("screen");
            } catch {
                sentinel = null;
            }
        };

        requestWakeLock();
        document.addEventListener("visibilitychange", requestWakeLock);
        return () => {
            document.removeEventListener("visibilitychange", requestWakeLock);
            sentinel?.release().catch(() => null);
        };
    }, [isEnabled]);
};
