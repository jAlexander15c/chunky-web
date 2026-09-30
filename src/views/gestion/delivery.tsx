import { useEffect, useState } from "react";

import {
    HttpError,
    PAYMENT_LABEL,
    buildTrackingMessage,
    cancelDeliveryOrder,
    changeOrderDelivery,
    confirmDeliveryOrder,
    deliverOrder,
    formatCash,
    formatPastaOptions,
    formatPhone,
    getCustomerWhatsAppUrl,
    getDeliveryStage,
    getMinutesSince,
    getTrackingUrl,
    isUnpaidOrder,
    releaseDeliveryOrder,
    resolveLocationLink,
    shareTrackingLink,
    takeDeliveryOrder,
} from "@/helpers";
import type { CollaboratorRole, DeliveryStage, IDeliveryInput, IDeliveryOrder, PaymentMethod } from "@/helpers";
import type { IDeliveryFeed } from "@/hooks/useDeliveryFeed";
import type { ICourierTracking } from "@/hooks/useCourierTracking";

import "./delivery.css";

const PAYMENT_METHODS: PaymentMethod[] = ["efectivo", "tarjeta", "yappy"];

const formatClock = (value: string | number) =>
    new Date(value).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", hour12: true });

const STAGES: { stage: DeliveryStage; title: string; empty: string }[] = [
    { stage: "por-confirmar", title: "Por coordinar", empty: "Ningún pedido por WhatsApp esperando." },
    { stage: "en-cocina", title: "En cocina", empty: "Nada en preparación." },
    { stage: "listo-salir", title: "Listos para salir", empty: "Nada esperando repartidor." },
    { stage: "listo-retirar", title: "Listos para retirar", empty: "Nada esperando en el mostrador." },
    { stage: "en-camino", title: "En camino", empty: "Nadie en la calle." },
];

/** A quién se le escribe: su WhatsApp si dio otro, si no el celular del pedido. */
const getContactPhone = (order: IDeliveryOrder) => order.whatsappPhone ?? order.customerPhone;

const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof HttpError && error.status < 500 ? error.message : fallback;

/** "WhatsApp · por cobrar $10.75", "Yappy · pagado", "WhatsApp · cobrado en efectivo". */
const PaymentPill = ({ order }: { order: IDeliveryOrder }) => {
    if (order.paymentMethod !== "whatsapp") return <span className="ges-pill is-idle">Yappy · pagado</span>;
    if (isUnpaidOrder(order)) return <span className="ges-pill is-warn">Por cobrar {formatCash(order.total)}</span>;
    return <span className="ges-pill is-ok">Cobrado{order.collectedMethod ? ` · ${PAYMENT_LABEL[order.collectedMethod]}` : ""}</span>;
};

/* ============ Ficha del pedido ============ */

interface IOrderDialogProps {
    token: string;
    order: IDeliveryOrder;
    meId: number;
    roles: CollaboratorRole[];
    onChanged: (order: IDeliveryOrder) => void;
    onClose: () => void;
    onSessionExpired: () => void;
}

/** Punto leído del enlace, o el que ya traía el pedido. */
type Point = { lat: number; lng: number } | null;

