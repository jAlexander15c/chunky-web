import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
    FUND_MOVEMENT_LABEL,
    HttpError,
    closeAdminShift,
    fetchAdminFund,
    fetchAdminShift,
    fetchShifts,
    formatClock,
    formatMoney,
    registerAdminFundMovement,
    setTablesCount,
} from "@/helpers";
import type { IFund, IShiftDetail, IShiftRow, ManualFundMovementType } from "@/helpers";

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Una cifra por método que puede faltar en turnos cerrados antes del desglose. */
const formatOptionalMoney = (value: number | null) => (value === null ? "—" : formatMoney(value));

const FUND_DIALOG: Record<ManualFundMovementType, { title: string; hint: string; amountLabel: string; placeholder: string }> = {
    entrada: {
        title: "Entra al fondo",
        hint: "Efectivo que se suma al fondo aparte y no viene de un cierre.",
        amountLabel: "Monto",
        placeholder: "Cambio en monedas",
    },
    salida: {
        title: "Sale del fondo",
        hint: "Efectivo que sale del fondo aparte, por ejemplo un depósito al banco.",
        amountLabel: "Monto",
        placeholder: "Depósito al banco",
    },
    ajuste: {
        title: "Ajustar el fondo",
        hint: "Escribe cuánto hay de verdad. Se guarda la diferencia con el saldo.",
        amountLabel: "Hay de verdad",
        placeholder: "Recuento del sobre",
    },
};

interface IFundDialogProps {
    type: ManualFundMovementType;
    balance: number;
    onSave: (amount: number, reason: string) => Promise<void>;
    onClose: () => void;
}

const FundDialog = ({ type, balance, onSave, onClose }: IFundDialogProps) => {
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const copy = FUND_DIALOG[type];

    const parsed = amount.trim() === "" ? NaN : Number(amount.replace(",", "."));
    const isValidAmount = Number.isFinite(parsed) && (type === "ajuste" ? parsed >= 0 : parsed > 0);
    const difference = type === "ajuste" && isValidAmount ? roundMoney(parsed - balance) : null;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!isValidAmount) {
            setError(type === "ajuste" ? "Escribe cuánto hay." : "Escribe un monto mayor que cero.");
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
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label={copy.title}>
            <form className="adm-modal__panel" onSubmit={submit}>
                <h3 className="script">{copy.title}</h3>
                <p className="adm-modal__hint">{copy.hint}</p>

                <div className="adm-form">
                    <label className="adm-form__row">
                        <span>{copy.amountLabel}</span>
                        <input
                            id="admin-fondo-monto"
                            className="adm-form__input"
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            placeholder="0.00"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                        />
                    </label>
                    <label className="adm-form__row">
                        <span>Para qué</span>
                        <input
                            id="admin-fondo-motivo"
                            className="adm-form__input"
                            type="text"
                            placeholder={copy.placeholder}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                        />
                    </label>
                </div>

                {difference !== null ? (
                    <p className="adm-modal__diff">
                        Hoy dice {formatMoney(balance)}: se guarda {difference > 0 ? "+" : difference < 0 ? "−" : ""}
                        {formatMoney(Math.abs(difference))}.
                    </p>
                ) : null}

                {error ? <p className="adm-error">{error}</p> : null}

                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending}>
                        {isSending ? "Guardando…" : "Guardar"}
                    </button>
                </div>
            </form>
        </div>
    );
};

const formatMoment = (value: string) =>
    new Date(value).toLocaleString("es-PA", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });

/** Una diferencia de centavos es ruido; lo que importa es si sobró o faltó. */
const getDifferenceTone = (difference: number | null) => {
    if (difference === null) return "idle";
    if (Math.abs(difference) < 0.005) return "ok";
    return Math.abs(difference) < 1 ? "warn" : "crit";
};

/**
 * Cierres de caja del local y cuántas mesas tiene. La caja es nuestra, no de Loyverse:
 * su API no deja abrir ni cerrar turnos, así que este es el único lugar donde se cuadra.
 */
