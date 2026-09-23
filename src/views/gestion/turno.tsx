import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
    FUND_MOVEMENT_LABEL,
    HttpError,
    PAYMENT_LABEL,
    closeShift,
    fetchFund,
    fetchShift,
    fetchTicket,
    formatCash,
    formatClock,
    formatDayClock,
    formatQuantity,
    getTicketLineTotal,
    openShift,
    refundTicket,
    registerCashMovement,
    registerFundMovement,
} from "@/helpers";
import type {
    IFund,
    IShiftDetail,
    IShiftTicket,
    ITicketLine,
    ITicketPayment,
    ManualFundMovementType,
    PaymentMethod,
} from "@/helpers";

const parseAmount = (value: string) => {
    if (value.trim() === "") return NaN;
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : NaN;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Cuántos movimientos del fondo aparte se ven en caja; el historial completo está en /admin. */
const FUND_MOVEMENTS_SHOWN = 8;

interface IMovementDialogProps {
    title: string;
    note: string;
    amountLabel: string;
    reasonPlaceholder: string;
    /** El ajuste puede dejar el fondo en cero; una entrada o salida no puede ser de cero. */
    allowZero?: boolean;
    getPreview?: (amount: number) => ReactNode;
    onSave: (amount: number, reason: string) => Promise<void>;
    onClose: () => void;
}

const MovementDialog = ({
    title,
    note,
    amountLabel,
    reasonPlaceholder,
    allowZero = false,
    getPreview,
    onSave,
    onClose,
}: IMovementDialogProps) => {
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const parsed = parseAmount(amount);
    const isValidAmount = Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0);

    const submit = async () => {
        if (!isValidAmount) {
            setError(allowZero ? "Escribe cuánto hay." : "Escribe un monto mayor que cero.");
            return;
        }
        if (reason.trim().length < 3) {
            setError("Escribe para qué fue.");
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onSave(roundMoney(parsed), reason.trim());
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo guardar.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={title}>
            <div className="ges-modal__panel">
                <h3 className="script">{title}</h3>
                <p className="ges-note">{note}</p>

                <label className="ges-field">
                    <span>{amountLabel}</span>
                    <input
                        id="turno-monto"
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={amount}
                        placeholder="0.00"
                        onChange={(event) => setAmount(event.target.value)}
                    />
                </label>

                {getPreview && isValidAmount ? getPreview(roundMoney(parsed)) : null}

                <label className="ges-field">
                    <span>Para qué</span>
                    <input
                        id="turno-motivo"
                        type="text"
                        value={reason}
                        placeholder={reasonPlaceholder}
                        onChange={(event) => setReason(event.target.value)}
                    />
                </label>

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="button" className="ges-btn ges-btn--solid" onClick={() => void submit()} disabled={isSending}>
                        {isSending ? "Guardando…" : "Guardar"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const CASH_DIALOG = {
    entrada: {
        title: "Entra efectivo",
        note: "Dinero que entra al cajón y no es una venta, por ejemplo cambio del banco.",
        reasonPlaceholder: "Cambio del banco",
    },
    salida: {
        title: "Sale efectivo",
        note: "Dinero que sale del cajón, por ejemplo una compra o las propinas repartidas.",
        reasonPlaceholder: "Compra de hielo",
    },
} as const;

const FUND_DIALOG: Record<ManualFundMovementType, { title: string; note: string; amountLabel: string; reasonPlaceholder: string }> = {
    entrada: {
        title: "Entra al fondo",
        note: "Efectivo que se suma al fondo aparte y no viene de un cierre, por ejemplo cambio en monedas.",
        amountLabel: "Monto",
        reasonPlaceholder: "Cambio en monedas",
    },
    salida: {
        title: "Sale del fondo",
        note: "Efectivo que sale del fondo aparte, por ejemplo un depósito al banco o un pago a un proveedor.",
        amountLabel: "Monto",
        reasonPlaceholder: "Depósito al banco",
    },
    ajuste: {
        title: "Ajustar el fondo",
        note: "Escribe cuánto hay de verdad en el fondo aparte. Se guarda la diferencia con el saldo y el motivo.",
        amountLabel: "Hay de verdad",
        reasonPlaceholder: "Recuento del sobre",
    },
};

interface IFundCardProps {
    fund: IFund;
    onMove: (type: ManualFundMovementType) => void;
}

/** El efectivo que no está en el cajón: da el fondo inicial al abrir y recibe lo contado al cerrar. */
const FundCard = ({ fund, onMove }: IFundCardProps) => (
    <section className="ges-card">
        <div className="ges-fund__head">
            <h2>Fondo aparte</h2>
            <div className="ges-fund__bal">
                <span>Hay ahora</span>
                <b>{formatCash(fund.balance)}</b>
            </div>
        </div>
        <p className="ges-field__hint">
            El efectivo que no está en el cajón. De aquí sale el fondo inicial al abrir y aquí vuelve lo contado al cerrar.
        </p>

        <div className="ges-rows">
            {fund.movements.length === 0 ? (
                <p className="ges-empty">Ningún movimiento todavía. Registra un ajuste con lo que hay hoy.</p>
            ) : (
                fund.movements.slice(0, FUND_MOVEMENTS_SHOWN).map((one) => (
                    <div className="ges-r" key={one.id}>
                        <span>
                            <span className={`ges-tag${one.shiftId ? " is-shift" : ""}`}>{FUND_MOVEMENT_LABEL[one.type]}</span>
                            {one.reason} <em>{one.actorName} · {formatDayClock(one.createdAt)}</em>
                        </span>
                        <b className={one.amount > 0 ? "is-in" : undefined}>
                            {one.amount > 0 ? "+" : "−"}{formatCash(Math.abs(one.amount))}
                        </b>
                    </div>
                ))
            )}
        </div>

        <div className="ges-fund__acts">
            <button type="button" className="ges-btn" onClick={() => onMove("entrada")}>Entrada</button>
            <button type="button" className="ges-btn" onClick={() => onMove("salida")}>Salida</button>
            <button type="button" className="ges-btn" onClick={() => onMove("ajuste")}>Ajuste</button>
        </div>
    </section>
);

/** Cuántas cuentas cobradas se ven de entrada; el resto se abre con "Ver todas". */
const SHIFT_TICKETS_SHOWN = 8;

/** "Tarjeta" o "Efectivo 6.00 + Yappy 8.00": cómo se pagó, dicho corto. */
const getPaymentsSummary = (payments: ITicketPayment[] | null) => {
    if (!payments?.length) return "Sin pago registrado";
    if (payments.length === 1) return PAYMENT_LABEL[payments[0].method];
    return payments
        .map((one) => `${PAYMENT_LABEL[one.method]} ${one.amount.toFixed(2)}${one.payerName ? ` (${one.payerName})` : ""}`)
        .join(" + ");
};

const REFUND_CHANNEL: Record<PaymentMethod, string> = {
    efectivo: "en efectivo del cajón",
    tarjeta: "por tarjeta",
    yappy: "por Yappy",
};

/** "Devuelve $6.00 en efectivo del cajón y $8.00 por Yappy.": lo que el cajero tiene que devolver. */
const getRefundInstructions = (payments: ITicketPayment[]) => {
    const parts = payments.map((one) => `${formatCash(one.amount)} ${REFUND_CHANNEL[one.method]}`);
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0];
    const cash = roundMoney(
        payments.filter((one) => one.method === "efectivo").reduce((sum, one) => sum + one.amount, 0)
    );
    return `Devuelve ${joined}.${cash > 0 ? ` El efectivo esperado baja ${formatCash(cash)}.` : ""}`;
};

interface IRefundDialogProps {
    token: string;
    ticket: IShiftTicket;
    onRefunded: (shift: IShiftDetail | null) => void;
    onClose: () => void;
    onSessionExpired: () => void;
}

/** Devuelve completa una cuenta cobrada por error. Muestra lo que tenía y cuánto vuelve por cada método. */
const RefundDialog = ({ token, ticket, onRefunded, onClose, onSessionExpired }: IRefundDialogProps) => {
    const [lines, setLines] = useState<ITicketLine[] | null>(null);
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        fetchTicket(token, ticket.id, controller.signal)
            .then((data) => setLines(data.ticket.lines))
            .catch((requestError) => {
                if (controller.signal.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError("No pudimos leer las líneas de la cuenta.");
            });
        return () => controller.abort();
    }, [token, ticket.id, onSessionExpired]);

    const submit = async () => {
        if (reason.trim().length < 3) {
            setError("Escribe por qué se reembolsa.");
            return;
        }

        setIsSending(true);
        setError("");
        try {
            const data = await refundTicket(token, ticket.id, reason.trim());
            onRefunded(data.shift);
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo reembolsar.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Reembolsar ${ticket.label}`}>
            <div className="ges-modal__panel">
                <h3 className="script">Reembolsar {ticket.label}</h3>

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
                    <div className="ges-r is-big"><span>Se devuelve</span><b>{formatCash(ticket.total)}</b></div>
                </div>

                {ticket.payments?.length ? (
                    <p className="ges-warn">{getRefundInstructions(ticket.payments)}</p>
                ) : null}

                <label className="ges-field">
                    <span>Motivo</span>
                    <input
                        id="turno-reembolso-motivo"
                        type="text"
                        autoFocus
                        value={reason}
                        placeholder="Se cobró a la mesa equivocada"
                        onChange={(event) => setReason(event.target.value)}
                    />
                </label>

                <p className="ges-note">
                    En Loyverse queda un recibo de reembolso ligado al original y los productos vuelven al stock.
                    Si algo sí se entregó, regístralo como merma en Inventario. No se puede deshacer.
                </p>

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button
                        type="button"
                        className="ges-btn ges-btn--danger"
                        onClick={() => void submit()}
                        disabled={isSending}
                    >
                        {isSending ? "Reembolsando…" : `Reembolsar ${formatCash(ticket.total)}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface IShiftTicketsCardProps {
    tickets: IShiftTicket[];
    onRefund: (ticket: IShiftTicket) => void;
}

/** Las cuentas cobradas del turno, la más reciente arriba, con su reembolso a mano. */
const ShiftTicketsCard = ({ tickets, onRefund }: IShiftTicketsCardProps) => {
    const [showAll, setShowAll] = useState(false);
    const shown = showAll ? tickets : tickets.slice(0, SHIFT_TICKETS_SHOWN);

    return (
        <section className="ges-card">
            <h2>Cuentas cobradas</h2>
            <p className="ges-field__hint">Las de este turno. Si una se cobró por error, se reembolsa completa.</p>

            <div className="ges-rows">
                {tickets.length === 0 ? (
                    <p className="ges-empty">Ninguna todavía.</p>
                ) : (
                    shown.map((one) =>
                        one.status === "reembolsada" ? (
                            <div className="ges-r is-ticket is-refunded" key={one.id}>
                                <span>
                                    {one.label}{" "}
                                    <em>
                                        {getPaymentsSummary(one.payments)} · reembolsada por {one.refundedByName}
                                        {one.refundedAt ? ` · ${formatClock(one.refundedAt)}` : ""} · “{one.refundReason}”
                                        {one.refundPending ? " · Loyverse pendiente" : ""}
                                    </em>
                                </span>
                                <span className="ges-r__end">
                                    <span className="ges-tag is-crit">Reembolsada</span>
                                    <b>{formatCash(one.total)}</b>
                                </span>
                            </div>
                        ) : (
                            <div className="ges-r is-ticket" key={one.id}>
                                <span>
                                    {one.label}{" "}
                                    <em>
                                        {getPaymentsSummary(one.payments)} · {one.closedByName}
                                        {one.closedAt ? ` · ${formatClock(one.closedAt)}` : ""}
                                    </em>
                                </span>
                                <span className="ges-r__end">
                                    <b>{formatCash(one.total)}</b>
                                    <button type="button" className="ges-btn ges-btn--sm" onClick={() => onRefund(one)}>
                                        Reembolsar
                                    </button>
                                </span>
                            </div>
                        )
                    )
                )}
            </div>

            {tickets.length > SHIFT_TICKETS_SHOWN ? (
                <button type="button" className="ges-btn" onClick={() => setShowAll(!showAll)}>
                    {showAll ? "Ver menos" : `Ver todas (${tickets.length})`}
                </button>
            ) : null}
        </section>
    );
};

interface IGestionTurnoProps {
    token: string;
    onSessionExpired: () => void;
    onShiftChange: (shift: IShiftDetail | null) => void;
}

export const GestionTurno = ({ token, onSessionExpired, onShiftChange }: IGestionTurnoProps) => {
    const [shift, setShift] = useState<IShiftDetail | null>(null);
    const [fund, setFund] = useState<IFund | null>(null);
    const [starting, setStarting] = useState("40.00");
    const [counted, setCounted] = useState("");
    const [movement, setMovement] = useState<"entrada" | "salida" | null>(null);
    const [fundMovement, setFundMovement] = useState<ManualFundMovementType | null>(null);
    const [refunding, setRefunding] = useState<IShiftTicket | null>(null);
    // Solo quien abrió el turno lo cierra: lo decide la API según la sesión
    const [canClose, setCanClose] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);

    const apply = useCallback(
        (next: IShiftDetail | null) => {
            setShift(next);
            onShiftChange(next);
        },
        [onShiftChange]
    );

    const handleError = useCallback(
        (requestError: unknown, fallback: string) => {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : fallback);
        },
        [onSessionExpired]
    );

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const [shiftData, fundData] = await Promise.all([fetchShift(token, signal), fetchFund(token, signal)]);
                apply(shiftData.shift);
                setCanClose(shiftData.canClose);
                setFund(fundData.fund);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                handleError(requestError, "No pudimos cargar el turno.");
            } finally {
                setIsLoading(false);
            }
        },
        [token, apply, handleError]
    );

    /** Abrir y cerrar mueven el fondo aparte: se relee para que el saldo no quede viejo. */
    const reloadFund = async () => {
        try {
            setFund((await fetchFund(token)).fund);
        } catch (requestError) {
            handleError(requestError, "No pudimos actualizar el fondo aparte.");
        }
    };

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    if (isLoading) return <p className="ges-empty">Cargando el turno…</p>;

    const fundCard = fund ? <FundCard fund={fund} onMove={setFundMovement} /> : null;

    const fundDialog = fundMovement && fund ? (
        <MovementDialog
            {...FUND_DIALOG[fundMovement]}
            allowZero={fundMovement === "ajuste"}
            getPreview={
                fundMovement === "ajuste"
                    ? (amount) => {
                          const difference = roundMoney(amount - fund.balance);
                          return (
                              <div className="ges-from">
                                  <span>Hoy dice {formatCash(fund.balance)} · se guarda</span>
                                  <b>{difference > 0 ? "+" : difference < 0 ? "−" : ""}{formatCash(Math.abs(difference))}</b>
                              </div>
                          );
                      }
                    : undefined
            }
            onClose={() => setFundMovement(null)}
            onSave={async (amount, reason) => {
                const data = await registerFundMovement(token, { type: fundMovement, amount, reason });
                setFund(data.fund);
                setFundMovement(null);
            }}
        />
    ) : null;

    /* ---- Sin turno abierto ---- */
    if (!shift) {
        const startingValue = parseAmount(starting);
        const isValidStarting = Number.isFinite(startingValue) && startingValue >= 0;
        const fundLeft = fund && isValidStarting ? roundMoney(fund.balance - startingValue) : null;
        const isShort = fundLeft !== null && fundLeft < 0;

        return (
            <div className="ges-cards">
                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <div className="ges-cards__two">
                    <section className="ges-card">
                        <h2>Abrir turno</h2>
                        <p className="ges-note">
                            Cuánto efectivo pasa al cajón para empezar. Sin turno abierto se pueden tomar mesas,
                            pero no cobrar.
                        </p>
                        <label className="ges-field">
                            <span>Fondo inicial</span>
                            <input
                                id="turno-fondo"
                                type="text"
                                inputMode="decimal"
                                value={starting}
                                onChange={(event) => setStarting(event.target.value)}
                            />
                        </label>

                        {fund && fundLeft !== null ? (
                            <div className={`ges-from${isShort ? " is-bad" : ""}`}>
                                {isShort ? (
                                    <>
                                        <span>En el fondo aparte solo hay</span>
                                        <b>{formatCash(fund.balance)}</b>
                                    </>
                                ) : (
                                    <>
                                        <span>Sale del fondo aparte · quedan</span>
                                        <b>{formatCash(fundLeft)}</b>
                                    </>
                                )}
                            </div>
                        ) : null}

                        <button
                            type="button"
                            className="ges-btn ges-btn--solid ges-btn--block"
                            disabled={isSending || isShort}
                            onClick={async () => {
                                if (!isValidStarting) {
                                    setError("Escribe cuánto efectivo pasa al cajón.");
                                    return;
                                }
                                setIsSending(true);
                                try {
                                    apply((await openShift(token, roundMoney(startingValue))).shift);
                                    setCanClose(true);
                                    setError("");
                                    await reloadFund();
                                } catch (requestError) {
                                    handleError(requestError, "No pudimos abrir el turno.");
                                } finally {
                                    setIsSending(false);
                                }
                            }}
                        >
                            {isSending ? "Abriendo…" : "Abrir turno"}
                        </button>
                        {isShort ? (
                            <p className="ges-field__hint">Registra una entrada o un ajuste en el fondo aparte antes de abrir.</p>
                        ) : null}
                    </section>

                    {fundCard}
                </div>

                {fundDialog}
            </div>
        );
    }

    /* ---- Turno en curso ---- */
    const countedValue = parseAmount(counted);
    const hasCounted = Number.isFinite(countedValue) && countedValue >= 0;
    const difference = hasCounted ? roundMoney(countedValue - shift.expected) : null;

    return (
        <div className="ges-cards">
            {error ? <p className="ges-error" role="alert">{error}</p> : null}

            <div className="ges-cards__two">
                <section className="ges-card">
                    <h2>El turno</h2>
                    <div className="ges-rows">
                        <div className="ges-r"><span>Abierto por</span><b>{shift.openedByName} · {formatClock(shift.openedAt)}</b></div>
                    </div>

                    <p className="ges-sec">Ventas del turno</p>
                    <div className="ges-rows">
                        <div className="ges-r">
                            <span>Total cobrado <em>{shift.salesCount} cuentas</em></span>
                            <b>{formatCash(shift.salesTotal)}</b>
                        </div>
                        <div className="ges-r is-sub"><span>{PAYMENT_LABEL.efectivo}</span><b>{formatCash(shift.salesCash)}</b></div>
                        <div className="ges-r is-sub"><span>{PAYMENT_LABEL.tarjeta}</span><b>{formatCash(shift.salesCard)}</b></div>
                        <div className="ges-r is-sub"><span>{PAYMENT_LABEL.yappy}</span><b>{formatCash(shift.salesYappy)}</b></div>
                        {shift.refundsCount > 0 ? (
                            <div className="ges-r">
                                <span>
                                    Reembolsos{" "}
                                    <em>
                                        {shift.refundsCount} {shift.refundsCount === 1 ? "cuenta" : "cuentas"} · ya
                                        descontados arriba
                                    </em>
                                </span>
                                <b>{formatCash(shift.refundsTotal)}</b>
                            </div>
                        ) : null}
                        {shift.creditsCollected.count > 0 ? (
                            <div className="ges-r">
                                <span>
                                    Cobros de créditos{" "}
                                    <em>
                                        {shift.creditsCollected.count}{" "}
                                        {shift.creditsCollected.count === 1 ? "cuenta" : "cuentas"} · ya incluidos arriba
                                    </em>
                                </span>
                                <b>{formatCash(shift.creditsCollected.total)}</b>
                            </div>
                        ) : null}
                        {shift.creditsGiven.count > 0 ? (
                            <div className="ges-r is-sub">
                                <span>
                                    Créditos dados{" "}
                                    <em>
                                        {shift.creditsGiven.count} {shift.creditsGiven.count === 1 ? "cuenta" : "cuentas"} ·
                                        no entran a caja
                                    </em>
                                </span>
                                <b>{formatCash(shift.creditsGiven.total)}</b>
                            </div>
                        ) : null}
                    </div>

                    <p className="ges-sec">Efectivo en caja</p>
                    <div className="ges-rows">
                        <div className="ges-r"><span>Fondo inicial</span><b>{formatCash(shift.startingCash)}</b></div>
                        <div className="ges-r"><span>Ventas en efectivo</span><b>{formatCash(shift.salesCash)}</b></div>
                        <div className="ges-r"><span>Entradas</span><b>{formatCash(shift.cashIn)}</b></div>
                        <div className="ges-r"><span>Salidas</span><b>−{formatCash(shift.cashOut)}</b></div>
                        <div className="ges-r is-big"><span>Efectivo esperado</span><b>{formatCash(shift.expected)}</b></div>
                    </div>
                    <p className="ges-field__hint">Tarjeta y Yappy no pasan por el cajón: solo se cuenta el efectivo.</p>
                </section>

                <div className="ges-stack">
                    <ShiftTicketsCard tickets={shift.tickets} onRefund={setRefunding} />

                    <section className="ges-card">
                        <h2>Movimientos de efectivo</h2>
                        <div className="ges-rows">
                            {shift.movements.length === 0 ? (
                                <p className="ges-empty">Ninguno todavía.</p>
                            ) : (
                                shift.movements.map((one) => (
                                    <div className="ges-r" key={one.id}>
                                        <span>
                                            <b>{one.type === "entrada" ? "Entrada" : "Salida"}</b> · {one.reason}{" "}
                                            <em>{one.actorName} · {formatClock(one.createdAt)}</em>
                                        </span>
                                        <b>{one.type === "salida" ? "−" : "+"}{formatCash(one.amount)}</b>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="ges-cards__two">
                            <button type="button" className="ges-btn" onClick={() => setMovement("entrada")}>Entrada</button>
                            <button type="button" className="ges-btn" onClick={() => setMovement("salida")}>Salida</button>
                        </div>
                    </section>
                </div>
            </div>

            <div className="ges-cards__two">
                <section className="ges-card">
                    <h2>Cerrar caja</h2>
                    {!canClose ? (
                        <>
                            <p className="ges-note">
                                Este turno lo abrió <b>{shift.openedByName}</b> a las {formatClock(shift.openedAt)}: solo
                                esa persona puede cerrarlo. Si ya no está, lo cierra el admin desde el tablero.
                            </p>
                            <button type="button" className="ges-btn ges-btn--solid ges-btn--block" disabled>
                                Cerrar el turno
                            </button>
                        </>
                    ) : (
                        <>
                            <label className="ges-field">
                                <span>
                                    Efectivo contado <span className="ges-field__req">(obligatorio)</span>
                                </span>
                                <input
                                    id="turno-contado"
                                    type="text"
                                    inputMode="decimal"
                                    required
                                    aria-required="true"
                                    value={counted}
                                    placeholder="0.00"
                                    onChange={(event) => setCounted(event.target.value)}
                                />
                            </label>

                            {difference !== null ? (
                                <div className={`ges-diff${Math.abs(difference) < 0.005 ? " is-ok" : " is-bad"}`}>
                                    <span>{Math.abs(difference) < 0.005 ? "Cuadra" : difference > 0 ? "Sobra" : "Falta"}</span>
                                    <b>{formatCash(Math.abs(difference))}</b>
                                </div>
                            ) : null}

                            {!hasCounted ? (
                                <p className="ges-field__hint">Cuenta el efectivo del cajón y escríbelo para poder cerrar.</p>
                            ) : null}

                            {fund && hasCounted ? (
                                <div className="ges-from">
                                    <span>Pasa al fondo aparte · quedará</span>
                                    <b>{formatCash(roundMoney(fund.balance + countedValue))}</b>
                                </div>
                            ) : null}

                            <p className="ges-note">
                                Se esperan {formatCash(shift.expected)}. Al cerrar, la cifra queda guardada tal cual, lo
                                contado pasa al fondo aparte y el turno no se puede reabrir. Si hay mesas sin cobrar, el
                                cierre no deja.
                            </p>

                            <button
                                type="button"
                                className="ges-btn ges-btn--solid ges-btn--block"
                                // Sin cifra no se cierra: un campo vacío no es "contado cero"
                                disabled={!hasCounted || isSending}
                                onClick={async () => {
                                    if (!hasCounted) return;
                                    setIsSending(true);
                                    try {
                                        await closeShift(token, roundMoney(countedValue));
                                        setCounted("");
                                        apply(null);
                                        setError("");
                                        await reloadFund();
                                    } catch (requestError) {
                                        handleError(requestError, "No pudimos cerrar el turno.");
                                    } finally {
                                        setIsSending(false);
                                    }
                                }}
                            >
                                {isSending ? "Cerrando…" : "Cerrar el turno"}
                            </button>
                        </>
                    )}
                </section>

                {fundCard}
            </div>

            {movement ? (
                <MovementDialog
                    {...CASH_DIALOG[movement]}
                    amountLabel="Monto"
                    onClose={() => setMovement(null)}
                    onSave={async (amount, reason) => {
                        const data = await registerCashMovement(token, { type: movement, amount, reason });
                        apply(data.shift);
                        setMovement(null);
                    }}
                />
            ) : null}

            {refunding ? (
                <RefundDialog
                    token={token}
                    ticket={refunding}
                    onClose={() => setRefunding(null)}
                    onSessionExpired={onSessionExpired}
                    onRefunded={(next) => {
                        apply(next);
                        setRefunding(null);
                        setError("");
                    }}
                />
            ) : null}

            {fundDialog}
        </div>
    );
};
