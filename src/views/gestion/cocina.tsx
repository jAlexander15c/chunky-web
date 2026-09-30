import { useEffect, useState } from "react";

import { HttpError, KITCHEN_LATE_MINUTES, formatPastaOptions, formatPhone, formatPrice, getMinutesSince, isUnpaidOrder } from "@/helpers";
import type { IKitchenOrder, KitchenStep } from "@/helpers";
import type { IKitchenFeed } from "@/hooks/useKitchenFeed";

import "./cocina.css";

const formatClock = (date: Date | string | number) =>
    new Date(date).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", hour12: true });

/** "2× Café (leche especial)" para el aviso de pedido nuevo. */
const formatKitchenLine = (line: IKitchenOrder["lines"][number]) => {
    const details = [
        ...(line.options ? [formatPastaOptions(line.options, ", ")] : []),
        ...(line.modifiers ?? []).map((modifier) => `${modifier.name} ${modifier.option}`),
    ];
    return `${line.quantity}× ${line.name}${details.length ? ` (${details.join(", ")})` : ""}`;
};

/** Mantiene la pantalla encendida mientras la cocina esta abierta (Safari 16.4+). */
const useWakeLock = () => {
    useEffect(() => {
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
    }, []);
};

/* ============ Tablero ============ */

const STEP_ACTION: Record<KitchenStep, string> = {
    accept: "Aceptar pedido",
    ready: "Marcar listo",
    deliver: "Entregado",
};

/** "#CB… · $10.75 Yappy", "#CB… · $10.75 por cobrar (WhatsApp)" o "Caja" para las comandas del local. */
const getTicketOrigin = (order: IKitchenOrder) => {
    if (order.channel === "mesa") return "Caja";
    const payment = isUnpaidOrder(order) ? "por cobrar (WhatsApp)" : order.paymentMethod === "whatsapp" ? "WhatsApp" : "Yappy";
    return `${order.id} · ${formatPrice(order.total)} ${payment}`;
};

interface IKitchenTicketProps {
    order: IKitchenOrder;
    now: number;
    onStep: (order: IKitchenOrder, step: KitchenStep) => void;
    onOpenDelivery?: () => void;
}

const KitchenTicket = ({ order, now, onStep, onOpenDelivery }: IKitchenTicketProps) => {
    const isNew = !order.acceptedAt;
    const isReady = Boolean(order.readyAt);
    const step: KitchenStep = isNew ? "accept" : isReady ? "deliver" : "ready";
    // Lo que va a domicilio o se cobra al entregar no se cierra aquí: lo cierra Delivery
    const isHandledByDelivery = isReady && order.channel !== "mesa" && (Boolean(order.delivery) || isUnpaidOrder(order));

    // Nuevo: desde el pago · Preparando: desde que se acepto · Listo: desde que se marco
    const minutes = getMinutesSince(isReady ? order.readyAt : isNew ? order.paidAt : order.acceptedAt, now);
    const isLate = !isNew && !isReady && minutes >= KITCHEN_LATE_MINUTES;
    const timeLabel = isReady ? "listo hace" : isNew ? "hace" : "preparando";
    // Las comandas de la caja no traen telefono: sin esto la tarjeta rompia y la pantalla quedaba en blanco
    const contactPhone = order.whatsappPhone
        ? `WhatsApp ${formatPhone(order.whatsappPhone)}`
        : order.customerPhone ? `Tel ${formatPhone(order.customerPhone)}` : null;

    return (
        <article className={`kitchen-ticket ${isNew ? "kitchen-ticket--new" : ""} ${isReady ? "kitchen-ticket--ready" : ""}`}>
            <header className="kitchen-ticket__top">
                <span className="kitchen-ticket__name">
                    {order.customerName}
                    {order.delivery && <span className="kitchen-ticket__badge">Delivery</span>}
                    {isUnpaidOrder(order) && <span className="kitchen-ticket__badge kitchen-ticket__badge--due">Por cobrar</span>}
                </span>
                <span className={`kitchen-ticket__time ${isLate ? "kitchen-ticket__time--late" : ""}`}>
                    {timeLabel} <b>{minutes}</b> min
                </span>
            </header>
            <ul className="kitchen-ticket__items">
                {order.lines.map((line, index) => (
                    <li key={`${line.name}-${index}`}>
                        <b>{line.quantity}×</b>{line.name}
                        {(line.options || line.modifiers?.length) && (
                            <span className="kitchen-ticket__options">
                                {[
                                    ...(line.options ? [formatPastaOptions(line.options)] : []),
                                    ...(line.modifiers ?? []).map((modifier) => `${modifier.name} ${modifier.option}`),
                                ].join(" · ")}
                            </span>
                        )}
                        {line.note && <span className="kitchen-ticket__line-note">{line.note}</span>}
                    </li>
                ))}
            </ul>
            {order.delivery && (
                <div className="kitchen-ticket__dest">
                    <b>Entregar en</b>
                    <span>{order.delivery.address}</span>
                    {order.delivery.details && <span>{order.delivery.details}</span>}
                    <a href={order.delivery.mapUrl} target="_blank" rel="noopener noreferrer">Abrir en Maps</a>
                </div>
            )}
            {order.note && <p className="kitchen-ticket__note">Nota: {order.note}</p>}
            <div className="kitchen-ticket__meta">
                <span>{getTicketOrigin(order)} · {formatClock(order.paidAt)}</span>
                {contactPhone ? <span>{contactPhone}</span> : null}
            </div>
            {isHandledByDelivery ? (
                <button type="button" className="kitchen-ticket__action kitchen-ticket__action--deliver" onClick={onOpenDelivery} disabled={!onOpenDelivery}>
                    {order.outAt ? `En camino con ${order.courierName ?? "el repartidor"}` : "Ver en Delivery"}
                </button>
            ) : (
                <button type="button" className={`kitchen-ticket__action kitchen-ticket__action--${step}`} onClick={() => onStep(order, step)}>
                    {STEP_ACTION[step]}
                </button>
            )}
        </article>
    );
};

