import { useState } from "react";

import type { CollaboratorRole, DeliveryStage, IDeliveryOrder } from "@/helpers";
import type { ICourierTracking } from "@/hooks/useCourierTracking";
import type { IDeliveryFeed } from "@/hooks/useDeliveryFeed";
import type { IKitchenFeed } from "@/hooks/useKitchenFeed";

import { GestionCocina } from "./cocina";
import { GestionDelivery } from "./delivery";
import { DeliveryOrderDialog } from "./delivery/order-dialog";

import "./pedidos.css";

export type PedidosFilter = "todos" | "retiro" | "domicilio";

const FILTERS: { id: PedidosFilter; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "retiro", label: "Retiro" },
    { id: "domicilio", label: "Domicilio" },
];

/** Lo que caja ve de Domicilio: "En cocina" lo cubren los tickets de cocina. */
const CAJA_DOMICILIO_STAGES: DeliveryStage[] = ["por-confirmar", "en-cocina", "listo-salir", "en-camino"];

interface IGestionPedidosProps {
    token: string;
    meId: number;
    roles: CollaboratorRole[];
    kitchen: IKitchenFeed;
    delivery: IDeliveryFeed;
    tracking: ICourierTracking;
    filter: PedidosFilter;
    onFilterChange: (filter: PedidosFilter) => void;
    onSessionExpired: () => void;
}

/**
 * Los pedidos de la web en un solo lugar. Cada pedido sale una sola vez, según tenga o no
 * dirección de entrega: Retiro es el tablero de cocina (sin domicilio) y Domicilio, la lista de
 * delivery, con los tickets de cocina en su etapa "En cocina".
 */
export const GestionPedidos = ({ token, meId, roles, kitchen, delivery, tracking, filter, onFilterChange, onSessionExpired }: IGestionPedidosProps) => {
    const [openId, setOpenId] = useState<string | null>(null);
    const isCaja = roles.includes("caja");
    // El repartidor solo ve Domicilio, sin chips
    const current: PedidosFilter = isCaja ? filter : "domicilio";
    const openOrder = delivery.orders.find((order) => order.id === openId) ?? null;

    const refreshAfterStep = (order: Parameters<IKitchenFeed["updateOrder"]>[0], step: Parameters<IKitchenFeed["updateOrder"]>[1]) =>
        kitchen.updateOrder(order, step).then(() => delivery.refresh());
    const pickupFeed: IKitchenFeed = { ...kitchen, orders: kitchen.orders.filter((order) => !order.delivery), updateOrder: refreshAfterStep };
    // A domicilio, cocina solo atiende lo ya confirmado y sin marcar listo; el resto es de la lista de delivery
    const prepFeed: IKitchenFeed = {
        ...kitchen,
        orders: kitchen.orders.filter((order) => order.delivery && !order.isAwaitingConfirmation && !order.readyAt),
        updateOrder: refreshAfterStep,
    };
    const homeFeed: IDeliveryFeed = { ...delivery, orders: delivery.orders.filter((order) => order.delivery) };

    const openDelivery = (orderId?: string) => setOpenId(orderId ?? null);
    const changeOrder = (order: IDeliveryOrder) => {
        delivery.replaceOrder(order);
        if (isCaja) void kitchen.refresh();
    };

    const showPickup = current !== "domicilio";
    const showHome = current !== "retiro";

    const home = (
        <GestionDelivery
            meId={meId}
            roles={roles}
            feed={homeFeed}
            tracking={tracking}
            onOpenOrder={setOpenId}
            stages={isCaja ? CAJA_DOMICILIO_STAGES : undefined}
            kitchenSlot={
                isCaja ? (
                    <section className="ges-card" aria-label="En cocina">
                        <h2>En cocina · {prepFeed.orders.length}</h2>
                        <GestionCocina feed={prepFeed} token={token} onSessionExpired={onSessionExpired} part="prep" showOffline={current === "domicilio"} />
                    </section>
                ) : undefined
            }
        />
    );

    return (
        <div className="ped">
            {isCaja ? (
                <div className="ges-seg ped-filter" role="tablist" aria-label="Qué pedidos ver">
                    {FILTERS.map((one) => (
                        <button key={one.id} type="button" role="tab" aria-selected={current === one.id} onClick={() => onFilterChange(one.id)}>
                            {one.label}
                        </button>
                    ))}
                </div>
            ) : null}

            {showPickup ? (
                <section className="ped-block" aria-label="Retiro">
                    {current === "todos" ? <h2 className="ped-title">Retiro</h2> : null}
                    <GestionCocina feed={pickupFeed} token={token} onSessionExpired={onSessionExpired} onOpenDelivery={openDelivery} />
                </section>
            ) : null}

            {showHome ? (
                <section className="ped-block" aria-label="Domicilio">
                    {current === "todos" ? <h2 className="ped-title">Domicilio</h2> : null}
                    {home}
                </section>
            ) : null}

            {openOrder ? (
                <DeliveryOrderDialog
                    key={openOrder.id}
                    token={token}
                    order={openOrder}
                    meId={meId}
                    roles={roles}
                    onChanged={changeOrder}
                    onClose={() => setOpenId(null)}
                    onSessionExpired={onSessionExpired}
                />
            ) : null}
        </div>
    );
};
