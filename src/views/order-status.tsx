import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { PiWhatsappLogoBold } from "react-icons/pi";

import { useCart } from "@/components";
import {
    FAILED_ORDER_STATUSES,
    HttpError,
    PAID_ORDER_STATUSES,
    buildPaymentHelpMessage,
    fetchOrder,
    formatPrice,
    getFailedOrderReason,
    getLastOrderId,
    getWhatsAppUrl,
    setLastOrderId,
} from "@/helpers";
import type { IPublicOrder, OrderStatus } from "@/helpers";

// Rapido mientras se espera la confirmacion de Yappy; despues sigue lo que marca la cocina
const WAITING_POLL_MS = 3000;
const PREPARING_POLL_MS = 10000;
const READY_POLL_MS = 30000;

const getPollDelay = (status?: OrderStatus) => {
    if (!status || status === "PENDING_PAYMENT" || status === "PAID") return WAITING_POLL_MS;
    if (status === "IN_PREPARATION") return PREPARING_POLL_MS;
    if (status === "READY") return READY_POLL_MS;
    return null;
};

const formatTime = (value: string | null) =>
    value ? new Date(value).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" }) : "";

/** Consulta el pedido hasta que llegue a un estado final. */
const useOrderStatus = (orderId: string) => {
    const [order, setOrder] = useState<IPublicOrder | null>(null);
    const [isNotFound, setIsNotFound] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        let timer: number | undefined;

        const load = async () => {
            let nextStatus: OrderStatus | undefined;
            try {
                const next = await fetchOrder(orderId, controller.signal);
                setOrder(next);
                nextStatus = next.status;
            } catch (error) {
                if (controller.signal.aborted) return;
                if (error instanceof HttpError && error.status === 404) {
                    setIsNotFound(true);
                    return;
                }
            }
            const delay = getPollDelay(nextStatus);
            if (delay) timer = window.setTimeout(load, delay);
        };

        load();
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [orderId]);

    return { order, isNotFound };
};

const OrderTicket = ({ order }: { order: IPublicOrder }) => (
    <div className="order-ticket">
        <div className="order-ticket__top">
            <span>Pedido</span>
            <span className="order-ticket__code">{order.id}</span>
        </div>
        <ul className="order-ticket__body">
            {order.lines.map((line, index) => (
                <li key={`${line.name}-${index}`} className="order-ticket__row">
                    <span>{line.name} × {line.quantity}</span>
                    <span className="order-ticket__amount">{formatPrice(line.price * line.quantity)}</span>
                </li>
            ))}
            <li className="order-ticket__row order-ticket__row--total">
                <span>Total pagado</span>
                <span className="order-ticket__amount">{formatPrice(order.total)}</span>
            </li>
        </ul>
        {order.note && <p className="order-ticket__note">Nota: {order.note}</p>}
        <div className="order-ticket__perf" aria-hidden />
        <div className="order-ticket__foot">
            <span>Pagado con Yappy</span>
            <span>{formatTime(order.paidAt)}</span>
        </div>
    </div>
);

/** Titulo y texto segun el paso que marco la cocina. */
const getPaidOrderCopy = (order: IPublicOrder) => {
    if (order.status === "DELIVERED") return { title: `¡Buen provecho, ${order.customerName}!`, lede: "Tu pedido ya fue entregado. ¡Gracias por pedir en Chunky Bites!" };
    if (order.status === "READY") return { title: `¡Listo, ${order.customerName}!`, lede: "Tu pedido está listo para retirar." };
    if (order.acceptedAt) return { title: `¡Gracias, ${order.customerName}!`, lede: "Tu pago está confirmado y ya estamos preparando tu pedido." };
    return { title: `¡Gracias, ${order.customerName}!`, lede: "Tu pago está confirmado. La cocina recibió tu pedido y lo toma en un momento." };
};