const KitchenColumn = ({ title, orders, empty, isNew, now, onStep, onOpenDelivery }: {
    title: string;
    orders: IKitchenOrder[];
    empty: string;
    isNew?: boolean;
    now: number;
    onStep: (order: IKitchenOrder, step: KitchenStep) => void;
    onOpenDelivery?: () => void;
}) => (
    <section className={`kitchen-col ${isNew ? "kitchen-col--new" : ""}`} aria-label={title}>
        <h2 className="kitchen-col__head">{title} <span className="kitchen-count">{orders.length}</span></h2>
        <div className="kitchen-col__list">
            {orders.length === 0
                ? <p className="kitchen-empty">{empty}</p>
                : orders.map((order) => <KitchenTicket key={order.id} order={order} now={now} onStep={onStep} onOpenDelivery={onOpenDelivery} />)}
        </div>
    </section>
);

interface IGestionCocinaProps {
    feed: IKitchenFeed;
    onSessionExpired: () => void;
    /** Lleva a la pestaña Delivery (cobro al entregar y pedidos a domicilio). */
    onOpenDelivery?: () => void;
}

export const GestionCocina = ({ feed, onSessionExpired, onOpenDelivery }: IGestionCocinaProps) => {
    const [now, setNow] = useState(() => Date.now());
    const [stepError, setStepError] = useState<string | null>(null);
    useWakeLock();

    // Reloj de los minutos de cada pedido
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 15000);
        return () => window.clearInterval(timer);
    }, []);

    const { orders, offlineSince, isSoundOn, turnSoundOn, updateOrder, refresh } = feed;
    const newOrders = orders.filter((order) => !order.acceptedAt);
    const preparingOrders = orders.filter((order) => order.acceptedAt && !order.readyAt);
    const readyOrders = orders.filter((order) => order.readyAt);

    const runStep = async (order: IKitchenOrder, step: KitchenStep) => {
        setStepError(null);
        try {
            await updateOrder(order, step);
        } catch (error) {
            if (error instanceof HttpError && error.status === 401) return onSessionExpired();
            setStepError(`No pudimos actualizar el pedido de ${order.customerName}. Intenta de nuevo.`);
            refresh();
        }
    };

    return (
        <div className="kitchen">
            {(offlineSince !== null || !isSoundOn) && (
                <div className="kitchen-banner" role="alert">
                    <span>
                        {offlineSince !== null
                            ? `No estamos recibiendo pedidos desde las ${formatClock(offlineSince)}: revisa el Wi-Fi. Reintentando…`
                            : "El sonido está apagado: los pedidos nuevos no van a sonar."}
                    </span>
                    {!isSoundOn && <button type="button" onClick={turnSoundOn}>Activar sonido</button>}
                </div>
            )}

            {stepError && <div className="kitchen-banner" role="alert"><span>{stepError}</span></div>}

            <div className="kitchen-board">
                <KitchenColumn title="Nuevos" orders={newOrders} empty="Sin pedidos nuevos" isNew now={now} onStep={runStep} />
                <KitchenColumn title="Preparando" orders={preparingOrders} empty="Nada en preparación" now={now} onStep={runStep} />
                <KitchenColumn title="Listos para retirar o enviar" orders={readyOrders} empty="Nada por entregar" now={now} onStep={runStep} onOpenDelivery={onOpenDelivery} />
            </div>
        </div>
    );
};

/** Aviso de pedido nuevo: sale en cualquier seccion de gestion. */
export const KitchenToast = ({ order }: { order: IKitchenOrder }) => (
    <div className="kitchen-toast" role="status">
        <span className="kitchen-toast__bell" aria-hidden>♪</span>
        <span>
            <b>Nuevo pedido{order.delivery ? " · Delivery" : ""} · {order.customerName}</b>
            <small>{order.lines.map(formatKitchenLine).join(", ")}</small>
        </span>
    </div>
);
