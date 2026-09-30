import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { PiWhatsappLogoBold } from "react-icons/pi";

import { OrderNotifyCard, useCart } from "@/components";
import {
    COLLECTED_LABEL,
    FAILED_ORDER_STATUSES,
    HttpError,
    PLACED_ORDER_STATUSES,
    buildPaymentHelpMessage,
    clearCheckoutDraft,
    fetchOrder,
    formatPastaOptions,
    formatPrice,
    getFailedOrderReason,
    getLastOrderId,
    getWhatsAppUrl,
    getWhatsappOrderChatUrl,
    playChime,
    rememberOrderAccess,
    setLastOrderId,
    trackEvent,
} from "@/helpers";
import type { IPublicOrder, OrderStatus } from "@/helpers";

// Leaflet solo se descarga cuando el pedido va en camino
const DeliveryMap = lazy(() => import("@/components/delivery-map"));

// Rapido mientras se espera la confirmacion de Yappy; despues sigue lo que marca la cocina
const WAITING_POLL_MS = 3000;
const ON_THE_WAY_POLL_MS = 5000;
const PREPARING_POLL_MS = 10000;
const READY_POLL_MS = 30000;
// Una ubicacion mas vieja que esto ya no dice por donde va: se avisa
const STALE_POSITION_MS = 2 * 60 * 1000;

const getPollDelay = (status?: OrderStatus) => {
    if (!status || status === "PENDING_PAYMENT" || status === "PAID") return WAITING_POLL_MS;
    if (status === "ON_THE_WAY") return ON_THE_WAY_POLL_MS;
    if (status === "PENDING_CONFIRMATION" || status === "CONFIRMED" || status === "IN_PREPARATION") return PREPARING_POLL_MS;
    if (status === "READY") return READY_POLL_MS;
    return null;
};

const formatTime = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", hour12: true }) : "";

/** "hace 12 s", "hace 3 min": cuánto hace que llegó la última ubicación. */
const formatAgo = (value: string, now: number) => {
    const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
    return seconds < 60 ? `hace ${seconds} s` : `hace ${Math.floor(seconds / 60)} min`;
};

const isWhatsappOrder = (order: IPublicOrder) => order.paymentMethod === "whatsapp";

/** Aviso que aparece en la pagina cuando el pedido cambia de paso estando abierta. */
type StepAlert = "confirmed" | "accepted" | "ready" | "out";

const getStepAlertText = (alert: StepAlert, isDelivery: boolean) => {
    if (alert === "confirmed") return { title: "Confirmamos tu pedido", text: "Ya va a la cocina.", tabTitle: "✅ Pedido confirmado" };
    if (alert === "accepted") return { title: "Estamos preparando tu pedido", text: "La cocina ya lo tomó.", tabTitle: "👩‍🍳 Preparando tu pedido" };
    if (alert === "out") return { title: "¡Tu pedido va en camino!", text: "Síguelo en el mapa.", tabTitle: "🛵 Pedido en camino" };
    return {
        title: "¡Tu pedido está listo!",
        text: isDelivery ? "Sale en un momento hacia tu dirección." : "Pasa a retirarlo cuando quieras.",
        tabTitle: "✅ ¡Pedido listo!",
    };
};

/** Que aviso corresponde al pasar de un estado al siguiente (null si no cambio de paso). */
const getStepAlert = (previous: IPublicOrder, next: IPublicOrder): StepAlert | null => {
    if (!previous.outAt && next.outAt) return "out";
    if (!previous.readyAt && next.readyAt) return "ready";
    if (!previous.acceptedAt && next.acceptedAt) return "accepted";
    if (!previous.confirmedAt && next.confirmedAt) return "confirmed";
    return null;
};

/** Consulta el pedido hasta que llegue a un estado final y avisa cuando cambia de paso. */
const useOrderStatus = (orderId: string, onStepChange: (alert: StepAlert) => void) => {
    const [order, setOrder] = useState<IPublicOrder | null>(null);
    const [isNotFound, setIsNotFound] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        let timer: number | undefined;
        let previous: IPublicOrder | null = null;

        const load = async () => {
            let nextStatus: OrderStatus | undefined;
            try {
                const next = await fetchOrder(orderId, controller.signal);
                setOrder(next);
                // Solo avisa de cambios ocurridos con la pagina abierta, no al cargarla
                const alert = previous && getStepAlert(previous, next);
                if (alert) onStepChange(alert);
                previous = next;
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
        // onStepChange se mantiene estable con useCallback
    }, [orderId, onStepChange]);

    return { order, isNotFound };
};

