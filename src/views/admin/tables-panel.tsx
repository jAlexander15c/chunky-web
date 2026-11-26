import { useCallback, useEffect, useState } from "react";

import { HttpError, fetchShifts, setTablesCount } from "@/helpers";

/** Cuántas mesas tiene el local: es lo que ve el cajero en Gestión. */
export const TablesPanel = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [tables, setTables] = useState<number | null>(null);
    const [draftTables, setDraftTables] = useState("");
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                // Las mesas llegan junto con los turnos: es la misma llamada de siempre
                const data = await fetchShifts(token, signal);
                setTables(data.tables);
                setDraftTables(String(data.tables));
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar las mesas.");
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
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos guardar las mesas.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="adm-band">
            <div className="adm-band__head">
                <h2 className="script">Mesas del local</h2>
                <span className="adm-band__sub">Es lo que ve el cajero en Gestión{tables !== null ? `. Hoy son ${tables}` : ""}</span>
                <span className="adm-src is-own">Postgres</span>
            </div>

            <div className="adm-tables">
                <label className="adm-sr-only" htmlFor="admin-tables">Número de mesas</label>
                <input
                    id="admin-tables"
                    className="adm-form__input"
                    type="text"
                    inputMode="numeric"
                    value={draftTables}
                    disabled={tables === null}
                    onChange={(event) => setDraftTables(event.target.value.replace(/\D/g, ""))}
                />
                <button
                    type="button"
                    className="adm-btn adm-btn--sm"
                    onClick={() => void saveTables()}
                    disabled={isSaving || tables === null || draftTables === String(tables)}
                >
                    {isSaving ? "Guardando…" : "Guardar"}
                </button>
            </div>

            {error ? <p className="adm-error">{error}</p> : null}
        </section>
    );
};
