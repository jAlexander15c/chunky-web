import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
    HttpError,
    INCIDENT_LABEL,
    INCIDENT_TONE,
    fetchIncidents,
    formatMoney,
    resolveIncident,
    retryIncidentReceipt,
} from "@/helpers";
import type { IIncident, IIncidentList, IncidentStatus } from "@/helpers";

/** Igual que el resto del tablero: se refresca solo, sin que nadie tenga que recargar. */
const REFRESH_MS = 60000;

type Feedback = { tone: "ok" | "crit"; text: string };

const formatMoment = (value: string) =>
    new Date(value).toLocaleString("es-PA", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });

const getNextRetryLabel = (nextRetryAt: string) => {
    const minutes = Math.ceil((new Date(nextRetryAt).getTime() - Date.now()) / 60000);
    return minutes <= 0 ? "Próximo intento en un momento" : `Próximo intento en ${minutes} min`;
};

/** Qué le pasó al cobro, en palabras de quien atiende el local. */
const getIncidentCause = (incident: IIncident) => {
    if (incident.kind !== "RECEIPT_MISSING") return incident.detail ?? "";
    const delivered = incident.order?.deliveredAt ? " Ya se entregó." : "";
    return `El pedido se cobró pero no tiene recibo en Loyverse.${delivered}`;
};

const AttemptsMeter = ({ attempts, max }: { attempts: number; max: number }) => (
    <span className={`adm-meter${attempts >= max ? " is-full" : ""}`}>
        <span className="adm-meter__bars" aria-hidden="true">
            {Array.from({ length: max }, (_, index) => (
                <i key={index} className={index < attempts ? "is-on" : ""} />
            ))}
        </span>
        {attempts}/{max}
    </span>
);

/** Cierra un descuadre a mano. Con un recibo faltante, el número es opcional: si no hace falta recibo, se deja vacío. */
const ResolveIncidentDialog = ({
    incident,
    onResolve,
    onClose,
}: {
    incident: IIncident;
    onResolve: (input: { note: string; receiptNumber?: string }) => Promise<void>;
    onClose: () => void;
}) => {
    const [receiptNumber, setReceiptNumber] = useState("");
    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const isReceipt = incident.kind === "RECEIPT_MISSING";

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!note.trim()) {
            setError("Escribe qué se hizo para poder cerrarlo.");
            return;
        }

        setIsSending(true);
        try {
            await onResolve({ note: note.trim(), receiptNumber: receiptNumber.trim() || undefined });
            onClose();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos resolver el descuadre.");
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Marcar descuadre como resuelto">
            <form className="adm-modal__panel" onSubmit={submit}>
                <h3 className="script">Marcar como resuelto</h3>
                <p className="adm-modal__hint">
                    Pedido {incident.orderId}
                    {incident.order ? ` · B/. ${formatMoney(incident.order.total)}` : ""}.{" "}
                    {isReceipt
                        ? "Al resolverlo, el pedido deja de reintentarse."
                        : "Queda anotado que lo cerraste y cuándo."}
                </p>

                <div className="adm-form adm-form--single">
                    {isReceipt ? (
                        <label className="adm-form__row">
                            <span>Recibo en Loyverse <em>opcional</em></span>
                            <input
                                className="adm-form__input"
                                type="text"
                                value={receiptNumber}
                                onChange={(event) => setReceiptNumber(event.target.value)}
                                placeholder="Ej. 2-1050"
                                autoComplete="off"
                            />
                        </label>
                    ) : null}

                    <label className="adm-form__row">
                        <span>Nota</span>
                        <textarea
                            className="adm-form__input adm-form__textarea"
                            autoFocus
                            value={note}
                            maxLength={200}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder={isReceipt ? "Ej. Recibo creado a mano en Loyverse" : "Ej. Devuelto al cliente"}
                        />
                    </label>
                </div>

                {error ? <p className="adm-gate__error">{error}</p> : null}

                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending || !note.trim()}>
                        {isSending ? "Guardando…" : "Marcar resuelto"}
                    </button>
                </div>
            </form>
        </div>
    );
};