/** Lo que dice el ticket sobre el pago: pagado con Yappy, cobrado al entregar, o por pagar. */
const getTicketPayment = (order: IPublicOrder) => {
    if (!isWhatsappOrder(order)) return { total: "Total pagado", foot: "Pagado con Yappy", time: order.paidAt };
    if (order.collectedMethod) return { total: "Total pagado", foot: `Pagado en ${COLLECTED_LABEL[order.collectedMethod]}`, time: order.paidAt };
    return { total: "Total a pagar al recibir", foot: "Por WhatsApp · efectivo, tarjeta o Yappy", time: null };
};

const OrderTicket = ({ order }: { order: IPublicOrder }) => {
    const payment = getTicketPayment(order);

    return (
        <div className="order-ticket">
            <div className="order-ticket__top">
                <span>Pedido</span>
                <span className="order-ticket__code">{order.id}</span>
            </div>
            <ul className="order-ticket__body">
                {order.lines.map((line, index) => (
                    <li key={`${line.name}-${index}`} className="order-ticket__row">
                        <span>
                            {line.name} × {line.quantity}
                            {(line.options || line.modifiers?.length) && (
                                <small className="order-ticket__options">
                                    {[
                                        ...(line.options ? [formatPastaOptions(line.options)] : []),
                                        ...(line.modifiers ?? []).map((modifier) => `${modifier.name} ${modifier.option}`),
                                    ].join(" · ")}
                                </small>
                            )}
                        </span>
                        <span className="order-ticket__amount">{formatPrice(line.price * line.quantity)}</span>
                    </li>
                ))}
                <li className="order-ticket__row order-ticket__row--total">
                    <span>{payment.total}</span>
                    <span className="order-ticket__amount">{formatPrice(order.total)}</span>
                </li>
            </ul>
            {order.delivery && (
                <p className="order-ticket__note order-ticket__delivery">
                    <b>Entrega en</b>
                    {order.delivery.address}
                    {order.delivery.details && <span>{order.delivery.details}</span>}
                </p>
            )}
            <div className="order-ticket__perf" aria-hidden />
            <div className="order-ticket__foot">
                <span>{payment.foot}</span>
                <span>{formatTime(payment.time)}</span>
            </div>
        </div>
    );
};

/** Titulo y texto segun el paso en que va el pedido. */
const getPlacedOrderCopy = (order: IPublicOrder) => {
    const name = order.customerName;
    if (order.status === "DELIVERED") return { title: `¡Buen provecho, ${name}!`, lede: "Tu pedido ya fue entregado. ¡Gracias por pedir en Chunky Bites!" };
    if (order.status === "ON_THE_WAY") {
        return { title: `¡Va en camino, ${name}!`, lede: `${order.courier?.name || "El repartidor"} ya salió con tu pedido. Síguelo en el mapa.` };
    }
    if (order.status === "READY") {
        return { title: `¡Listo, ${name}!`, lede: order.delivery ? "Tu pedido está listo y sale en un momento hacia tu dirección." : "Tu pedido está listo para retirar." };
    }
    if (order.status === "PENDING_CONFIRMATION") return { title: `¡Recibimos tu pedido, ${name}!`, lede: "Te escribimos por WhatsApp para confirmarlo." };

    const start = isWhatsappOrder(order) ? "Confirmamos tu pedido" : "Tu pago está confirmado";
    if (order.acceptedAt) return { title: `¡Gracias, ${name}!`, lede: `${start} y ya lo estamos preparando.` };
    return { title: `¡Gracias, ${name}!`, lede: `${start}. La cocina lo toma en un momento.` };
};

/** Clase del paso: hecho, el de ahora, o todavia no. */
const getStepClass = (isDone: boolean, isNow: boolean) =>
    `order-step${isDone ? " order-step--done" : isNow ? " order-step--now" : ""}`;

