import { useCallback, useEffect, useState } from "react";

import {
    HttpError,
    PAYMENT_LABEL,
    closeShift,
    fetchFund,
    fetchShift,
    formatCash,
    formatClock,
    openShift,
    registerCashMovement,
    registerFundMovement,
} from "@/helpers";
import type { IFund, IShiftDetail, IShiftTicket, ManualFundMovementType } from "@/helpers";
import { OpsSkeleton } from "@/components";
import { FundCard } from "./turno/fund-card";
import { MovementDialog } from "./turno/movement-dialog";
import { CASH_DIALOG, FUND_DIALOG, parseAmount, roundMoney } from "./turno/helpers";
import { ShiftTicketsCard } from "./turno/shift-tickets-card";
import { RefundDialog } from "./turno/refund-dialog";

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

    if (isLoading) return <OpsSkeleton label="Cargando el turno…" />;

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
                        {shift.webCash ? (
                            <div className="ges-r"><span>Pedidos WhatsApp en efectivo</span><b>{formatCash(shift.webCash)}</b></div>
                        ) : null}
                        <div className="ges-r"><span>Entradas</span><b>{formatCash(shift.cashIn)}</b></div>
                        <div className="ges-r"><span>Salidas</span><b>−{formatCash(shift.cashOut)}</b></div>
                        <div className="ges-r is-big"><span>Efectivo esperado</span><b>{formatCash(shift.expected)}</b></div>
                    </div>
                    <p className="ges-field__hint">Tarjeta y Yappy no pasan por el cajón: solo se cuenta el efectivo.</p>
                </section>

                <div className="ges-stack">
                    <ShiftTicketsCard shift={shift} onRefund={setRefunding} />

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
