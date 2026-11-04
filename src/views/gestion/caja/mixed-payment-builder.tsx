import { useState } from "react";

import { HttpError, PAYMENT_LABEL, formatCash } from "@/helpers";
import type { ITicketPayment, PaymentMethod } from "@/helpers";
import { PAYMENT_METHODS, parseAmount, roundMoney } from "./helpers";

/** Hasta cuántas partes se puede armar un Mixto (la API acepta 10 pagos). */
const MAX_MIXED_PARTS = 10;

const EQUAL_SPLITS = [2, 3, 4];

/** Una parte de un Mixto mientras se arma. received es solo para calcular el vuelto. */
interface IMixedPart {
    key: number;
    method: PaymentMethod;
    amount: string;
    payerName: string;
    received: string;
}

let mixedPartKey = 0;

const getNewPart = (method: PaymentMethod = "efectivo", amount = ""): IMixedPart => ({
    key: ++mixedPartKey,
    method,
    amount,
    payerName: "",
    received: "",
});

/** El total en partes iguales al centavo; lo que sobra del redondeo va en la última. */
const getEqualAmounts = (total: number, count: number) => {
    const base = Math.floor((total / count) * 100) / 100;
    return Array.from({ length: count }, (_, index) =>
        index === count - 1 ? roundMoney(total - base * (count - 1)) : base
    );
};

const getPartsSum = (parts: IMixedPart[]) =>
    roundMoney(parts.reduce((sum, one) => sum + roundMoney(parseAmount(one.amount)), 0));

interface IMixedPaymentBuilderProps {
    total: number;
    onPay: (payments: ITicketPayment[]) => Promise<void>;
    onClose: () => void;
}

/**
 * Mixto: se arman las partes como las pida el cliente (medio, monto y quién paga), se
 * cambian o se quitan libremente, y se cobra todo junto cuando la suma cuadra con el total.
 * Nada se registra antes: cerrar el diálogo descarta lo armado. El vuelto del efectivo se
 * calcula por parte y se da aparte.
 */