const OrderSteps = ({ order }: { order: IPublicOrder }) => {
    const status = order.status;
    const isPending = status === "PENDING_CONFIRMATION";
    const isDelivered = status === "DELIVERED";
    const isOut = status === "ON_THE_WAY" || isDelivered;
    const isReady = status === "READY" || isOut;
    const isAccepted = Boolean(order.acceptedAt) || isReady;
    const isWhatsapp = isWhatsappOrder(order);

    const firstStep = isWhatsapp
        ? {
              title: isPending ? "Por confirmar" : "Confirmado por WhatsApp",
              detail: isPending
                  ? "Te escribimos en unos minutos"
                  : order.collectedMethod
                    ? `Pagado en ${COLLECTED_LABEL[order.collectedMethod]}`
                    : `Pagas al recibir${order.confirmedAt ? ` · ${formatTime(order.confirmedAt)}` : ""}`,
          }
        : { title: "Pago confirmado", detail: `Yappy · confirmación ${order.yappyConfirmation ?? "en camino"}` };

    return (
        <ol className="order-steps">
            <li className={getStepClass(!isPending, isPending)}>
                <span className="order-step__dot" aria-hidden>{isPending ? "1" : "✓"}</span>
                <span>{firstStep.title}<small>{firstStep.detail}</small></span>
            </li>
            <li className={getStepClass(isReady, !isPending && !isReady)}>
                <span className="order-step__dot" aria-hidden>{isReady ? "✓" : "2"}</span>
                <span>
                    En preparación
                    <small>
                        {isPending
                            ? ""
                            : isAccepted
                              ? (order.acceptedAt ? `Desde las ${formatTime(order.acceptedAt)}` : "")
                              : "Esperando que la cocina lo tome"}
                    </small>
                </span>
            </li>
            <li className={getStepClass(order.delivery ? isOut : isDelivered, isReady && !isOut)}>
                <span className="order-step__dot" aria-hidden>{(order.delivery ? isOut : isDelivered) ? "✓" : "3"}</span>
                <span>{order.delivery ? "Listo para salir" : "Listo para retirar"}<small>{order.readyAt ? `Desde las ${formatTime(order.readyAt)}` : ""}</small></span>
            </li>
            {order.delivery && (
                <li className={getStepClass(isDelivered, status === "ON_THE_WAY")}>
                    <span className="order-step__dot" aria-hidden>{isDelivered ? "✓" : "4"}</span>
                    <span>
                        En camino
                        <small>
                            {order.outAt
                                ? `${order.courier?.name ? `Con ${order.courier.name} · ` : ""}desde las ${formatTime(order.outAt)}`
                                : "Aquí verás el mapa"}
                        </small>
                    </span>
                </li>
            )}
        </ol>
    );
};

/** El mapa y quién lo lleva. La hora de la ultima ubicacion se refresca sola. */
const OnTheWay = ({ order }: { order: IPublicOrder }) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 5000);
        return () => window.clearInterval(timer);
    }, []);

    const position = order.courier?.position ?? null;
    const destination = order.delivery?.lat != null && order.delivery.lng != null
        ? { lat: order.delivery.lat, lng: order.delivery.lng }
        : null;
    const isStale = position !== null && now - new Date(position.at).getTime() > STALE_POSITION_MS;
    const courierName = order.courier?.name || "El repartidor";

    return (
        <section className="order-track" aria-label="Seguimiento del delivery">
            {destination || position ? (
                <div className="order-track__map">
                    <Suspense fallback={<div className="delivery-map delivery-map--loading" />}>
                        <DeliveryMap
                            destination={destination}
                            courier={position}
                            label={`Mapa con ${courierName} y tu dirección`}
                        />
                    </Suspense>
                    <span className={`order-track__fresh${isStale ? " is-stale" : ""}`} role="status">
                        <i aria-hidden />
                        {position ? `Actualizado ${formatAgo(position.at, now)}` : "Esperando la ubicación del repartidor"}
                    </span>
                </div>
            ) : null}
            <div className="order-track__courier">
                <span className="order-track__avatar" aria-hidden>{courierName.charAt(0).toUpperCase()}</span>
                <span>
                    <b>{courierName}</b>
                    <small>
                        {isStale
                            ? "No recibimos su ubicación hace un rato. Sigue en camino."
                            : `Salió a las ${formatTime(order.outAt)}`}
                    </small>
                </span>
            </div>
        </section>
    );
};

