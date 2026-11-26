import { Fragment, useCallback, useEffect, useState } from "react";

import {
    HttpError,
    fetchAdminShiftDetail,
    fetchShifts,
    formatClock,
    formatMoney,
    getPageSlice,
    getPaymentsSummary,
    getSafePage,
    getShiftEntries,
    getWebOrderPaymentLabel,
} from "@/helpers";
import type { IShiftDetail, IShiftRow } from "@/helpers";

import { AdminPagination } from "./admin-pagination";
import { OpsEmpty, OpsSkeleton } from "@/components";

/** Pocas filas por tabla: el historial se lee sin scrollear. */
const SHIFTS_PAGE_SIZE = 8;

/** Una cifra por método que puede faltar en turnos cerrados antes del desglose. */
const formatOptionalMoney = (value: number | null) => (value === null ? "—" : formatMoney(value));

const formatMoment = (value: string) =>
    new Date(value).toLocaleString("es-PA", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });

/** Una diferencia de centavos es ruido; lo que importa es si sobró o faltó. */
const getDifferenceTone = (difference: number | null) => {
    if (difference === null) return "idle";
    if (Math.abs(difference) < 0.005) return "ok";
    return Math.abs(difference) < 1 ? "warn" : "crit";
};

/** Las cuentas cobradas del turno y los pedidos web, la más reciente arriba. Lo web va marcado. */
const ShiftTicketsList = ({ shift }: { shift: IShiftDetail }) => {
    const entries = getShiftEntries(shift);
    if (entries.length === 0) return <p className="adm-note">Ninguna cuenta cobrada ni pedido web en este turno.</p>;

    return (
        <ul className="adm-shift-tickets">
            {entries.map((entry) => {
                if (entry.kind === "web") {
                    const order = entry.order;
                    return (
                        <li className="is-web" key={`web-${order.id}`}>
                            <span className="adm-name">
                                <span className="adm-pill is-web">Web</span> {order.customerName} · #{order.id}
                                <em>{getWebOrderPaymentLabel(order)} · {order.isDelivery ? "delivery" : "retiro"} · {formatClock(order.paidAt)}</em>
                            </span>
                            <b>{formatMoney(order.total)}</b>
                        </li>
                    );
                }

                const ticket = entry.ticket;
                const isRefunded = ticket.status === "reembolsada";
                return (
                    <li className={isRefunded ? "is-refunded" : ""} key={ticket.id}>
                        <span className="adm-name">
                            {isRefunded ? <span className="adm-pill is-crit">Reembolsada</span> : null} {ticket.label}
                            <em>
                                {getPaymentsSummary(ticket.payments)} ·{" "}
                                {isRefunded
                                    ? `reembolsada por ${ticket.refundedByName}${ticket.refundedAt ? ` · ${formatClock(ticket.refundedAt)}` : ""}`
                                    : `${ticket.closedByName}${ticket.closedAt ? ` · ${formatClock(ticket.closedAt)}` : ""}`}
                            </em>
                        </span>
                        <b>{formatMoney(ticket.total)}</b>
                    </li>
                );
            })}
        </ul>
    );
};

/**
 * Cierres de caja: el historial de turnos con lo esperado, lo contado y la diferencia, y las cuentas de cada uno.
 * La caja es nuestra, no de Loyverse: su API no deja abrir ni cerrar turnos. El turno en curso se cierra desde Gestión → Turno.
 */
