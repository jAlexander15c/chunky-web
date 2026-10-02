import { useEffect, useState } from "react";
import type { ISupplyStatus } from "@/helpers/admin";
import { discardBatch, expirationLabel, fetchBatches } from "@/helpers/inventory";
import type { BatchDetail } from "@/helpers/inventory";
import { HttpError } from "@/helpers/getHttp";
const date = (v: string | null) => (v ? new Date(v).toLocaleString("es-PA", { timeZone: "America/Panama" }) : "—");
export const InventoryBatchDialog = ({
    token,
    supply,
    onClose,
    onChanged,
}: {
    token: string;
    supply: ISupplyStatus;
    onClose: () => void;
    onChanged: () => Promise<void>;
}) => {
    const [detail, setDetail] = useState<BatchDetail | null>(null),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(false);
    useEffect(() => {
        const c = new AbortController();
        void fetchBatches(token, supply.id, c.signal)
            .then(setDetail)
            .catch((e) => {
                if (!c.signal.aborted) setError(e instanceof HttpError ? e.message : "No pudimos cargar los lotes");
            });
        return () => c.abort();
    }, [token, supply.id]);
    const discard = async (id: number) => {
        setBusy(true);
        setError("");
        try {
            setDetail(await discardBatch(token, supply.id, id));
            await onChanged();
        } catch (e) {
            setError(e instanceof HttpError ? e.message : "No pudimos descartar el lote");
        } finally {
            setBusy(false);
        }
    };
    return (
        <div
            className="adm-modal inventory-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={"Lotes de " + supply.name}
        >
            <div className="adm-modal__panel adm-modal__panel--wide">
                <h3 className="script">{supply.name} · Lotes</h3>
                {detail ? (
                    <>
                        <p className="adm-note">
                            Stock válido:{" "}
                            <b>
                                {detail.usableStock} {supply.unit}
                            </b>{" "}
                            · Vencido: {detail.expiredStock} · Descartado: {detail.discardedStock}
                        </p>
                        <p className="adm-note">
                            Consumo diario: {supply.dailyUse ?? "Sin datos"} · Días restantes:{" "}
                            {supply.daysLeft ?? "Sin datos"} · {expirationLabel(detail.nextExpiration)}
                        </p>
                        <div className="adm-scroll">
                            <table className="adm-table adm-table--compact">
                                <thead>
                                    <tr>
                                        <th>Lote</th>
                                        <th>Entrada</th>
                                        <th>Producción</th>
                                        <th>Inicial</th>
                                        <th>Restante</th>
                                        <th>Vencimiento</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detail.batches.map((b) => (
                                        <tr key={b.id}>
                                            <td>
                                                #{b.id}
                                                {b.origin === "MIGRATION_INITIAL_STOCK" ? <em>Saldo inicial</em> : null}
                                            </td>
                                            <td>{date(b.purchasedAt ?? b.createdAt)}</td>
                                            <td>{date(b.producedAt)}</td>
                                            <td>{b.quantityInitial}</td>
                                            <td>{b.quantityRemaining}</td>
                                            <td>{date(b.expirationDate)}</td>
                                            <td>
                                                {
                                                    {
                                                        ACTIVE: "Activo",
                                                        EXPIRED: "Vencido",
                                                        DEPLETED: "Agotado",
                                                        DISCARDED: "Descartado",
                                                    }[b.status]
                                                }
                                            </td>
                                            <td>
                                                {["ACTIVE", "EXPIRED"].includes(b.status) ? (
                                                    <button
                                                        className="adm-btn adm-btn--sm"
                                                        disabled={busy}
                                                        onClick={() => void discard(b.id)}
                                                    >
                                                        Descartar como merma
                                                    </button>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {detail.batches.length === 0 ? <p className="adm-empty">No hay lotes.</p> : null}
                    </>
                ) : (
                    <p className="adm-note">Cargando lotes…</p>
                )}
                {error ? (
                    <p className="adm-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <div className="adm-modal__actions">
                    <button className="adm-btn" disabled={busy} onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};
