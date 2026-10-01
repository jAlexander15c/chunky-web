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
    getCashSuggestions,
    getChangeToCarry,
    getDeliveryReach,
    getDeliveryStage,
    getMinutesSince,
    getTrackingUrl,
    isUnpaidOrder,
    parseMoney,
    releaseDeliveryOrder,
    resolveLocationLink,
    shareTrackingLink,
    takeDeliveryOrder,
    useSettings,
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

    // "Paga con" que dijo el cliente (caja lo corrige) y con cuánto pagó al entregar
    const [cashText, setCashText] = useState(order.cashTendered ? order.cashTendered.toFixed(2) : "");
    const [receivedText, setReceivedText] = useState(order.cashTendered ? order.cashTendered.toFixed(2) : "");

    const { settings } = useSettings();
    const needsCollect = isUnpaidOrder(order);
    const contactPhone = getContactPhone(order);
    const isWhatsapp = order.paymentMethod === "whatsapp";

    const cashTendered = cashText.trim() ? parseMoney(cashText) : null;
    const cashError = !cashText.trim()
        ? ""
        : cashTendered === null
          ? "Escribe un monto, por ejemplo 20."
          : cashTendered + 0.005 < order.total ? `Con ${formatCash(cashTendered)} no alcanza para ${formatCash(order.total)}.` : "";
    const received = parseMoney(receivedText);
    const change = received !== null ? Math.round((received - order.total) * 100) / 100 : null;

    // A cuántos km del local queda el punto (el API rechaza pasado el máximo)
    const reach = isDelivery && point ? getDeliveryReach(settings.store, point) : null;

    const isDeliveryDirty =
        isDelivery !== Boolean(order.delivery) ||
        address.trim() !== (order.delivery?.address ?? "") ||
        details.trim() !== (order.delivery?.details ?? "") ||
        (point?.lat ?? null) !== (order.delivery?.lat ?? null) ||
        (point?.lng ?? null) !== (order.delivery?.lng ?? null) ||
        (isWhatsapp && cashTendered !== (order.cashTendered ?? null));

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
        // Para otra persona no se midió a nadie al pedir: sin el punto de quien recibe no se sabe si llegamos
        if (isDelivery && order.forSomeoneElse && !point) {
            setError("Es para otra persona: pega la ubicación de quien recibe para saber si llegamos.");
            return false;
        }
        if (reach?.reach === "out") {
            setError(`Queda a ${reach.km} km: el delivery llega hasta ${settings.store?.deliveryMaxKm ?? 20} km. Márcalo para retirar.`);
            return false;
        }
        if (cashError) {
            setError(cashError);
            return false;
        }
        return true;
    };

    const getChange = () => ({
        delivery: getDeliveryInput(),
        ...(isWhatsapp && { cashTendered }),
    });

    const confirm = () => {
        if (!validateDelivery()) return;
        void run(() => confirmDeliveryOrder(token, order.id, getChange()), "No pudimos confirmar el pedido.");
    };

    const saveDelivery = () => {
        if (!validateDelivery()) return;
        void run(() => changeOrderDelivery(token, order.id, getChange()), "No pudimos guardar los cambios.");
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
        const isCash = needsCollect && method === "efectivo";
        if (isCash && receivedText.trim() && (received === null || received + 0.005 < order.total)) {
            setError(`Con cuánto pagó: tiene que ser al menos ${formatCash(order.total)}.`);
            return;
        }
        const payment = needsCollect
            ? { method: method ?? undefined, cashReceived: isCash && receivedText.trim() ? received : null }
            : {};
        void run(() => deliverOrder(token, order.id, payment), "No pudimos entregar el pedido.", true);
    };

    const changeToCarry = getChangeToCarry(order);

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
                {order.forSomeoneElse ? (
                    <p className="ges-note">
                        <b>Es para otra persona.</b> Pídele por WhatsApp la ubicación de quien recibe y pégala abajo.
                    </p>
                ) : null}

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
                                    <p className={`dlv-point${reach?.reach === "out" ? " is-out" : reach?.reach === "far" ? " is-far" : ""}`} role="status">
                                        {reach?.reach === "out" ? "✕" : "✓"} Ubicación <code>{point.lat}, {point.lng}</code>
                                        {reach ? <span>· a {reach.km} km del local</span> : null}
                                        <a href={`https://www.google.com/maps?q=${point.lat},${point.lng}`} target="_blank" rel="noopener noreferrer">Ver</a>
                                        <button type="button" onClick={() => setPoint(null)}>Quitar</button>
                                        {reach?.reach === "far" ? <em>Lejos: puede tardar más.</em> : null}
                                        {reach?.reach === "out" ? <em>Más de {settings.store?.deliveryMaxKm ?? 20} km: no llega el delivery.</em> : null}
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
                        <span>{order.delivery.address}{order.distanceKm != null ? ` · a ${order.distanceKm} km` : ""}</span>
                        {order.delivery.details ? <span>{order.delivery.details}</span> : null}
                    </div>
                ) : (
                    <p className="ges-note">Para retirar en el local.</p>
                )}

                {/* Vuelto: caja corrige el "paga con" antes de que salga */}
                {isWhatsapp && needsCollect && canEditDelivery ? (
                    <div className="ges-field">
                        <span><label htmlFor="delivery-paga-con">Paga en efectivo con (opcional)</label></span>
                        <div className="dlv-link">
                            <input
                                id="delivery-paga-con"
                                type="text"
                                inputMode="decimal"
                                value={cashText}
                                placeholder="20.00"
                                onChange={(event) => { setCashText(event.target.value); setError(""); }}
                            />
                            <span className="ges-pill is-ok dlv-change">
                                {cashTendered !== null && !cashError && cashTendered > order.total + 0.005
                                    ? `Vuelto ${formatCash(cashTendered - order.total)}`
                                    : "Sin vuelto"}
                            </span>
                        </div>
                        {cashError ? <span className="ges-field__hint dlv-bad">{cashError}</span> : null}
                    </div>
                ) : null}

                {needsCollect && changeToCarry > 0 && (stage === "listo-salir" || stage === "en-camino") ? (
                    <div className="dlv-carry" role="status">
                        <span>Lleva de vuelto</span>
                        <b>{formatCash(changeToCarry)}</b>
                    </div>
                ) : null}

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
                            {method === "efectivo" ? (
                                <>
                                    <label className="ges-field">
                                        <span>Con cuánto pagó</span>
                                        <input
                                            id="delivery-recibido"
                                            type="text"
                                            inputMode="decimal"
                                            value={receivedText}
                                            placeholder="0.00"
                                            onChange={(event) => { setReceivedText(event.target.value); setError(""); }}
                                        />
                                    </label>
                                    <div className="ges-quick">
                                        {getCashSuggestions(order.total).map((value, index) => (
                                            <button key={value} type="button" onClick={() => setReceivedText(value.toFixed(2))}>
                                                {index === 0 ? `Justo ${formatCash(value)}` : formatCash(value)}
                                            </button>
                                        ))}
                                    </div>
                                    <div className={`ges-change${change !== null && change < -0.005 ? " is-short" : ""}`}>
                                        <span>{change !== null && change < -0.005 ? "Falta" : "Vuelto"}</span>
                                        <b>{formatCash(change !== null ? Math.abs(change) : 0)}</b>
                                    </div>
                                    <p className="ges-field__hint">Al cajón entra {formatCash(order.total)}: el vuelto salió de la caja y vuelve con el billete.</p>
                                </>
                            ) : (
                                <p className="ges-field__hint">Entra al turno abierto.</p>
                            )}
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
                            Guardar cambios
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
                            {isSending
                                ? "Guardando…"
                                : !needsCollect
                                  ? "Entregado"
                                  : method === "efectivo" && change !== null && change > 0.005
                                    ? `Cobrar ${formatCash(order.total)} y dar ${formatCash(change)}`
                                    : `Entregado y cobrado`}
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
