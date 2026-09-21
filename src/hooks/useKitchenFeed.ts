import { useCallback, useEffect, useRef, useState } from "react";

import { HttpError, fetchKitchenOrders, isChimeSoundOn, playChime, setKitchenStep, unlockChimeSound } from "@/helpers";
import type { IKitchenOrder, KitchenStep } from "@/helpers";

const POLL_MS = 5000;
// Sin respuesta del API por este tiempo se muestra la alerta de conexion
const OFFLINE_AFTER_MS = 15000;
// La campana se repite mientras haya pedidos sin aceptar
const CHIME_REPEAT_MS = 6000;
const TOAST_MS = 8000;

export interface IKitchenFeed {
    orders: IKitchenOrder[];
    newCount: number;
    // Hora de la ultima respuesta del API cuando se perdio la conexion; null si hay conexion
    offlineSince: number | null;
    isSoundOn: boolean;
    toast: IKitchenOrder | null;
    turnSoundOn: () => Promise<void>;
    updateOrder: (order: IKitchenOrder, step: KitchenStep) => Promise<void>;
    refresh: () => Promise<void>;
}

/**
 * Pedidos de la web para la cocina de /gestion. Consulta cada 5 s mientras la persona tenga caja,
 * este en la seccion que este: asi la campana y el aviso llegan aunque este cobrando una mesa.
 */
export const useKitchenFeed = (token: string, isEnabled: boolean, onSessionExpired: () => void): IKitchenFeed => {
    const [orders, setOrders] = useState<IKitchenOrder[]>([]);
    const [offlineSince, setOfflineSince] = useState<number | null>(null);
    const [isSoundOn, setIsSoundOn] = useState(isChimeSoundOn);
    const [toast, setToast] = useState<IKitchenOrder | null>(null);
    const lastSyncRef = useRef<number | null>(null);
    const seenIdsRef = useRef<Set<string> | null>(null);
    const onSessionExpiredRef = useRef(onSessionExpired);
    useEffect(() => {
        onSessionExpiredRef.current = onSessionExpired;
    }, [onSessionExpired]);

    const newCount = orders.filter((order) => !order.acceptedAt).length;

    const load = useCallback(async (signal?: AbortSignal) => {
        try {
            const { orders: nextOrders } = await fetchKitchenOrders(token, signal);
            lastSyncRef.current = Date.now();
            setOfflineSince(null);
            // Sin cambios no se vuelve a pintar gestion entera cada 5 s
            setOrders((current) => (JSON.stringify(current) === JSON.stringify(nextOrders) ? current : nextOrders));

            // Los que ya estaban al entrar no cuentan como "recien llegados"
            const seenIds = seenIdsRef.current;
            if (seenIds) {
                const arrived = nextOrders.filter((order) => !seenIds.has(order.id));
                if (arrived.length > 0) {
                    setToast(arrived[arrived.length - 1]);
                    playChime();
                }
            }
            seenIdsRef.current = new Set(nextOrders.map((order) => order.id));
        } catch (error) {
            if (signal?.aborted) return;
            if (error instanceof HttpError && error.status === 401) onSessionExpiredRef.current();
        }
    }, [token]);

    useEffect(() => {
        if (!isEnabled) return;
        const controller = new AbortController();
        const firstLoad = window.setTimeout(() => load(controller.signal), 0);
        const timer = window.setInterval(() => load(controller.signal), POLL_MS);
        return () => {
            controller.abort();
            window.clearTimeout(firstLoad);
            window.clearInterval(timer);
        };
    }, [isEnabled, load]);

    // Conexion y sonido (iOS lo suspende al bloquearse). Solo pinta cuando algo cambia.
    useEffect(() => {
        if (!isEnabled) return;
        const timer = window.setInterval(() => {
            const lastSyncAt = lastSyncRef.current;
            if (lastSyncAt !== null && Date.now() - lastSyncAt > OFFLINE_AFTER_MS) setOfflineSince(lastSyncAt);
            setIsSoundOn(isChimeSoundOn());
        }, 1000);
        return () => window.clearInterval(timer);
    }, [isEnabled]);

    // iOS solo deja activar el audio dentro de un toque: cualquiera en gestion sirve
    useEffect(() => {
        if (!isEnabled) return;
        const unlock = () => {
            unlockChimeSound().then(setIsSoundOn);
        };
        document.addEventListener("pointerdown", unlock, true);
        return () => document.removeEventListener("pointerdown", unlock, true);
    }, [isEnabled]);

    // La campana sigue sonando mientras haya pedidos sin aceptar
    useEffect(() => {
        if (!isEnabled || newCount === 0) return;
        const timer = window.setInterval(playChime, CHIME_REPEAT_MS);
        return () => window.clearInterval(timer);
    }, [isEnabled, newCount]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), TOAST_MS);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const turnSoundOn = useCallback(async () => {
        const isOn = await unlockChimeSound();
        setIsSoundOn(isOn);
        if (isOn) playChime();
    }, []);

    const updateOrder = useCallback(async (order: IKitchenOrder, step: KitchenStep) => {
        const { order: updated } = await setKitchenStep(token, order.id, step);
        setOrders((current) => step === "deliver"
            ? current.filter((entry) => entry.id !== order.id)
            : current.map((entry) => (entry.id === order.id ? updated : entry)));
    }, [token]);

    const refresh = useCallback(() => load(), [load]);

    return { orders, newCount, offlineSince, isSoundOn, toast, turnSoundOn, updateOrder, refresh };
};
