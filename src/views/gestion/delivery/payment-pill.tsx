import { PAYMENT_LABEL, formatCash, isUnpaidOrder } from "@/helpers";
import type { IDeliveryOrder } from "@/helpers";

/** "WhatsApp · por cobrar $10.75", "Yappy · pagado", "Tarjeta · pagado", "WhatsApp · cobrado en efectivo". */
export const PaymentPill = ({ order }: { order: IDeliveryOrder }) => {
    if (order.paymentMethod === "card") return <span className="ges-pill is-idle">Tarjeta · pagado</span>;
    if (order.paymentMethod !== "whatsapp") return <span className="ges-pill is-idle">Yappy · pagado</span>;
    if (isUnpaidOrder(order)) return <span className="ges-pill is-warn">Por cobrar {formatCash(order.total)}</span>;
    return <span className="ges-pill is-ok">Cobrado{order.collectedMethod ? ` · ${PAYMENT_LABEL[order.collectedMethod]}` : ""}</span>;
};