const PaidOrder = ({ order }: { order: IPublicOrder }) => {
    const isReady = order.status === "READY" || order.status === "DELIVERED";
    const isAccepted = Boolean(order.acceptedAt) || isReady;
    const copy = getPaidOrderCopy(order);

    return (
        <>
            <h1 className="order-page__title script">{copy.title}</h1>
            <p className="order-page__lede">{copy.lede}</p>
            <ol className="order-steps">
                <li className="order-step order-step--done">
                    <span className="order-step__dot" aria-hidden>✓</span>
                    <span>Pago confirmado<small>Yappy · confirmación {order.yappyConfirmation ?? "en camino"}</small></span>
                </li>
                <li className={`order-step ${isReady ? "order-step--done" : "order-step--now"}`}>
                    <span className="order-step__dot" aria-hidden>{isReady ? "✓" : "2"}</span>
                    <span>
                        En preparación
                        <small>{isAccepted ? (order.acceptedAt ? `Desde las ${formatTime(order.acceptedAt)}` : "") : "Esperando que la cocina lo tome"}</small>
                    </span>
                </li>
                <li className={`order-step ${order.status === "DELIVERED" ? "order-step--done" : isReady ? "order-step--now" : ""}`}>
                    <span className="order-step__dot" aria-hidden>{order.status === "DELIVERED" ? "✓" : "3"}</span>
                    <span>Listo para retirar<small>{order.readyAt ? `Desde las ${formatTime(order.readyAt)}` : ""}</small></span>
                </li>
            </ol>
            <OrderTicket order={order} />
            <Link to="/menu" className="button button--ghost button--block">Volver al menú</Link>
        </>
    );
};

const FailedOrder = ({ order }: { order: IPublicOrder }) => {
    const { lines, setIsOpen } = useCart();
    const navigate = useNavigate();

    const retry = () => {
        navigate("/menu");
        setIsOpen(true);
    };

    const helpUrl = getWhatsAppUrl(buildPaymentHelpMessage(lines, { customerName: order.customerName, note: order.note ?? "" }, order.id));

    return (
        <>
            <span className="order-page__stamp" aria-hidden>Sin<br />cobro</span>
            <h1 className="order-page__title script">No se completó</h1>
            <p className="order-page__lede">
                {getFailedOrderReason(order.status)} <strong>No se hizo ningún cobro</strong>
                {lines.length > 0 ? " y tu carrito sigue guardado." : "."}
            </p>
            <div className="order-page__actions">
                {lines.length > 0 && (
                    <button type="button" className="button button--primary button--block" onClick={retry}>Volver a intentar</button>
                )}
                <a className="checkout__help" href={helpUrl} target="_blank" rel="noopener">
                    <PiWhatsappLogoBold aria-hidden /> Pedir por WhatsApp
                </a>
            </div>
        </>
    );
};

const WaitingOrder = ({ order }: { order: IPublicOrder | null }) => (
    <>
        <span className="order-page__spinner" aria-hidden />
        <h1 className="order-page__title script">Un momento{order ? `, ${order.customerName}` : ""}</h1>
        <p className="order-page__lede" role="status">Estamos esperando la confirmación de Yappy. Suele tardar unos segundos.</p>
        <p className="carrito__hint">Puedes cerrar esta página: tu pedido sigue su curso.</p>
    </>
);

export const OrderStatusView = () => {
    const { orderId = "" } = useParams();
    const { order, isNotFound } = useOrderStatus(orderId);
    const { clearCart } = useCart();

    // El carrito se vacia una sola vez, cuando se confirma el pago del pedido que se inicio aqui
    useEffect(() => {
        if (order && PAID_ORDER_STATUSES.includes(order.status) && getLastOrderId() === order.id) {
            clearCart();
            setLastOrderId(null);
        }
    }, [order, clearCart]);

    const isPaid = order && PAID_ORDER_STATUSES.includes(order.status);
    const isFailed = order && FAILED_ORDER_STATUSES.includes(order.status);

    return (
        <main className="section order-page">
            <div className="order-page__inner">
                {isNotFound ? (
                    <>
                        <h1 className="order-page__title script">No encontramos este pedido</h1>
                        <p className="order-page__lede">Revisa el enlace o escríbenos por WhatsApp con tu código de pedido.</p>
                        <Link to="/menu" className="button button--ghost button--block">Ver el menú</Link>
                    </>
                ) : isPaid ? (
                    <PaidOrder order={order} />
                ) : isFailed ? (
                    <FailedOrder order={order} />
                ) : (
                    <WaitingOrder order={order} />
                )}
            </div>
        </main>
    );
};
