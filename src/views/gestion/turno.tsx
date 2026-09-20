import { useCallback, useEffect, useState } from "react";

import {
    HttpError,
    closeShift,
    fetchShift,
    formatCash,
    formatClock,
    openShift,
    registerCashMovement,
} from "@/helpers";
import type { IShiftDetail } from "@/helpers";

const parseAmount = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : NaN;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

interface IMovementDialogProps {
    type: "entrada" | "salida";
    onSave: (amount: number, reason: string) => Promise<void>;
    onClose: () => void;
}

const MovementDialog = ({ type, onSave, onClose }: IMovementDialogProps) => {
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const submit = async () => {
        const parsed = parseAmount(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            setError("Escribe un monto mayor que cero.");
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
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Registrar ${type} de efectivo`}>
            <div className="ges-modal__panel">
                <h3 className="script">{type === "entrada" ? "Entra efectivo" : "Sale efectivo"}</h3>
                <p className="ges-note">
                    {type === "entrada"
                        ? "Dinero que entra al cajón y no es una venta, por ejemplo cambio del banco."
                        : "Dinero que sale del cajón, por ejemplo una compra o las propinas repartidas."}
                </p>

                <label className="ges-field">
                    <span>Monto</span>
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

                <label className="ges-field">
                    <span>Para qué</span>
                    <input
                        id="turno-motivo"
                        type="text"
                        value={reason}
                        placeholder={type === "entrada" ? "Cambio del banco" : "Compra de hielo"}
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

interface IGestionTurnoProps {
    token: string;
    onSessionExpired: () => void;
    onShiftChange: (shift: IShiftDetail | null) => void;
}

export const GestionTurno = ({ token, onSessionExpired, onShiftChange }: IGestionTurnoProps) => {
    const [shift, setShift] = useState<IShiftDetail | null>(null);
    const [starting, setStarting] = useState("50.00");
    const [counted, setCounted] = useState("");
    const [movement, setMovement] = useState<"entrada" | "salida" | null>(null);
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
                const data = await fetchShift(token, signal);
                apply(data.shift);
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

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    if (isLoading) return <p className="ges-empty">Cargando el turno…</p>;

    /* ---- Sin turno abierto ---- */
    if (!shift) {
        return (
            <div className="ges-cards">
                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                <section className="ges-card">
                    <h2>Abrir turno</h2>
                    <p className="ges-note">
                        Cuánto efectivo hay en la caja al empezar. Sin turno abierto se pueden tomar mesas,
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
                    <button
                        type="button"
                        className="ges-btn ges-btn--solid ges-btn--block"
                        disabled={isSending}
                        onClick={async () => {
                            const parsed = parseAmount(starting);
                            if (!Number.isFinite(parsed) || parsed < 0) {
                                setError("Escribe cuánto efectivo hay en la caja.");
                                return;
                            }
                            setIsSending(true);
                            try {
                                apply((await openShift(token, roundMoney(parsed))).shift);
                                setError("");
                            } catch (requestError) {
                                handleError(requestError, "No pudimos abrir el turno.");
                            } finally {
                                setIsSending(false);
                            }
                        }}
                    >
                        {isSending ? "Abriendo…" : "Abrir turno"}
                    </button>
                </section>
            </div>
        );
    }

    /* ---- Turno en curso ---- */
    const countedValue = parseAmount(counted);
    const difference = Number.isFinite(countedValue) ? roundMoney(countedValue - shift.expected) : null;

    return (
        <div className="ges-cards">
            {error ? <p className="ges-error" role="alert">{error}</p> : null}

            <div className="ges-cards__two">
                <section className="ges-card">
                    <h2>El turno</h2>
                    <div className="ges-rows">
                        <div className="ges-r"><span>Abierto por</span><b>{shift.openedByName} · {formatClock(shift.openedAt)}</b></div>
                        <div className="ges-r"><span>Fondo inicial</span><b>{formatCash(shift.startingCash)}</b></div>
                        <div className="ges-r">
                            <span>Ventas cobradas <em>{shift.salesCount} cuentas</em></span>
                            <b>{formatCash(shift.salesTotal)}</b>
                        </div>
                        <div className="ges-r"><span>De eso, en efectivo</span><b>{formatCash(shift.salesCash)}</b></div>
                        <div className="ges-r"><span>Entradas</span><b>{formatCash(shift.cashIn)}</b></div>
                        <div className="ges-r"><span>Salidas</span><b>−{formatCash(shift.cashOut)}</b></div>
                        <div className="ges-r is-big"><span>Efectivo esperado</span><b>{formatCash(shift.expected)}</b></div>
                    </div>
                </section>

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

            <section className="ges-card">
                <h2>Cerrar caja</h2>
                <label className="ges-field">
                    <span>Efectivo contado</span>
                    <input
                        id="turno-contado"
                        type="text"
                        inputMode="decimal"
                        value={counted}
                        placeholder={shift.expected.toFixed(2)}
                        onChange={(event) => setCounted(event.target.value)}
                    />
                </label>

                {difference !== null ? (
                    <div className={`ges-diff${Math.abs(difference) < 0.005 ? " is-ok" : " is-bad"}`}>
                        <span>{Math.abs(difference) < 0.005 ? "Cuadra" : difference > 0 ? "Sobra" : "Falta"}</span>
                        <b>{formatCash(Math.abs(difference))}</b>
                    </div>
                ) : null}

                <p className="ges-note">
                    Se esperan {formatCash(shift.expected)}. Al cerrar, la cifra queda guardada tal cual y el
                    turno no se puede reabrir. Si hay mesas sin cobrar, el cierre no deja.
                </p>

                <button
                    type="button"
                    className="ges-btn ges-btn--solid ges-btn--block"
                    disabled={difference === null || isSending}
                    onClick={async () => {
                        setIsSending(true);
                        try {
                            await closeShift(token, roundMoney(countedValue));
                            setCounted("");
                            apply(null);
                            setError("");
                        } catch (requestError) {
                            handleError(requestError, "No pudimos cerrar el turno.");
                        } finally {
                            setIsSending(false);
                        }
                    }}
                >
                    {isSending ? "Cerrando…" : "Cerrar el turno"}
                </button>
            </section>

            {movement ? (
                <MovementDialog
                    type={movement}
                    onClose={() => setMovement(null)}
                    onSave={async (amount, reason) => {
                        const data = await registerCashMovement(token, { type: movement, amount, reason });
                        apply(data.shift);
                        setMovement(null);
                    }}
                />
            ) : null}
        </div>
    );
};
