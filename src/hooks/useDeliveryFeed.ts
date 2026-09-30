import { useCallback, useEffect, useRef, useState } from "react";

import { HttpError, fetchDeliveryOrders, playChime } from "@/helpers";
import type { IDeliveryOrder } from "@/helpers";

// Rapido: el repartidor y quien coordina ven lo mismo casi al instante
const POLL_MS = 5000;

export interface IDeliveryFeed {
    orders: IDeliveryOrder[];
    /** Pedidos por WhatsApp que nadie ha confirmado todavía. */
    pendingCount: number;
    /** Listos para salir que nadie ha tomado. */
    readyToGoCount: number;
    isLoaded: boolean;
    /** Deja el pedido que devolvió una acción sin esperar la próxima consulta. */
    replaceOrder: (order: IDeliveryOrder) => void;
    refresh: () => Promise<void>;
}

/**
 * Pedidos de la pestaña Delivery. Se consulta en cualquier sección de /gestion (como la cocina):
 * así el aviso de un pedido nuevo por WhatsApp suena aunque se esté cobrando una mesa, y el
 * teléfono del repartidor sigue sabiendo qué lleva.
 */
export const useDeliveryFeed = (
    token: string,
    isEnabled: boolean,
    onSessionExpired: () => void,
    shouldChime: boolean
): IDeliveryFeed => {
    const [orders, setOrders] = useState<IDeliveryOrder[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const seenPendingRef = useRef<Set<string> | null>(null);
    const onSessionExpiredRef = useRef(onSessionExpired);
    useEffect(() => {
        onSessionExpiredRef.current = onSessionExpired;
    }, [onSessionExpired]);

    const load = useCallback(async (signal?: AbortSignal) => {
        try {
            const { orders: nextOrders } = await fetchDeliveryOrders(token, signal);
            setOrders((current) => (JSON.stringify(current) === JSON.stringify(nextOrders) ? current : nextOrders));
            setIsLoaded(true);

            // Suena solo lo que llega con la pantalla abierta, no lo que ya estaba
            const pendingIds = nextOrders.filter((order) => order.status === "PENDING_CONFIRMATION").map((order) => order.id);
            const seen = seenPendingRef.current;
            if (seen && shouldChime && pendingIds.some((id) => !seen.has(id))) playChime();
            seenPendingRef.current = new Set([...(seen ?? []), ...pendingIds]);
        } catch (error) {
            if (signal?.aborted) return;
            if (error instanceof HttpError && error.status === 401) onSessionExpiredRef.current();
        }
    }, [token, shouldChime]);

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

    const replaceOrder = useCallback((order: IDeliveryOrder) => {
        // Entregado o cancelado ya no está en la pestaña
        const isGone = order.status === "CANCELLED" || order.status === "DELIVERED";
        setOrders((current) => (isGone
            ? current.filter((entry) => entry.id !== order.id)
            : current.map((entry) => (entry.id === order.id ? order : entry))));
    }, []);

    const refresh = useCallback(() => load(), [load]);

    return {
        orders,
        pendingCount: orders.filter((order) => order.status === "PENDING_CONFIRMATION").length,
        readyToGoCount: orders.filter((order) => order.delivery && order.readyAt && !order.outAt).length,
        isLoaded,
        replaceOrder,
        refresh,
    };
};