/**
 * Cobros que no quedaron completos: sobre todo un pedido cobrado al que no se le pudo crear el recibo.
 * El sistema reintenta solo hasta un límite; pasado eso se reintenta o se resuelve a mano desde aquí.
 */
export const AdminIncidents = ({
    token,
    onSessionExpired,
    onOpenCountChange,
}: {
    token: string;
    onSessionExpired: () => void;
    onOpenCountChange: (count: number) => void;
}) => {
    const [status, setStatus] = useState<IncidentStatus>("open");
    const [list, setList] = useState<IIncidentList | null>(null);
    const [error, setError] = useState("");
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [retryingId, setRetryingId] = useState<number | null>(null);
    const [resolving, setResolving] = useState<IIncident | null>(null);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const data = await fetchIncidents(token, status, signal);
                setList(data);
                onOpenCountChange(data.openCount);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar los descuadres.");
            }
        },
        [token, status, onSessionExpired, onOpenCountChange]
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);

        const timer = window.setInterval(() => void load(), REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [load]);

    const retryReceipt = async (incident: IIncident) => {
        setRetryingId(incident.id);
        setFeedback(null);
        try {
            const result = await retryIncidentReceipt(token, incident.id);
            setFeedback(
                result.isCreated
                    ? { tone: "ok", text: `Listo: el recibo de ${incident.orderId} quedó creado en Loyverse y el descuadre se cerró.` }
                    : {
                          tone: "crit",
                          text: `Sigue fallando: ${result.incident.lastError ?? "Loyverse no lo aceptó"}. Corrige la causa y vuelve a probar, o resuélvelo a mano.`,
                      }
            );
            await load();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setFeedback({ tone: "crit", text: requestError instanceof HttpError ? requestError.message : "No pudimos reintentar el recibo." });
        } finally {
            setRetryingId(null);
        }
    };

    const resolveManually = async (incident: IIncident, input: { note: string; receiptNumber?: string }) => {
        await resolveIncident(token, incident.id, input);
        setFeedback({
            tone: "ok",
            text: `Descuadre de ${incident.orderId} resuelto${incident.kind === "RECEIPT_MISSING" ? "; el pedido ya no se reintenta" : ""}.`,
        });
        await load();
    };

    const incidents = list?.incidents ?? [];
    const openCount = list?.openCount ?? 0;
    const maxAttempts = list?.maxReceiptAttempts ?? 6;
    const isOpenTab = status === "open";

    return (
        <section className="adm-band" id="descuadres">
            <div className="adm-band__head">
                <h2 className="script">Descuadres de pago</h2>
                <span className="adm-band__sub">Cobros que no quedaron completos en el sistema</span>
                <span className="adm-src is-own">Postgres</span>
            </div>

            <div className={`adm-card${isOpenTab && openCount > 0 ? " adm-card--alert" : ""}`}>
                <div className="adm-card-head">
                    <div className="adm-chips" role="group" aria-label="Filtrar descuadres">
                        <button
                            type="button"
                            className="adm-chip"
                            aria-pressed={isOpenTab}
                            onClick={() => setStatus("open")}
                        >
                            Abiertos {openCount}
                        </button>
                        <button
                            type="button"
                            className="adm-chip"
                            aria-pressed={!isOpenTab}
                            onClick={() => setStatus("resolved")}
                        >
                            Resueltos
                        </button>
                    </div>
                    <span className="adm-note grow adm-card-head__hint">Se actualiza solo cada minuto</span>
                </div>

                {error ? <p className="adm-error">{error}</p> : null}

                {incidents.length === 0 ? (
                    <p className="adm-empty">
                        {isOpenTab
                            ? "Todo cuadrado: cada cobro de la web tiene su recibo en Loyverse. Si algo falla, aparece aquí con la causa."
                            : "Todavía no se ha resuelto ningún descuadre."}
                    </p>
                ) : (
                    <div className="adm-scroll">
                        <table className="adm-table adm-table--incidents">
                            <thead>
                                <tr>
                                    <th>Pedido</th>
                                    <th>Qué pasó</th>
                                    <th>Causa</th>
                                    <th>Intentos</th>
                                    <th className="num">Total</th>
                                    <th>{isOpenTab ? "Detectado" : "Resuelto"}</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {incidents.map((incident) => {
                                    const isReceipt = incident.kind === "RECEIPT_MISSING";
                                    const tone = incident.needsManualAction && isOpenTab ? "crit" : INCIDENT_TONE[incident.kind];

                                    return (
                                        <tr key={incident.id} className={incident.needsManualAction && isOpenTab ? "is-crit" : ""}>
                                            <td className="adm-name">
                                                <span className="adm-mono">{incident.orderId}</span>
                                                <em>{incident.order?.customerName ?? "Pedido desconocido"}</em>
                                            </td>
                                            <td>
                                                <span className={`adm-pill is-${tone}`}>{INCIDENT_LABEL[incident.kind]}</span>
                                            </td>
                                            <td className="adm-cause">
                                                {getIncidentCause(incident)}
                                                {isReceipt && incident.lastError ? <code>{incident.lastError}</code> : null}
                                            </td>
                                            <td>
                                                {isReceipt ? (
                                                    <>
                                                        <AttemptsMeter attempts={incident.attempts} max={maxAttempts} />
                                                        {isOpenTab ? (
                                                            <span className="adm-cause__hint">
                                                                {incident.nextRetryAt
                                                                    ? getNextRetryLabel(incident.nextRetryAt)
                                                                    : "Sin más reintentos automáticos"}
                                                            </span>
                                                        ) : null}
                                                    </>
                                                ) : (
                                                    <span className="adm-cause__hint">—</span>
                                                )}
                                            </td>
                                            <td className="num">{incident.order ? `B/. ${formatMoney(incident.order.total)}` : "—"}</td>
                                            <td className="adm-name adm-nowrap">
                                                {formatMoment(isOpenTab ? incident.firstDetectedAt : (incident.resolvedAt ?? incident.firstDetectedAt))}
                                                {!isOpenTab && incident.resolution ? <em>{incident.resolution}</em> : null}
                                            </td>
                                            <td>
                                                {isOpenTab ? (
                                                    <div className="adm-actions adm-actions--wrap">
                                                        {isReceipt ? (
                                                            <button
                                                                type="button"
                                                                className={`adm-btn adm-btn--sm${incident.needsManualAction ? " adm-btn--solid" : ""}`}
                                                                onClick={() => void retryReceipt(incident)}
                                                                disabled={retryingId !== null}
                                                            >
                                                                {retryingId === incident.id ? "Reintentando…" : "Reintentar recibo"}
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            className="adm-btn adm-btn--sm"
                                                            onClick={() => setResolving(incident)}
                                                            disabled={retryingId !== null}
                                                        >
                                                            Marcar resuelto
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="adm-cause__hint">
                                                        {incident.resolvedBy === "auto" ? "Se cerró solo" : `Por ${incident.resolvedBy ?? "—"}`}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {feedback ? (
                    <p className={feedback.tone === "ok" ? "adm-feedback is-ok" : "adm-error"} role="status">
                        {feedback.text}
                    </p>
                ) : null}

                {isOpenTab && incidents.length > 0 ? (
                    <p className="adm-steps">
                        <strong>Cómo se resuelve:</strong> el sistema reintenta solo el recibo con espera creciente (1, 2, 4, 8 y
                        16 minutos, máximo {maxAttempts} intentos). Al llegar al límite queda aquí en rojo. Corrige la causa y usa{" "}
                        <strong>Reintentar recibo</strong>, o crea el recibo a mano en Loyverse y usa{" "}
                        <strong>Marcar resuelto</strong> con su número.
                    </p>
                ) : null}
            </div>

            {resolving ? (
                <ResolveIncidentDialog
                    incident={resolving}
                    onResolve={(input) => resolveManually(resolving, input)}
                    onClose={() => setResolving(null)}
                />
            ) : null}
        </section>
    );
};