export const AdminShifts = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [shifts, setShifts] = useState<IShiftRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [shiftPage, setShiftPage] = useState(1);
    // La fila del historial que está abierta y los turnos ya pedidos, para no volver a pedirlos
    const [expandedShiftId, setExpandedShiftId] = useState<number | null>(null);
    const [shiftDetails, setShiftDetails] = useState<Record<number, IShiftDetail>>({});
    const [detailError, setDetailError] = useState("");

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const data = await fetchShifts(token, signal);
                setShifts(data.shifts);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar los turnos.");
            } finally {
                if (!signal?.aborted) setIsLoading(false);
            }
        },
        [token, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const toggleShift = async (shift: IShiftRow) => {
        if (expandedShiftId === shift.id) return setExpandedShiftId(null);
        setExpandedShiftId(shift.id);
        setDetailError("");
        // Un turno cerrado ya no cambia: se guarda. Uno en curso se vuelve a pedir cada vez
        if (shiftDetails[shift.id] && shift.closedAt) return;

        try {
            const data = await fetchAdminShiftDetail(token, shift.id);
            setShiftDetails((current) => ({ ...current, [shift.id]: data.shift }));
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setDetailError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar las cuentas del turno.");
        }
    };

    const currentShiftPage = getSafePage(shiftPage, shifts.length, SHIFTS_PAGE_SIZE);

    return (
        <section className="adm-band">
            <div className="adm-band__head">
                <h2 className="script">Cierres de caja</h2>
                <span className="adm-band__sub">Cada turno con lo esperado, lo contado y la diferencia</span>
                <span className="adm-src is-own">Postgres</span>
            </div>

            <div className="adm-card">
                {error ? <p className="adm-error">{error}</p> : null}

                {isLoading ? (
                    <OpsSkeleton label="Cargando los cierres…" />
                ) : shifts.length === 0 ? (
                    <OpsEmpty title="Ningún turno todavía. Cuando el cajero abra la caja en /gestion y la cierre, el arqueo aparece aquí con lo esperado, lo contado y la diferencia." />
                ) : (
                    <div className="adm-scroll">
                        <table className="adm-table adm-table--compact ops-stack">
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
                                {getPageSlice(shifts, currentShiftPage, SHIFTS_PAGE_SIZE).map((shift) => {
                                    const isExpanded = expandedShiftId === shift.id;
                                    const detail = shiftDetails[shift.id];
                                    return (
                                        <Fragment key={shift.id}>
                                            <tr className={isExpanded ? "is-expanded" : ""}>
                                                <td className="adm-name" data-label="Abrió">
                                                    <span className="ops-stack__value">
                                                        <button
                                                            type="button"
                                                            className="adm-shift-toggle"
                                                            aria-expanded={isExpanded}
                                                            onClick={() => void toggleShift(shift)}
                                                        >
                                                            <span className="adm-shift-toggle__chev" aria-hidden="true">›</span>
                                                            {shift.openedByName}
                                                        </button>
                                                        <em>{formatMoment(shift.openedAt)}</em>
                                                    </span>
                                                </td>
                                                <td className="adm-name" data-label="Cerró">
                                                    <span className="ops-stack__value">
                                                        {shift.closedAt ? (
                                                            <>
                                                                {shift.closedByName}
                                                                <em>{formatMoment(shift.closedAt)}</em>
                                                            </>
                                                        ) : (
                                                            <span className="adm-pill is-warn">En curso</span>
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="num" data-label="Fondo">{formatMoney(shift.startingCash)}</td>
                                                <td className="num" data-label="Efectivo">{formatOptionalMoney(shift.salesCash)}</td>
                                                <td className="num" data-label="Tarjeta">{formatOptionalMoney(shift.salesCard)}</td>
                                                <td className="num" data-label="Yappy">{formatOptionalMoney(shift.salesYappy)}</td>
                                                <td className="num" data-label="Esperado">{shift.expectedCash === null ? "—" : formatMoney(shift.expectedCash)}</td>
                                                <td className="num" data-label="Contado">{shift.countedCash === null ? "—" : formatMoney(shift.countedCash)}</td>
                                                <td className="num" data-label="Diferencia">
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
                                            {isExpanded ? (
                                                <tr className="adm-shift-detail">
                                                    <td colSpan={9}>
                                                        {detail ? (
                                                            <ShiftTicketsList shift={detail} />
                                                        ) : detailError ? (
                                                            <p className="adm-error">{detailError}</p>
                                                        ) : (
                                                            <OpsSkeleton label="Cargando cuentas…" />
                                                        )}
                                                    </td>
                                                </tr>
                                            ) : null}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <AdminPagination page={currentShiftPage} pageSize={SHIFTS_PAGE_SIZE} total={shifts.length} onChange={setShiftPage} />
            </div>
        </section>
    );
};