const PlacedOrder = ({ order }: { order: IPublicOrder }) => {
    const copy = getPlacedOrderCopy(order);
    const isPending = order.status === "PENDING_CONFIRMATION";

    return (
        <>
            <h1 className="order-page__title script">{copy.title}</h1>
            <p className="order-page__lede">{copy.lede}</p>
            {isPending && (
                <div className="order-callout">
                    <b>Lo coordinamos por WhatsApp</b>
                    <span>Si no se abrió el chat, tócalo aquí. Pagas al recibir: efectivo, tarjeta o Yappy.</span>
                    <a
                        className="button button--whatsapp button--block"
                        href={getWhatsappOrderChatUrl(order)}
                        target="_blank"
                        rel="noopener"
                        onClick={() => trackEvent("whatsapp_click", "pedido-por-confirmar")}
                    >
                        <PiWhatsappLogoBold aria-hidden /> Abrir WhatsApp
                    </a>
                </div>
            )}
            {order.status === "ON_THE_WAY" && <OnTheWay order={order} />}
            {/* En camino o entregado: no queda nada que avisar */}
            {order.status !== "DELIVERED" && order.status !== "ON_THE_WAY" && <OrderNotifyCard orderId={order.id} />}
            <OrderSteps order={order} />
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

    // La nota ya no viaja a esta página: el mensaje lleva el pedido y su código
    const helpUrl = isWhatsappOrder(order)
        ? getWhatsappOrderChatUrl(order)
        : getWhatsAppUrl(buildPaymentHelpMessage(lines, { customerName: order.customerName, note: "" }, order.id));

    return (
        <>
            <span className="order-page__stamp" aria-hidden>Sin<br />cobro</span>
            <h1 className="order-page__title script">{isWhatsappOrder(order) ? "Pedido cancelado" : "No se completó"}</h1>
            <p className="order-page__lede">
                {getFailedOrderReason(order.status, order.paymentMethod)} <strong>No se hizo ningún cobro</strong>
                {lines.length > 0 ? " y tu carrito sigue guardado." : "."}
            </p>
            <div className="order-page__actions">
                {lines.length > 0 && (
                    <button type="button" className="button button--primary button--block" onClick={retry}>Volver a intentar</button>
                )}
                <a className="checkout__help" href={helpUrl} target="_blank" rel="noopener" onClick={() => trackEvent("whatsapp_click", "pedido")}>
                    <PiWhatsappLogoBold aria-hidden /> Escríbenos por WhatsApp
                </a>
            </div>
        </>
    );
};

const WaitingOrder = ({ order }: { order: IPublicOrder | null }) => (
    <>
        <span className="order-page__spinner" aria-hidden />
        <h1 className="order-page__title script">Un momento{order ? `, ${order.customerName}` : ""}</h1>
        <p className="order-page__lede" role="status">
            {order ? "Estamos esperando la confirmación de Yappy. Suele tardar unos segundos." : "Buscando tu pedido…"}
        </p>
        <p className="carrito__hint">Puedes cerrar esta página: tu pedido sigue su curso.</p>
    </>
);

export const OrderStatusView = () => {
    const { orderId = "" } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { clearCart } = useCart();
    const [alert, setAlert] = useState<StepAlert | null>(null);

    // El enlace de seguimiento que manda el local trae la llave en ?t=: se guarda antes de la
    // primera consulta y se quita de la barra, para que no quede a la vista al compartir pantalla
    const trackingToken = searchParams.get("t");
    useState(() => {
        if (orderId && trackingToken) rememberOrderAccess(orderId, trackingToken);
    });
    useEffect(() => {
        if (trackingToken) setSearchParams({}, { replace: true });
    }, [trackingToken, setSearchParams]);

    // Campanita, vibracion y aviso en pantalla cuando el pedido avanza
    const announceStep = useCallback((nextAlert: StepAlert) => {
        playChime();
        navigator.vibrate?.([180, 90, 180]);
        setAlert(nextAlert);
    }, []);

    const { order, isNotFound } = useOrderStatus(orderId, announceStep);

    const isDelivery = Boolean(order?.delivery);

    // El titulo de la pestana tambien avisa si el cliente esta en otra pestana
    useEffect(() => {
        if (!alert) return;
        const previousTitle = document.title;
        document.title = getStepAlertText(alert, isDelivery).tabTitle;
        return () => {
            document.title = previousTitle;
        };
    }, [alert, isDelivery]);

    // El carrito y el borrador se vacian una sola vez, cuando sale el pedido que se inicio aqui
    // (pagado con Yappy o guardado para coordinar por WhatsApp)
    useEffect(() => {
        if (order && PLACED_ORDER_STATUSES.includes(order.status) && getLastOrderId() === order.id) {
            clearCart();
            clearCheckoutDraft();
            setLastOrderId(null);
        }
    }, [order, clearCart]);

    const isPlaced = order && PLACED_ORDER_STATUSES.includes(order.status);
    const isFailed = order && FAILED_ORDER_STATUSES.includes(order.status);

    return (
        <main className="section order-page">
            <div className="order-page__inner">
                {alert && (
                    <div className={`order-alert order-alert--${alert === "accepted" ? "accepted" : "ready"}`} role="status">
                        <span className="order-alert__icon" aria-hidden>{alert === "accepted" ? "♪" : "✓"}</span>
                        <span>
                            <b>{getStepAlertText(alert, isDelivery).title}</b>
                            <span>{getStepAlertText(alert, isDelivery).text}</span>
                        </span>
                    </div>
                )}
                {isNotFound ? (
                    <>
                        <h1 className="order-page__title script">No encontramos este pedido</h1>
                        <p className="order-page__lede">Revisa el enlace o escríbenos por WhatsApp con tu código de pedido.</p>
                        <Link to="/menu" className="button button--ghost button--block">Ver el menú</Link>
                    </>
                ) : isPlaced ? (
                    <PlacedOrder order={order} />
                ) : isFailed ? (
                    <FailedOrder order={order} />
                ) : (
                    <WaitingOrder order={order} />
                )}
            </div>
        </main>
    );
};