export const MixedPaymentBuilder = ({ total, onPay, onClose }: IMixedPaymentBuilderProps) => {
    const [parts, setParts] = useState<IMixedPart[]>(() => [getNewPart()]);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const paid = getPartsSum(parts);
    const difference = roundMoney(total - paid);
    const isBalanced = Math.abs(difference) < 0.005;
    const hasEmptyPart = parts.some((one) => roundMoney(parseAmount(one.amount)) <= 0);
    const canPay = isBalanced && !hasEmptyPart && !isSending;

    const updatePart = (key: number, change: Partial<IMixedPart>) => {
        setParts((current) => current.map((one) => (one.key === key ? { ...one, ...change } : one)));
        setError("");
    };

    const removePart = (key: number) => {
        setParts((current) => current.filter((one) => one.key !== key));
        setError("");
    };

    // Lo que le falta a la cuenta sin contar esta parte: con eso la parte cierra el total
    const getMissingFor = (part: IMixedPart) =>
        Math.max(roundMoney(total - paid + roundMoney(parseAmount(part.amount))), 0);

    const splitEqually = (count: number) => {
        const amounts = getEqualAmounts(total, count);
        // Se respeta lo ya escrito de cada parte (medio y nombre); solo cambian los montos
        setParts((current) =>
            amounts.map((amount, index) =>
                current[index] ? { ...current[index], amount: amount.toFixed(2) } : getNewPart("efectivo", amount.toFixed(2))
            )
        );
        setError("");
    };

    const submit = async () => {
        setIsSending(true);
        setError("");

        try {
            await onPay(
                parts.map((one) => ({
                    method: one.method,
                    amount: roundMoney(parseAmount(one.amount)),
                    payerName: one.payerName.trim() || null,
                }))
            );
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo cobrar.");
            setIsSending(false);
        }
    };

    return (
        <>
            <div className="ges-split">
                <span>Partes iguales</span>
                {EQUAL_SPLITS.map((count) => (
                    <button key={count} type="button" disabled={isSending} onClick={() => splitEqually(count)}>
                        {count}
                    </button>
                ))}
            </div>

            <div className="ges-mixed">
                {parts.map((part, index) => {
                    const change = roundMoney(parseAmount(part.received) - parseAmount(part.amount));
                    const isShort = part.received !== "" && change < -0.005;
                    const missingFor = getMissingFor(part);

                    return (
                        <div className="ges-part" key={part.key}>
                            <div className="ges-part__head">
                                <span className="ges-part__lbl">Parte {index + 1}</span>
                                {parts.length > 1 ? (
                                    <button
                                        type="button"
                                        className="ges-part__drop"
                                        disabled={isSending}
                                        onClick={() => removePart(part.key)}
                                    >
                                        Quitar
                                    </button>
                                ) : null}
                            </div>

                            <div className="ges-part__row">
                                <label className="ges-field ges-field--sm">
                                    <span>Medio</span>
                                    <select
                                        id={`caja-parte-medio-${part.key}`}
                                        value={part.method}
                                        onChange={(event) => updatePart(part.key, { method: event.target.value as PaymentMethod })}
                                    >
                                        {PAYMENT_METHODS.map((option) => (
                                            <option key={option} value={option}>{PAYMENT_LABEL[option]}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="ges-field ges-field--sm">
                                    <span>Monto</span>
                                    <input
                                        id={`caja-parte-monto-${part.key}`}
                                        type="text"
                                        inputMode="decimal"
                                        value={part.amount}
                                        placeholder="0.00"
                                        onChange={(event) => updatePart(part.key, { amount: event.target.value })}
                                    />
                                </label>
                            </div>

                            <div className="ges-quick">
                                <button
                                    type="button"
                                    disabled={missingFor <= 0 || missingFor === roundMoney(parseAmount(part.amount))}
                                    onClick={() => updatePart(part.key, { amount: missingFor.toFixed(2) })}
                                >
                                    Lo que falta {formatCash(missingFor)}
                                </button>
                            </div>

                            <label className="ges-field ges-field--sm">
                                <span>Quién paga (opcional)</span>
                                <input
                                    id={`caja-parte-nombre-${part.key}`}
                                    type="text"
                                    maxLength={40}
                                    value={part.payerName}
                                    placeholder="Ej. Luis"
                                    onChange={(event) => updatePart(part.key, { payerName: event.target.value })}
                                />
                            </label>

                            {part.method === "efectivo" ? (
                                <div className="ges-part__row ges-part__row--end">
                                    <label className="ges-field ges-field--sm">
                                        <span>Con cuánto paga</span>
                                        <input
                                            id={`caja-parte-recibido-${part.key}`}
                                            type="text"
                                            inputMode="decimal"
                                            value={part.received}
                                            placeholder="0.00"
                                            onChange={(event) => updatePart(part.key, { received: event.target.value })}
                                        />
                                    </label>
                                    <div className={`ges-change ges-change--sm${isShort ? " is-short" : ""}`}>
                                        <span>{isShort ? "Falta" : "Vuelto"}</span>
                                        <b>{formatCash(part.received ? Math.abs(change) : 0)}</b>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    );
                })}

                {parts.length < MAX_MIXED_PARTS ? (
                    <button
                        type="button"
                        className="ges-mixed__add"
                        disabled={isSending}
                        // La parte nueva arranca con lo que falta, que es lo más común
                        onClick={() =>
                            setParts((current) => [
                                ...current,
                                getNewPart("efectivo", difference > 0.005 ? difference.toFixed(2) : ""),
                            ])
                        }
                    >
                        + Agregar parte
                    </button>
                ) : null}
            </div>

            <div className="ges-paidsum ges-paidsum--three">
                <div><span>Total</span><b>{formatCash(total)}</b></div>
                <div><span>Suma</span><b>{formatCash(paid)}</b></div>
                <div className={isBalanced ? "is-paid" : difference > 0 ? "is-missing" : "is-over"}>
                    <span>{isBalanced ? "Cuadra" : difference > 0 ? "Falta" : "Sobra"}</span>
                    <b>{formatCash(Math.abs(difference))}</b>
                </div>
            </div>

            {error ? <p className="ges-error" role="alert">{error}</p> : null}

            <button type="button" className="ges-btn ges-btn--solid ges-btn--block" disabled={!canPay} onClick={() => void submit()}>
                {isSending
                    ? "Cobrando…"
                    : canPay
                      ? `Cobrar ${formatCash(total)} en ${parts.length} ${parts.length === 1 ? "parte" : "partes"}`
                      : hasEmptyPart
                        ? "Falta el monto de una parte"
                        : "Cuadra las partes para cobrar"}
            </button>

            <p className="ges-note">
                Nada se registra hasta cobrar. En Loyverse sale un recibo por parte, con su tipo de pago y su monto.
            </p>

            <div className="ges-modal__acts ges-modal__acts--one">
                <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
            </div>
        </>
    );
};
