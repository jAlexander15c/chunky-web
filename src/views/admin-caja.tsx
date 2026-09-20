import { useCallback, useEffect, useState } from "react";

import { HttpError, fetchShifts, formatMoney, setTablesCount } from "@/helpers";
import type { IShiftRow } from "@/helpers";

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
    const [tables, setTables] = useState(0);
    const [draftTables, setDraftTables] = useState("");
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const data = await fetchShifts(token, signal);
                setShifts(data.shifts);
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

    return (
        <section className="adm-band">
            <div className="adm-band__head">
                <h2 className="script">Caja del local</h2>
                <span className="adm-band__sub">Cierres de turno y cuántas mesas hay</span>
                <span className="adm-src is-own">Postgres</span>
            </div>

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
        </section>
    );
};
