import { useCallback, useEffect, useState } from "react";

import {
    HttpError,
    PAYMENT_LABEL,
    fetchCredits,
    fetchShift,
    fetchTicket,
    formatCash,
    formatCreditDay,
    formatQuantity,
    getCreditAge,
    getTicketLineTotal,
    payCreditTicket,
} from "@/helpers";
import type { ICreditTicket, IShiftDetail, ITicketLine, PaymentMethod } from "@/helpers";

const PAYMENT_METHODS: PaymentMethod[] = ["efectivo", "tarjeta", "yappy"];

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const parseAmount = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
};

/** "Mesa 4 · 23/09 · dio Javier": de dónde salió el crédito. */
const getCreditOrigin = (credit: ICreditTicket) =>
    [
        credit.tableNumber !== null ? `Mesa ${credit.tableNumber}` : "Para llevar",
        credit.creditAt ? formatCreditDay(credit.creditAt) : null,
        credit.creditByName ? `dio ${credit.creditByName}` : null,
    ]
        .filter(Boolean)
        .join(" · ");

interface ICollectDialogProps {
    token: string;
    credit: ICreditTicket;
    onPaid: (credits: ICreditTicket[]) => Promise<void>;
    onClose: () => void;
    onSessionExpired: () => void;
}

/**
 * Cobra un crédito completo con un solo método. Entra en las ventas del turno abierto y
 * el recibo de Loyverse sale ahora, con el día en que se dio.
 */
const CollectDialog = ({ token, credit, onPaid, onClose, onSessionExpired }: ICollectDialogProps) => {
    const [lines, setLines] = useState<ITicketLine[] | null>(null);
    const [method, setMethod] = useState<PaymentMethod>("efectivo");
    const [received, setReceived] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        fetchTicket(token, credit.id, controller.signal)
            .then((data) => setLines(data.ticket.lines))
            .catch((requestError) => {
                if (controller.signal.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError("No pudimos leer las líneas de la cuenta.");
            });
        return () => controller.abort();
    }, [token, credit.id, onSessionExpired]);

    const total = credit.total;
    const change = roundMoney(parseAmount(received) - total);
    const canPay = method !== "efectivo" || parseAmount(received) >= total - 0.005;

    const submit = async () => {
        setIsSending(true);
        setError("");
        try {
            const data = await payCreditTicket(token, credit.id, method);
            await onPaid(data.credits);
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo cobrar el crédito.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Cobrar el crédito de ${credit.customerName ?? credit.label}`}>
            <div className="ges-modal__panel">
                <h3 className="script">Cobrar crédito · {credit.customerName ?? credit.label}</h3>
                <p className="ges-field__hint">{getCreditOrigin(credit)}</p>

                <div className="ges-rows">
                    {lines === null ? (
                        <p className="ges-empty">Cargando la cuenta…</p>
                    ) : (
                        lines.map((line) => (
                            <div className="ges-r" key={line.id}>
                                <span>{formatQuantity(line.quantity)} × {line.name}</span>
                                <b>{formatCash(getTicketLineTotal(line))}</b>
                            </div>
                        ))
                    )}
                </div>

                <div className="ges-total">
                    <span>Total a cobrar</span>
                    <b>{formatCash(total)}</b>
                </div>

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
                            <span>Con cuánto paga</span>
                            <input
                                id="creditos-recibido"
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
                                <button key={index} type="button" onClick={() => setReceived(value.toFixed(2))}>
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
                        El cliente paga por su app al comercio. Confirma solo cuando te llegue el aviso.
                    </p>
                ) : (
                    <p className="ges-note">Se cobra en el datáfono. Aquí solo se registra que fue con tarjeta.</p>
                )}

                <p className="ges-note">
                    Entra en las ventas de este turno. En Loyverse el recibo sale hoy, con la nota del día del crédito.
                </p>

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Volver</button>
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
            </div>
        </div>
    );
};

interface IGestionCreditosProps {
    token: string;
    onSessionExpired: () => void;
    onShiftChange: (shift: IShiftDetail | null) => void;
}

/** Quién debe y desde cuándo. Un crédito se cobra aquí, en el turno que esté abierto. */
export const GestionCreditos = ({ token, onSessionExpired, onShiftChange }: IGestionCreditosProps) => {
    const [credits, setCredits] = useState<ICreditTicket[]>([]);
    const [hasShift, setHasShift] = useState(false);
    const [collecting, setCollecting] = useState<ICreditTicket | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const handleError = useCallback(
        (requestError: unknown, fallback: string) => {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : fallback);
        },
        [onSessionExpired]
    );

    const loadShift = useCallback(
        async (signal?: AbortSignal) => {
            const data = await fetchShift(token, signal);
            setHasShift(Boolean(data.shift));
            onShiftChange(data.shift);
        },
        [token, onShiftChange]
    );

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const [creditData] = await Promise.all([fetchCredits(token, signal), loadShift(signal)]);
                setCredits(creditData.credits);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                handleError(requestError, "No pudimos cargar los créditos.");
            } finally {
                setIsLoading(false);
            }
        },
        [token, loadShift, handleError]
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    if (isLoading) return <p className="ges-empty">Cargando los créditos…</p>;

    const owed = roundMoney(credits.reduce((sum, one) => sum + one.total, 0));

    return (
        <div className="ges-cards">
            {error ? <p className="ges-error" role="alert">{error}</p> : null}

            <section className="ges-card">
                <div className="ges-total">
                    <span>Por cobrar · {credits.length} {credits.length === 1 ? "cuenta" : "cuentas"}</span>
                    <b>{formatCash(owed)}</b>
                </div>
                {!hasShift && credits.length > 0 ? (
                    <p className="ges-warn">Abre el turno en Turno para cobrar un crédito: el dinero tiene que entrar a una caja.</p>
                ) : null}
            </section>

            {credits.length === 0 ? (
                <p className="ges-empty">Nadie debe nada. Una cuenta se deja a crédito desde el cobro en Caja.</p>
            ) : (
                <div className="ges-credits">
                    {credits.map((credit) => {
                        const age = credit.creditAt ? getCreditAge(credit.creditAt) : null;
                        return (
                            <button
                                key={credit.id}
                                type="button"
                                className="ges-debt"
                                disabled={!hasShift}
                                onClick={() => setCollecting(credit)}
                            >
                                <b>
                                    {credit.customerName ?? credit.label}
                                    {age ? <span className={`ges-age${age.isOld ? " is-old" : ""}`}>{age.label}</span> : null}
                                </b>
                                <small>{getCreditOrigin(credit)}</small>
                                <span className="ges-debt__amt">{formatCash(credit.total)}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {collecting ? (
                <CollectDialog
                    token={token}
                    credit={collecting}
                    onClose={() => setCollecting(null)}
                    onSessionExpired={onSessionExpired}
                    onPaid={async (remaining) => {
                        setCredits(remaining);
                        setCollecting(null);
                        // El cobro sube las ventas del turno: el encabezado lo refleja
                        try {
                            await loadShift();
                        } catch (requestError) {
                            handleError(requestError, "No pudimos actualizar el turno.");
                        }
                    }}
                />
            ) : null}
        </div>
    );
};
