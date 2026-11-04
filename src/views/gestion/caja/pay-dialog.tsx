import { useState } from "react";

import { HttpError, PAYMENT_LABEL, formatCash, getTicketLabel } from "@/helpers";
import type { ITicket, ITicketPayment, PaymentMethod } from "@/helpers";
import { CustomerSuggest } from "./customer-suggest";
import type { ICustomerSuggestProps } from "./customer-suggest";
import { PAYMENT_METHODS, formatPaymentTime, getLowerLabel, parseAmount, roundMoney } from "./helpers";
import { CreditDialog } from "./credit-dialog";
import { MixedPaymentBuilder } from "./mixed-payment-builder";

interface IPayDialogProps extends Omit<ICustomerSuggestProps, "ticket"> {
    ticket: ITicket;
    onPay: (payments: ITicketPayment[]) => Promise<void>;
    onRemovePayment: (index: number) => Promise<void>;
    onCredit: (customerName: string) => Promise<void>;
    onClose: () => void;
}

export const PayDialog = ({
    ticket,
    onPay,
    onRemovePayment,
    onCredit,
    onClose,
    onFindCustomers,
    onAssignCustomer,
}: IPayDialogProps) => {
    const partials = ticket.payments ?? [];
    const hasPartials = partials.length > 0;

    const [isCrediting, setIsCrediting] = useState(false);
    // Con pagos del cobro anterior (uno por uno) se muestran en Mixto para quitarlos
    const [isMixed, setIsMixed] = useState(hasPartials);
    const [method, setMethod] = useState<PaymentMethod>("efectivo");
    const [received, setReceived] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [removing, setRemoving] = useState<number | null>(null);

    const total = ticket.total;
    const missing = roundMoney(total - ticket.paidAmount);
    const change = roundMoney(parseAmount(received) - total);
    const canPay = method !== "efectivo" || parseAmount(received) >= total - 0.005;

    const submit = async () => {
        setIsSending(true);
        setError("");

        try {
            await onPay([{ method, amount: total }]);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo cobrar.");
            setIsSending(false);
        }
    };

    const remove = async (index: number) => {
        setRemoving(index);
        setError("");

        try {
            await onRemovePayment(index);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo quitar el pago.");
        } finally {
            setRemoving(null);
        }
    };

    if (isCrediting) return <CreditDialog ticket={ticket} onCredit={onCredit} onBack={() => setIsCrediting(false)} />;

    // Con pagos por partes ese dinero ya está en el cajón: no hay abonos a un crédito
    const creditOption = (
        <>
            <div className="ges-or">o</div>
            <button
                type="button"
                className="ges-btn ges-btn--block ges-btn--credit"
                disabled={hasPartials || isSending}
                onClick={() => setIsCrediting(true)}
            >
                Dejar a crédito
            </button>
            {hasPartials ? (
                <p className="ges-field__hint">Quita los pagos registrados antes de dejarla a crédito.</p>
            ) : null}
        </>
    );

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Cobrar la cuenta">
            <div className="ges-modal__panel">
                <h3 className="script">Cobrar {getLowerLabel(getTicketLabel(ticket))}</h3>

                <CustomerSuggest ticket={ticket} onFindCustomers={onFindCustomers} onAssignCustomer={onAssignCustomer} />

                <div className="ges-total">
                    <span>{isMixed ? "Total de la cuenta" : "Total a cobrar"}</span>
                    <b>{formatCash(total)}</b>
                </div>

                <div className="ges-pays" role="group" aria-label="Medio de pago">
                    {PAYMENT_METHODS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            className="ges-pay"
                            aria-pressed={!isMixed && method === option}
                            disabled={hasPartials}
                            onClick={() => { setIsMixed(false); setMethod(option); setError(""); }}
                        >
                            {PAYMENT_LABEL[option]}
                        </button>
                    ))}
                    <button
                        type="button"
                        className="ges-pay"
                        aria-pressed={isMixed}
                        onClick={() => { setIsMixed(true); setError(""); }}
                    >
                        Mixto
                    </button>
                </div>

                {isMixed && hasPartials ? (
                    // Pagos registrados uno por uno antes del Mixto armado: se quitan y se arma de nuevo
                    <>
                        <span className="ges-part__lbl">Pagos registrados</span>
                        <div className="ges-ledger">
                            {partials.map((one, index) => (
                                <div className="ges-ledger__row" key={`${one.paidAt ?? ""}-${index}`}>
                                    <span className="ges-ledger__ok" aria-hidden="true">✓</span>
                                    <span className="ges-ledger__who">
                                        <b>{PAYMENT_LABEL[one.method]}{one.payerName ? ` · ${one.payerName}` : ""}</b>
                                        <small>
                                            {formatPaymentTime(one.paidAt)}
                                            {one.byName ? ` · cargó ${one.byName}` : ""}
                                        </small>
                                    </span>
                                    <span className="ges-ledger__amt">{formatCash(one.amount)}</span>
                                    <button
                                        type="button"
                                        className="ges-ledger__drop"
                                        aria-label={`Quitar el pago de ${formatCash(one.amount)}`}
                                        disabled={removing !== null}
                                        onClick={() => void remove(index)}
                                    >
                                        {removing === index ? "…" : "×"}
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="ges-paidsum">
                            <div className="is-paid"><span>Pagado</span><b>{formatCash(ticket.paidAmount)}</b></div>
                            <div className={missing < 0.005 ? "is-paid" : "is-missing"}><span>Falta</span><b>{formatCash(missing)}</b></div>
                        </div>

                        {error ? <p className="ges-error" role="alert">{error}</p> : null}

                        <p className="ges-note">
                            Estos pagos se registraron con el cobro anterior. Quítalos para armar el Mixto completo y
                            cobrarlo de una vez.
                        </p>

                        <div className="ges-modal__acts ges-modal__acts--one">
                            <button type="button" className="ges-btn" onClick={onClose}>Cerrar (la cuenta sigue abierta)</button>
                        </div>
                        {creditOption}
                    </>
                ) : isMixed ? (
                    <>
                        <MixedPaymentBuilder total={total} onPay={onPay} onClose={onClose} />
                        {creditOption}
                    </>
                ) : (
                    <>
                        {method === "efectivo" ? (
                            <>
                                <label className="ges-field">
                                    <span>Con cuánto paga</span>
                                    <input
                                        id="caja-recibido"
                                        type="text"
                                        inputMode="decimal"
                                        autoFocus
                                        value={received}
                                        placeholder="0.00"
                                        onChange={(event) => setReceived(event.target.value)}
                                    />
                                </label>
                                <div className="ges-quick">
                                    {[total, 20, 50, 100].map((value, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={() => setReceived(value.toFixed(2))}
                                        >
                                            {index === 0 ? `Justo ${formatCash(value)}` : formatCash(value)}
                                        </button>
                                    ))}
                                </div>
                                <div className={`ges-change${received && change < -0.005 ? " is-short" : ""}`}>
                                    <span>{received && change < -0.005 ? "Falta" : "Vuelto"}</span>
                                    <b>{formatCash(received ? Math.abs(change) : 0)}</b>
                                </div>
                            </>
                        ) : method === "yappy" ? (
                            <p className="ges-note">
                                El cliente paga por su app al comercio. Confirma solo cuando te llegue el aviso:
                                desde aquí no hay forma de verificarlo.
                            </p>
                        ) : (
                            <p className="ges-note">Se cobra en el datáfono. Aquí solo se registra que fue con tarjeta.</p>
                        )}

                        {error ? <p className="ges-error" role="alert">{error}</p> : null}

                        <div className="ges-modal__acts">
                            <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                            <button
                                type="button"
                                className="ges-btn ges-btn--solid"
                                onClick={() => void submit()}
                                disabled={!canPay || isSending}
                            >
                                {isSending
                                    ? "Cobrando…"
                                    : method === "efectivo" && change >= 0 && received
                                      ? `Cobrar y dar ${formatCash(change)}`
                                      : `Cobrar ${formatCash(total)}`}
                            </button>
                        </div>
                        {creditOption}
                    </>
                )}
            </div>
        </div>
    );
};
