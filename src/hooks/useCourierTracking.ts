import { useEffect, useRef, useState } from "react";

import { HttpError, getDistanceMeters, sendCourierPosition } from "@/helpers";

// Se manda al moverse mas de esto, o cada tanto aunque este quieto (semaforo, portón)
const MIN_MOVE_METERS = 25;
const MIN_SEND_MS = 8000;
const HEARTBEAT_MS = 15000;

export type CourierTrackingStatus = "off" | "waiting" | "sharing" | "denied" | "unavailable";

export interface ICourierTracking {
    status: CourierTrackingStatus;
    lastSentAt: number | null;
}

type Position = { lat: number; lng: number; accuracy: number | null };

/**
 * Comparte la ubicación del teléfono del repartidor con los pedidos que lleva, mientras la
 * página esté abierta. El navegador no deja hacerlo con la pantalla apagada: por eso pide que la
 * pantalla no se apague (Wake Lock) y avisa si se pierde el permiso.
 */
export const useCourierTracking = (token: string, orderIds: string[], onSessionExpired: () => void): ICourierTracking => {
    // Lo que dijo el GPS para este grupo de pedidos; al cambiar de pedidos vuelve a "buscando"
    const [reading, setReading] = useState<{ key: string; status: "waiting" | "sharing" | "denied" }>({ key: "", status: "waiting" });
    const [lastSentAt, setLastSentAt] = useState<number | null>(null);
    const latestRef = useRef<Position | null>(null);
    const lastSentRef = useRef<{ position: Position; at: number } | null>(null);
    const onSessionExpiredRef = useRef(onSessionExpired);
    useEffect(() => {
        onSessionExpiredRef.current = onSessionExpired;
    }, [onSessionExpired]);

    // Una cadena estable: el arreglo cambia de identidad en cada consulta aunque sean los mismos
    const idsKey = orderIds.slice().sort().join(",");

    useEffect(() => {
        const ids = idsKey ? idsKey.split(",") : [];
        if (ids.length === 0 || !("geolocation" in navigator)) return;

        let isActive = true;
        let wakeLock: WakeLockSentinel | null = null;

        const send = async (position: Position) => {
            lastSentRef.current = { position, at: Date.now() };
            const results = await Promise.allSettled(ids.map((id) => sendCourierPosition(token, id, position)));
            if (!isActive) return;
            if (results.some((result) => result.status === "rejected" && result.reason instanceof HttpError && result.reason.status === 401)) {
                onSessionExpiredRef.current();
                return;
            }
            // 409: ese pedido ya se entregó o lo soltó; la lista se actualiza sola en la próxima consulta
            if (results.some((result) => result.status === "fulfilled")) setLastSentAt(Date.now());
        };

        const watchId = navigator.geolocation.watchPosition(
            (reading) => {
                const position = {
                    lat: Math.round(reading.coords.latitude * 1e6) / 1e6,
                    lng: Math.round(reading.coords.longitude * 1e6) / 1e6,
                    accuracy: Number.isFinite(reading.coords.accuracy) ? Math.round(reading.coords.accuracy) : null,
                };
                latestRef.current = position;
                setReading({ key: idsKey, status: "sharing" });

                const last = lastSentRef.current;
                const hasMoved = !last || getDistanceMeters(last.position, position) >= MIN_MOVE_METERS;
                if (!last || (hasMoved && Date.now() - last.at >= MIN_SEND_MS)) void send(position);
            },
            (error) => {
                setReading({ key: idsKey, status: error.code === error.PERMISSION_DENIED ? "denied" : "waiting" });
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );

        // Quieto también cuenta: el cliente ve "actualizado hace…" y sabe que sigue ahí
        const heartbeat = window.setInterval(() => {
            const latest = latestRef.current;
            const last = lastSentRef.current;
            if (latest && (!last || Date.now() - last.at >= HEARTBEAT_MS)) void send(latest);
        }, 5000);

        const requestWakeLock = async () => {
            try {
                if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
                wakeLock = await navigator.wakeLock.request("screen");
            } catch {
                wakeLock = null;
            }
        };
        void requestWakeLock();
        document.addEventListener("visibilitychange", requestWakeLock);

        return () => {
            isActive = false;
            navigator.geolocation.clearWatch(watchId);
            window.clearInterval(heartbeat);
            document.removeEventListener("visibilitychange", requestWakeLock);
            wakeLock?.release().catch(() => null);
            lastSentRef.current = null;
        };
    }, [idsKey, token]);

    const status: CourierTrackingStatus = !idsKey
        ? "off"
        : !("geolocation" in navigator)
          ? "unavailable"
          : reading.key === idsKey ? reading.status : "waiting";

    return { status, lastSentAt };
};
