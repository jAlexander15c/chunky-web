import { useEffect, useState } from "react";

import { formatCash, getChangeToCarry, getDeliveryStage, getMinutesSince, isUnpaidOrder } from "@/helpers";
import type { CollaboratorRole, DeliveryStage, IDeliveryOrder } from "@/helpers";
import type { ICourierTracking } from "@/hooks/useCourierTracking";
import type { IDeliveryFeed } from "@/hooks/useDeliveryFeed";
import { OpsEmpty, OpsSkeleton } from "@/components";
import { PaymentPill } from "./delivery/payment-pill";
import { formatClock } from "./delivery/helpers";
import { DeliveryOrderDialog } from "./delivery/order-dialog";

import "./delivery.css";

const STAGES: { stage: DeliveryStage; title: string; empty: string }[] = [
    { stage: "por-confirmar", title: "Por coordinar", empty: "Ningún pedido por WhatsApp esperando." },
    { stage: "en-cocina", title: "En cocina", empty: "Nada en preparación." },
    { stage: "listo-salir", title: "Listos para salir", empty: "Nada esperando repartidor." },
    { stage: "listo-retirar", title: "Listos para retirar", empty: "Nada esperando en el mostrador." },
    { stage: "en-camino", title: "En camino", empty: "Nadie en la calle." },
];

const DeliveryRow = ({ order, now, meId, onOpen }: { order: IDeliveryOrder; now: number; meId: number; onOpen: () => void }) => {
    const stage = getDeliveryStage(order);
    const since = stage === "en-camino" ? order.outAt : stage.startsWith("listo") ? order.readyAt : stage === "en-cocina" ? order.confirmedAt ?? order.paidAt : order.createdAt;
    const courierAge = order.courierPosition ? getMinutesSince(order.courierPosition.at, now) : null;

    return (
        <button type="button" className={`dlv-row${stage === "por-confirmar" ? " is-new" : ""}`} onClick={onOpen}>
            <span className="dlv-row__top">
                <b>{order.customerName}</b>
                <PaymentPill order={order} />
            </span>
            <span className="dlv-row__meta">
                #{order.id} · {order.delivery ? order.delivery.address : "Retiro en el local"}
                {order.forSomeoneElse ? " · para otra persona" : ""}
                {order.distanceKm != null ? ` · ${order.distanceKm} km` : ""}
                {isUnpaidOrder(order) && getChangeToCarry(order) > 0 ? ` · vuelto ${formatCash(getChangeToCarry(order))}` : ""}
            </span>
            <span className="dlv-row__meta">
                {since ? `hace ${getMinutesSince(since, now)} min` : ""}
                {stage === "en-camino"
                    ? ` · ${order.courierId === meId ? "lo llevas tú" : `con ${order.courierName ?? "alguien"}`}${courierAge === null ? " · sin ubicación" : ` · ubicación hace ${courierAge} min`}`
                    : ""}
                {stage === "en-cocina" && order.readyAt === null ? (order.acceptedAt ? " · preparando" : " · sin aceptar") : ""}
                {order.trackingSharedAt ? " · enlace enviado" : ""}
            </span>
        </button>
    );
};

const TRACKING_TEXT: Record<ICourierTracking["status"], string> = {
    off: "",
    waiting: "Buscando tu ubicación…",
    sharing: "Compartiendo tu ubicación",
    denied: "El teléfono no deja ver tu ubicación. Actívala para este sitio en el navegador.",
    unavailable: "Este navegador no comparte la ubicación.",
};

interface IGestionDeliveryProps {
    token: string;
    meId: number;
    roles: CollaboratorRole[];
    feed: IDeliveryFeed;
    tracking: ICourierTracking;
    /** Pedido que se abre al llegar (desde Cocina). */
    initialOpenId?: string | null;
    onSessionExpired: () => void;
}

export const GestionDelivery = ({ token, meId, roles, feed, tracking, initialOpenId = null, onSessionExpired }: IGestionDeliveryProps) => {
    const [openId, setOpenId] = useState<string | null>(initialOpenId);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 15000);
        return () => window.clearInterval(timer);
    }, []);

    const openOrder = feed.orders.find((order) => order.id === openId) ?? null;
    const myOrders = feed.orders.filter((order) => order.outAt && order.courierId === meId);
    // El repartidor sin caja solo ve lo que puede llevar o ya lleva
    const stages = roles.includes("caja") ? STAGES : STAGES.filter((one) => one.stage === "listo-salir" || one.stage === "en-camino");

    return (
        <div className="ges-cards dlv">
            {myOrders.length > 0 ? (
                <section className={`dlv-sharing${tracking.status === "denied" || tracking.status === "unavailable" ? " is-off" : ""}`} role="status">
                    <b><i aria-hidden="true" />{TRACKING_TEXT[tracking.status] || "Compartiendo tu ubicación"}</b>
                    <span>
                        Llevas {myOrders.length === 1 ? `el pedido de ${myOrders[0].customerName}` : `${myOrders.length} pedidos`}.
                        Deja esta pantalla abierta hasta entregar: si la cierras o se apaga, el cliente deja de verte.
                        {tracking.lastSentAt ? ` Última ubicación enviada: ${formatClock(tracking.lastSentAt)}` : ""}
                    </span>
                </section>
            ) : null}

            {!feed.isLoaded ? (
                <OpsSkeleton label="Cargando pedidos…" />
            ) : (
                stages.map(({ stage, title, empty }) => {
                    const orders = feed.orders.filter((order) => getDeliveryStage(order) === stage);
                    return (
                        <section className="ges-card" key={stage} aria-label={title}>
                            <h2>{title} · {orders.length}</h2>
                            {orders.length === 0 ? (
                                <OpsEmpty title={empty} />
                            ) : (
                                <div className="dlv-list">
                                    {orders.map((order) => (
                                        <DeliveryRow key={order.id} order={order} now={now} meId={meId} onOpen={() => setOpenId(order.id)} />
                                    ))}
                                </div>
                            )}
                        </section>
                    );
                })
            )}

            {openOrder ? (
                <DeliveryOrderDialog
                    key={openOrder.id}
                    token={token}
                    order={openOrder}
                    meId={meId}
                    roles={roles}
                    onChanged={feed.replaceOrder}
                    onClose={() => setOpenId(null)}
                    onSessionExpired={onSessionExpired}
                />
            ) : null}
        </div>
    );
};