const DeliveryOrderDialog = ({ token, order, meId, roles, onChanged, onClose, onSessionExpired }: IOrderDialogProps) => {
    const isCaja = roles.includes("caja");
    const stage = getDeliveryStage(order);
    const isPending = stage === "por-confirmar";
    const isMine = order.courierId === meId;
    const canEditDelivery = isCaja && !order.outAt;

    const [isDelivery, setIsDelivery] = useState(Boolean(order.delivery));
    const [address, setAddress] = useState(order.delivery?.address ?? "");
    const [details, setDetails] = useState(order.delivery?.details ?? "");
    const [point, setPoint] = useState<Point>(
        order.delivery?.lat != null && order.delivery.lng != null ? { lat: order.delivery.lat, lng: order.delivery.lng } : null
    );
    const [link, setLink] = useState("");
    const [isReading, setIsReading] = useState(false);
    const [linkError, setLinkError] = useState("");

    const [method, setMethod] = useState<PaymentMethod | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState("");
    const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
    const [copied, setCopied] = useState(false);

    const needsCollect = isUnpaidOrder(order);
    const contactPhone = getContactPhone(order);
    const isDeliveryDirty =
        isDelivery !== Boolean(order.delivery) ||
        address.trim() !== (order.delivery?.address ?? "") ||
        details.trim() !== (order.delivery?.details ?? "") ||
        (point?.lat ?? null) !== (order.delivery?.lat ?? null) ||
        (point?.lng ?? null) !== (order.delivery?.lng ?? null);

    const getDeliveryInput = (): IDeliveryInput | null => {
        if (!isDelivery) return null;
        return { address: address.trim(), details: details.trim() || null, lat: point?.lat ?? null, lng: point?.lng ?? null };
    };

    /** Corre una acción del API y deja el pedido actualizado; cierra si ya no hay nada que hacer. */
    const run = async (action: () => Promise<{ order: IDeliveryOrder }>, fallback: string, shouldClose = false) => {
        setIsSending(true);
        setError("");
        try {
            const { order: updated } = await action();
            onChanged(updated);
            if (shouldClose) onClose();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(getErrorMessage(requestError, fallback));
        } finally {
            setIsSending(false);
        }
    };

    const readLink = async () => {
        if (!link.trim()) return;
        setIsReading(true);
        setLinkError("");
        try {
            const found = await resolveLocationLink(token, link.trim());
            setPoint(found);
            setIsDelivery(true);
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setLinkError(getErrorMessage(requestError, "No pudimos leer ese enlace. Intenta de nuevo."));
        } finally {
            setIsReading(false);
        }
    };

    const validateDelivery = () => {
        if (isDelivery && address.trim().length < 5) {
            setError("Escribe la dirección (al menos 5 letras) o márcalo para retirar.");
            return false;
        }
        return true;
    };

    const confirm = () => {
        if (!validateDelivery()) return;
        void run(() => confirmDeliveryOrder(token, order.id, getDeliveryInput()), "No pudimos confirmar el pedido.");
    };

    const saveDelivery = () => {
        if (!validateDelivery()) return;
        void run(() => changeOrderDelivery(token, order.id, getDeliveryInput()), "No pudimos guardar la entrega.");
    };

    const copyLink = async () => {
        void shareTrackingLink(token, order.id).catch(() => null);
        try {
            await navigator.clipboard.writeText(getTrackingUrl(order));
            setCopied(true);
        } catch {
            setError("No se pudo copiar. Mantén presionado el enlace para copiarlo.");
        }
    };

    // Se abre directo del toque (iOS bloquea ventanas abiertas después de esperar al API)
    const sendLinkByWhatsApp = () => {
        void shareTrackingLink(token, order.id).catch(() => null);
    };

    const deliver = () => {
        if (needsCollect && !method) {
            setError("Elige con qué pagó el cliente.");
            return;
        }
        void run(() => deliverOrder(token, order.id, needsCollect ? method ?? undefined : undefined), "No pudimos entregar el pedido.", true);
    };

    const mapsUrl = point
        ? `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`
        : order.delivery?.mapUrl ?? null;

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Pedido de ${order.customerName}`}>
            <div className="ges-modal__panel dlv-dialog">
                <div className="dlv-dialog__head">
                    <h3 className="script">{order.customerName}</h3>
                    <PaymentPill order={order} />
                </div>
                <p className="dlv-dialog__meta">
                    #{order.id} · pedido a las {formatClock(order.createdAt)}
                    {order.confirmedByName ? ` · confirmó ${order.confirmedByName}` : ""}
                </p>

                {contactPhone ? (
                    <a className="ges-btn ges-btn--sm dlv-wa" href={getCustomerWhatsAppUrl(contactPhone)} target="_blank" rel="noopener noreferrer">
                        WhatsApp {formatPhone(contactPhone)}
                    </a>
                ) : null}

                <div className="ges-rows">
                    {order.lines.map((line, index) => (
                        <div className="ges-r" key={`${line.name}-${index}`}>
                            <span>
                                {line.quantity} × {line.name}
                                {(line.options || line.modifiers?.length) ? (
                                    <em>
                                        {" "}
                                        {[
                                            ...(line.options ? [formatPastaOptions(line.options)] : []),
                                            ...(line.modifiers ?? []).map((modifier) => `${modifier.name} ${modifier.option}`),
                                        ].join(" · ")}
                                    </em>
                                ) : null}
                            </span>
                        </div>
                    ))}
                </div>
                {order.note ? <p className="ges-note">Nota: {order.note}</p> : null}
                <div className="ges-total">
                    <span>{needsCollect ? "Por cobrar al entregar" : "Total"}</span>
                    <b>{formatCash(order.total)}</b>
                </div>

                {/* Dónde se entrega: caja lo arma con lo que manda el cliente */}
                {canEditDelivery ? (
                    <>
                        <p className="ges-sec">Entrega</p>
                        <div className="dlv-seg" role="group" aria-label="Retiro o delivery">
                            <button type="button" aria-pressed={!isDelivery} onClick={() => setIsDelivery(false)}>Retiro</button>
                            <button type="button" aria-pressed={isDelivery} onClick={() => setIsDelivery(true)}>Delivery</button>
                        </div>
                        {isDelivery ? (
                            <>
                                <div className="ges-field">
                                    <span><label htmlFor="delivery-enlace">Enlace de ubicación que mandó el cliente</label></span>
                                    <div className="dlv-link">
                                        <input
                                            id="delivery-enlace"
                                            type="text"
                                            inputMode="url"
                                            value={link}
                                            placeholder="https://maps.app.goo.gl/…"
                                            onChange={(event) => { setLink(event.target.value); setLinkError(""); }}
                                            onKeyDown={(event) => { if (event.key === "Enter") void readLink(); }}
                                        />
                                        <button type="button" className="ges-btn ges-btn--sm" onClick={() => void readLink()} disabled={isReading || !link.trim()}>
                                            {isReading ? "Leyendo…" : "Leer"}
                                        </button>
                                    </div>
                                </div>
                                {linkError ? <p className="ges-error" role="alert">{linkError}</p> : null}
                                {point ? (
                                    <p className="dlv-point" role="status">
                                        ✓ Ubicación <code>{point.lat}, {point.lng}</code>
                                        <a href={`https://www.google.com/maps?q=${point.lat},${point.lng}`} target="_blank" rel="noopener noreferrer">Ver</a>
                                        <button type="button" onClick={() => setPoint(null)}>Quitar</button>
                                    </p>
                                ) : (
                                    <p className="ges-field__hint">Sin punto el repartidor usa la dirección escrita y el cliente no ve su casa en el mapa.</p>
                                )}
                                <label className="ges-field">
                                    <span>Dirección</span>
                                    <input id="delivery-direccion" type="text" maxLength={200} value={address} onChange={(event) => setAddress(event.target.value)} />
                                </label>
                                <label className="ges-field">
                                    <span>Referencias</span>
                                    <input id="delivery-referencias" type="text" maxLength={200} value={details} placeholder="Portón, color de la casa, apto…" onChange={(event) => setDetails(event.target.value)} />
                                </label>
                            </>
                        ) : null}
                    </>
                ) : order.delivery ? (
                    <div className="dlv-dest">
                        <b>Entregar en</b>
                        <span>{order.delivery.address}</span>
                        {order.delivery.details ? <span>{order.delivery.details}</span> : null}
                    </div>
                ) : (
                    <p className="ges-note">Para retirar en el local.</p>
                )}

                {order.delivery && mapsUrl ? (
                    <a className="ges-btn ges-btn--sm" href={mapsUrl} target="_blank" rel="noopener noreferrer">Abrir en Maps</a>
                ) : null}

                {/* Enlace para que el cliente siga su pedido */}
                {isCaja && !isPending ? (
                    <div className="dlv-track">
                        <span className="ges-sec">Enlace de seguimiento{order.trackingSharedAt ? " · ya enviado" : ""}</span>
                        <code>{getTrackingUrl(order)}</code>
                        <div className="ges-acts">
                            <button type="button" className="ges-btn ges-btn--sm" onClick={() => void copyLink()}>{copied ? "Copiado" : "Copiar"}</button>
                            {contactPhone ? (
                                <a
                                    className="ges-btn ges-btn--sm ges-btn--solid"
                                    href={getCustomerWhatsAppUrl(contactPhone, buildTrackingMessage(order))}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={sendLinkByWhatsApp}
                                >
                                    Enviar por WhatsApp
                                </a>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {order.outAt ? (
                    <p className="ges-note">
                        {isMine ? "Lo llevas tú" : `Lo lleva ${order.courierName ?? "otra persona"}`} desde las {formatClock(order.outAt)}
                        {order.courierPosition ? ` · última ubicación: ${formatClock(order.courierPosition.at)}` : " · sin ubicación todavía"}
                    </p>
                ) : null}

                {/* Cobro al entregar */}
                {(stage === "en-camino" && (isMine || isCaja)) || stage === "listo-retirar" ? (
                    needsCollect ? (
                        <>
                            <p className="ges-sec">¿Cómo pagó?</p>
                            <div className="ges-pays ges-pays--three" role="group" aria-label="Medio de pago">
                                {PAYMENT_METHODS.map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        className="ges-pay"
                                        aria-pressed={method === option}
                                        onClick={() => { setMethod(option); setError(""); }}
                                    >
                                        {PAYMENT_LABEL[option]}
                                    </button>
                                ))}
                            </div>
                            <p className="ges-field__hint">Entra al turno abierto. El efectivo se entrega en caja al volver.</p>
                        </>
                    ) : null
                ) : null}

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts dlv-acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cerrar</button>

                    {isPending && isCaja ? (
                        <button type="button" className="ges-btn ges-btn--solid" onClick={confirm} disabled={isSending}>
                            {isSending ? "Confirmando…" : "Confirmar y mandar a cocina"}
                        </button>
                    ) : null}

                    {!isPending && canEditDelivery && isDeliveryDirty ? (
                        <button type="button" className="ges-btn ges-btn--solid" onClick={saveDelivery} disabled={isSending}>
                            Guardar entrega
                        </button>
                    ) : null}

                    {stage === "listo-salir" && !isDeliveryDirty ? (
                        <button
                            type="button"
                            className="ges-btn ges-btn--solid"
                            onClick={() => void run(() => takeDeliveryOrder(token, order.id), "No pudimos tomar el pedido.")}
                            disabled={isSending}
                        >
                            Tomar delivery
                        </button>
                    ) : null}

                    {(stage === "en-camino" && (isMine || isCaja)) || stage === "listo-retirar" ? (
                        <button type="button" className="ges-btn ges-btn--solid" onClick={deliver} disabled={isSending}>
                            {isSending ? "Guardando…" : needsCollect ? "Entregado y cobrado" : "Entregado"}
                        </button>
                    ) : null}
                </div>

                <div className="dlv-minor">
                    {stage === "en-camino" && (isMine || isCaja) ? (
                        <button
                            type="button"
                            className="ges-btn ges-btn--sm"
                            onClick={() => void run(() => releaseDeliveryOrder(token, order.id), "No pudimos soltar el pedido.")}
                            disabled={isSending}
                        >
                            Soltar delivery
                        </button>
                    ) : null}

                    {isCaja && order.paymentMethod === "whatsapp" && needsCollect ? (
                        isConfirmingCancel ? (
                            <span className="dlv-cancel">
                                ¿Cancelar el pedido de {order.customerName}?
                                <button
                                    type="button"
                                    className="ges-btn ges-btn--sm ges-btn--danger"
                                    onClick={() => void run(() => cancelDeliveryOrder(token, order.id), "No pudimos cancelar el pedido.", true)}
                                    disabled={isSending}
                                >
                                    Sí, cancelar
                                </button>
                                <button type="button" className="ges-btn ges-btn--sm" onClick={() => setIsConfirmingCancel(false)}>No</button>
                            </span>
                        ) : (
                            <button type="button" className="ges-btn ges-btn--sm" onClick={() => setIsConfirmingCancel(true)} disabled={isSending}>
                                Cancelar pedido
                            </button>
                        )
                    ) : null}
                </div>
            </div>
        </div>
    );
};

/* ============ Lista ============ */

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
    onSessionExpired: () => void;
}

export const GestionDelivery = ({ token, meId, roles, feed, tracking, onSessionExpired }: IGestionDeliveryProps) => {
    const [openId, setOpenId] = useState<string | null>(null);
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
                <p className="ges-empty">Cargando pedidos…</p>
            ) : (
                stages.map(({ stage, title, empty }) => {
                    const orders = feed.orders.filter((order) => getDeliveryStage(order) === stage);
                    return (
                        <section className="ges-card" key={stage} aria-label={title}>
                            <h2>{title} · {orders.length}</h2>
                            {orders.length === 0 ? (
                                <p className="ges-empty">{empty}</p>
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