export const AdminCaja = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [shifts, setShifts] = useState<IShiftRow[]>([]);
    const [fund, setFund] = useState<IFund | null>(null);
    const [fundMovement, setFundMovement] = useState<ManualFundMovementType | null>(null);
    // El turno en curso: el admin lo cierra si quien lo abrió ya no está
    const [openShift, setOpenShift] = useState<IShiftDetail | null>(null);
    const [counted, setCounted] = useState("");
    const [isClosing, setIsClosing] = useState(false);
    const [tables, setTables] = useState(0);
    const [draftTables, setDraftTables] = useState("");
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const [data, fundData, current] = await Promise.all([
                    fetchShifts(token, signal),
                    fetchAdminFund(token, signal),
                    fetchAdminShift(token, signal),
                ]);
                setShifts(data.shifts);
                setFund(fundData.fund);
                setOpenShift(current.shift);
                setTables(data.tables);
                setDraftTables(String(data.tables));
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar los turnos.");
            }
        },
        [token, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const saveTables = async () => {
        const parsed = Number(draftTables);
        if (!Number.isInteger(parsed) || parsed < 1) {
            setError("El número de mesas tiene que ser un entero mayor que cero.");
            return;
        }

        setIsSaving(true);
        try {
            await setTablesCount(token, parsed);
            setTables(parsed);
            setError("");
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos guardar las mesas.");
        } finally {
            setIsSaving(false);
        }
    };

    const countedValue = counted.trim() === "" ? NaN : Number(counted.replace(",", "."));
    const hasCounted = Number.isFinite(countedValue) && countedValue >= 0;

    const closeShift = async () => {
        if (!hasCounted) return;
        setIsClosing(true);
        try {
            await closeAdminShift(token, roundMoney(countedValue));
            setCounted("");
            await load();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos cerrar el turno.");
        } finally {
            setIsClosing(false);
        }
    };

    return (
        <section className="adm-band">
            <div className="adm-band__head">
                <h2 className="script">Caja del local</h2>
                <span className="adm-band__sub">Cierres de turno, fondo aparte y cuántas mesas hay</span>
                <span className="adm-src is-own">Postgres</span>
            </div>

            {openShift ? (
                <div className="adm-card">
                    <div className="adm-card-head">
                        <div className="grow">
                            <h3 className="script">Turno en curso</h3>
                            <p className="adm-note">
                                Lo abrió {openShift.openedByName} a las {formatClock(openShift.openedAt)}. En caja solo esa
                                persona puede cerrarlo; si ya no está, ciérralo aquí contando el efectivo del cajón.
                            </p>
                        </div>
                        <div className="adm-fund__bal">
                            <span>Efectivo esperado</span>
                            <b>{formatMoney(openShift.expected)}</b>
                        </div>
                    </div>
                    <div className="adm-close">
                        <label className="adm-form__row">
                            <span>Efectivo contado <em>(obligatorio)</em></span>
                            <input
                                id="admin-turno-contado"
                                className="adm-form__input"
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={counted}
                                onChange={(event) => setCounted(event.target.value)}
                            />
                        </label>
                        <button
                            type="button"
                            className="adm-btn adm-btn--solid"
                            disabled={!hasCounted || isClosing}
                            onClick={() => void closeShift()}
                        >
                            {isClosing ? "Cerrando…" : `Cerrar el turno de ${openShift.openedByName}`}
                        </button>
                    </div>
                    {hasCounted ? (
                        <p className="adm-note">
                            {Math.abs(countedValue - openShift.expected) < 0.005
                                ? "Cuadra."
                                : countedValue > openShift.expected
                                  ? `Sobran ${formatMoney(roundMoney(countedValue - openShift.expected))}.`
                                  : `Faltan ${formatMoney(roundMoney(openShift.expected - countedValue))}.`}{" "}
                            Lo contado pasa al fondo aparte y el cierre queda firmado como Admin.
                        </p>
                    ) : null}
                </div>
            ) : null}

            <div className="adm-card">
                <div className="adm-card-head">
                    <div className="grow">
                        <h3 className="script">Mesas del local</h3>
                        <p className="adm-note">Es lo que ve el cajero en /gestion. Hoy son {tables}.</p>
                    </div>
                    <div className="adm-tables">
                        <label className="adm-sr-only" htmlFor="admin-tables">Número de mesas</label>
                        <input
                            id="admin-tables"
                            className="adm-form__input"
                            type="text"
                            inputMode="numeric"
                            value={draftTables}
                            onChange={(event) => setDraftTables(event.target.value.replace(/\D/g, ""))}
                        />
                        <button
                            type="button"
                            className="adm-btn adm-btn--solid adm-btn--sm"
                            onClick={() => void saveTables()}
                            disabled={isSaving || draftTables === String(tables)}
                        >
                            {isSaving ? "Guardando…" : "Guardar"}
                        </button>
                    </div>
                </div>

                {error ? <p className="adm-error">{error}</p> : null}

                {shifts.length === 0 ? (
                    <p className="adm-empty">
                        Ningún turno todavía. Cuando el cajero abra la caja en /gestion y la cierre, el arqueo
                        aparece aquí con lo esperado, lo contado y la diferencia.
                    </p>
                ) : (
                    <div className="adm-scroll">
                        <table className="adm-table">
                            <thead>
                                <tr>
                                    <th>Abrió</th>
                                    <th>Cerró</th>
                                    <th className="num">Fondo</th>
                                    <th className="num">Efectivo</th>
                                    <th className="num">Tarjeta</th>
                                    <th className="num">Yappy</th>
                                    <th className="num">Esperado</th>
                                    <th className="num">Contado</th>
                                    <th className="num">Diferencia</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shifts.map((shift) => (
                                    <tr key={shift.id}>
                                        <td className="adm-name">
                                            {shift.openedByName}
                                            <em>{formatMoment(shift.openedAt)}</em>
                                        </td>
                                        <td className="adm-name">
                                            {shift.closedAt ? (
                                                <>
                                                    {shift.closedByName}
                                                    <em>{formatMoment(shift.closedAt)}</em>
                                                </>
                                            ) : (
                                                <span className="adm-pill is-warn">En curso</span>
                                            )}
                                        </td>
                                        <td className="num">{formatMoney(shift.startingCash)}</td>
                                        <td className="num">{formatOptionalMoney(shift.salesCash)}</td>
                                        <td className="num">{formatOptionalMoney(shift.salesCard)}</td>
                                        <td className="num">{formatOptionalMoney(shift.salesYappy)}</td>
                                        <td className="num">{shift.expectedCash === null ? "—" : formatMoney(shift.expectedCash)}</td>
                                        <td className="num">{shift.countedCash === null ? "—" : formatMoney(shift.countedCash)}</td>
                                        <td className="num">
                                            {shift.difference === null ? (
                                                "—"
                                            ) : (
                                                <span className={`adm-pill is-${getDifferenceTone(shift.difference)}`}>
                                                    {shift.difference > 0 ? "+" : ""}
                                                    {formatMoney(shift.difference)}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {fund ? (
                <div className="adm-card">
                    <div className="adm-card-head">
                        <div className="grow">
                            <h3 className="script">Fondo aparte</h3>
                            <p className="adm-note">
                                El efectivo que no está en el cajón. Da el fondo inicial al abrir cada turno y recibe
                                lo contado al cerrar. El cajero lo ve y lo mueve igual en /gestion.
                            </p>
                        </div>
                        <div className="adm-fund">
                            <div className="adm-fund__bal">
                                <span>Hay ahora</span>
                                <b>{formatMoney(fund.balance)}</b>
                            </div>
                            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setFundMovement("entrada")}>Entrada</button>
                            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setFundMovement("salida")}>Salida</button>
                            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setFundMovement("ajuste")}>Ajuste</button>
                        </div>
                    </div>

                    {fund.movements.length === 0 ? (
                        <p className="adm-empty">
                            Ningún movimiento todavía. Registra un ajuste con lo que hay hoy en el fondo para empezar.
                        </p>
                    ) : (
                        <div className="adm-scroll">
                            <table className="adm-table">
                                <thead>
                                    <tr>
                                        <th>Cuándo</th>
                                        <th>Movimiento</th>
                                        <th>Quién</th>
                                        <th className="num">Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fund.movements.map((one) => (
                                        <tr key={one.id}>
                                            <td className="adm-name">{formatMoment(one.createdAt)}</td>
                                            <td className="adm-name">
                                                {FUND_MOVEMENT_LABEL[one.type]}
                                                <em>{one.reason}</em>
                                            </td>
                                            <td>{one.actorName}</td>
                                            <td className={`num ${one.amount > 0 ? "is-in" : "is-out"}`}>
                                                {one.amount > 0 ? "+" : "−"}
                                                {formatMoney(Math.abs(one.amount))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : null}

            {fundMovement && fund ? (
                <FundDialog
                    type={fundMovement}
                    balance={fund.balance}
                    onClose={() => setFundMovement(null)}
                    onSave={async (amount, reason) => {
                        const data = await registerAdminFundMovement(token, { type: fundMovement, amount, reason });
                        setFund(data.fund);
                        setFundMovement(null);
                    }}
                />
            ) : null}
        </section>
    );
};
