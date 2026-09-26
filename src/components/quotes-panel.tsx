import { useCallback, useEffect, useState } from "react";

import {
    HttpError,
    QUOTE_STATUSES,
    QUOTE_STATUS_LABEL,
    QUOTE_STATUS_PLURAL,
    changeQuoteStatus,
    downloadQuoteIcs,
    fetchQuote,
    fetchQuotes,
    formatPhone,
    formatPrice,
    formatQuoteDate,
    getQuoteSizeLabel,
    isDessertSelection,
} from "@/helpers";
import type { IQuote, IQuoteDetail, QuoteStatus } from "@/helpers";

import { ManualQuoteForm } from "./manual-quote-form";

import "./quotes-panel.css";

/** Llegan desde la web en cualquier momento: la lista se refresca sola. */
const REFRESH_MS = 60 * 1000;

interface IQuotesPanelProps {
    token: string;
    onSessionExpired: () => void;
}

const EMPTY_COUNTS: Record<QuoteStatus, number> = { nueva: 0, confirmada: 0, entregada: 0, cancelada: 0 };

/** El siguiente paso de cada estado. Entregada y cancelada ya no se mueven. */
const NEXT_STEP: Partial<Record<QuoteStatus, { to: QuoteStatus; label: string }>> = {
    nueva: { to: "confirmada", label: "Confirmar cotización" },
    confirmada: { to: "entregada", label: "Marcar entregada" },
};

const formatReceivedAt = (value: string) =>
    new Date(value).toLocaleString("es-PA", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

const getClientWhatsAppUrl = (quote: IQuote & { customerPhone: string }) => {
    const firstName = quote.customerName.split(" ")[0];
    const text = `Hola ${firstName}, te escribimos de Chunky Bites por tu cotización ${quote.code}.`;
    return `https://wa.me/507${quote.customerPhone}?text=${encodeURIComponent(text)}`;
};

const QuoteDetail = ({
    quote,
    isChanging,
    onChangeStatus,
}: {
    quote: IQuoteDetail;
    isChanging: boolean;
    onChangeStatus: (status: QuoteStatus) => void;
}) => {
    const { selection } = quote;
    const next = NEXT_STEP[quote.status];
    const canCancel = quote.status === "nueva" || quote.status === "confirmada";

    return (
        <article className="qp-detail" aria-label={`Cotización ${quote.code}`}>
            <div className="qp-detail__head">
                <div>
                    <div className="qp-detail__code script">{quote.code}</div>
                    <p>
                        {quote.source === "manual"
                            ? `Registrada ${quote.createdBy ? `por ${quote.createdBy} ` : ""}el ${formatReceivedAt(quote.createdAt)}`
                            : `Recibida el ${formatReceivedAt(quote.createdAt)}`}
                    </p>
                </div>
                <span className="qp-pills">
                    {quote.source === "manual" ? <span className="qp-pill qp-pill--manual">Manual</span> : null}
                    <span className={`qp-pill qp-pill--${quote.status}`}>{QUOTE_STATUS_LABEL[quote.status]}</span>
                </span>
            </div>

            {/* Los postres enteros (flan, cheesecake…) se cotizan sin fotos */}
            {quote.cakeImage ? (
                <div className="qp-photos">
                    <figure className="qp-photo">
                        <figcaption>Referencia del cake</figcaption>
                        <a className="qp-photo__frame" href={quote.cakeImage} target="_blank" rel="noopener noreferrer">
                            <img src={quote.cakeImage} alt={`Foto de referencia del cake de ${quote.customerName}`} />
                        </a>
                    </figure>
                    <figure className="qp-photo">
                        <figcaption>Referencia del topper</figcaption>
                        {quote.topperImage ? (
                            <a className="qp-photo__frame" href={quote.topperImage} target="_blank" rel="noopener noreferrer">
                                <img src={quote.topperImage} alt={`Foto de referencia del topper de ${quote.customerName}`} />
                            </a>
                        ) : (
                            <div className="qp-photo__frame qp-photo__none">Sin topper</div>
                        )}
                    </figure>
                </div>
            ) : null}

            <div className="qp-cols">
                <section>
                    <h3 className="qp-h">Lo que pidió</h3>
                    <ul className="qp-spec">
                        <li>
                            <span>{getQuoteSizeLabel(selection)}</span>
                            <span>{formatPrice(selection.basePrice)}</span>
                        </li>
                        {isDessertSelection(selection) ? null : [{ label: "Masa", line: selection.dough }, ...selection.fillings.map((line, index) => ({ label: `Relleno ${index + 1}`, line }))].map(
                            ({ label, line }) => (
                                <li key={label}>
                                    <span>{label} · {line.name}</span>
                                    {line.price ? <span>+{formatPrice(line.price)}</span> : <span className="is-free">incluido</span>}
                                </li>
                            )
                        )}
                        {!isDessertSelection(selection) && selection.topper ? (
                            <li>
                                <span>Topper</span>
                                <span>+{formatPrice(selection.topperPrice)}</span>
                            </li>
                        ) : null}
                        <li className="qp-spec__sum">
                            <span>Total estimado</span>
                            <span>{formatPrice(quote.total)}</span>
                        </li>
                    </ul>
                </section>
                <section>
                    <h3 className="qp-h">Cliente</h3>
                    <dl className="qp-client">
                        <div><dt>Nombre</dt><dd>{quote.customerName}</dd></div>
                        <div>
                            <dt>WhatsApp</dt>
                            <dd>{quote.customerPhone ? formatPhone(quote.customerPhone) : <span className="qp-muted">Sin celular</span>}</dd>
                        </div>
                        <div><dt>{quote.source === "manual" ? "Entrega" : "Fecha deseada"}</dt><dd>{formatQuoteDate(quote.desiredDate)}</dd></div>
                    </dl>
                </section>
            </div>

            {quote.note ? (
                <section>
                    <h3 className="qp-h">{quote.source === "manual" ? "Nota" : "Nota del cliente"}</h3>
                    <p className="qp-note">{quote.note}</p>
                </section>
            ) : null}

            {quote.statusChangedBy ? (
                <p className="qp-changed">Último cambio: {quote.statusChangedBy}</p>
            ) : null}

            <div className="qp-actions">
                {quote.status !== "cancelada" ? (
                    <button type="button" className="qp-btn qp-btn--calendar" onClick={() => downloadQuoteIcs(quote)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="16" rx="3" />
                            <path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
                        </svg>
                        Agregar al calendario
                    </button>
                ) : null}
                {quote.customerPhone ? (
                    <a
                        className="qp-btn"
                        href={getClientWhatsAppUrl({ ...quote, customerPhone: quote.customerPhone })}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Abrir WhatsApp de {quote.customerName.split(" ")[0]}
                    </a>
                ) : null}
                {next ? (
                    <button type="button" className="qp-btn qp-btn--solid" disabled={isChanging} onClick={() => onChangeStatus(next.to)}>
                        {isChanging ? "Guardando…" : next.label}
                    </button>
                ) : null}
                {canCancel ? (
                    <button type="button" className="qp-btn qp-btn--danger qp-actions__end" disabled={isChanging} onClick={() => onChangeStatus("cancelada")}>
                        Cancelar
                    </button>
                ) : null}
            </div>
        </article>
    );
};

/** Lista y detalle de las cotizaciones de cakes. Solo la ve la pastelera en /gestion. */
export const QuotesPanel = ({ token, onSessionExpired }: IQuotesPanelProps) => {
    const [status, setStatus] = useState<QuoteStatus>("nueva");
    const [quotes, setQuotes] = useState<IQuote[]>([]);
    const [counts, setCounts] = useState(EMPTY_COUNTS);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<IQuoteDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isChanging, setIsChanging] = useState(false);
    const [error, setError] = useState("");
    const [isRegistering, setIsRegistering] = useState(false);

    const handleError = useCallback(
        (requestError: unknown, fallback: string) => {
            if (requestError instanceof HttpError && requestError.status === 401) {
                onSessionExpired();
                return;
            }
            setError(requestError instanceof HttpError ? requestError.message : fallback);
        },
        [onSessionExpired]
    );

    const loadList = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const data = await fetchQuotes(token, status, signal);
                setQuotes(data.quotes);
                setCounts(data.counts);
                setError("");
                // Si lo elegido ya no está en este filtro, se abre la primera
                setSelectedId((current) =>
                    current && data.quotes.some((one) => one.id === current) ? current : data.quotes[0]?.id ?? null
                );
            } catch (requestError) {
                if (signal?.aborted) return;
                handleError(requestError, "No pudimos cargar las cotizaciones.");
            } finally {
                if (!signal?.aborted) setIsLoading(false);
            }
        },
        [token, status, handleError]
    );

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        void loadList(controller.signal);
        const timer = window.setInterval(() => void loadList(), REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [loadList]);

    // Las fotos pesan: solo se piden al abrir una cotización
    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            return;
        }
        if (detail?.id === selectedId) return;

        const controller = new AbortController();
        setIsLoadingDetail(true);
        fetchQuote(token, selectedId, controller.signal)
            .then(({ quote }) => setDetail(quote))
            .catch((requestError) => {
                if (!controller.signal.aborted) handleError(requestError, "No pudimos abrir la cotización.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoadingDetail(false);
            });
        return () => controller.abort();
    }, [token, selectedId, detail?.id, handleError]);

    const changeStatus = async (to: QuoteStatus) => {
        if (!detail) return;
        setIsChanging(true);
        try {
            const { quote } = await changeQuoteStatus(token, detail.id, to);
            setDetail(quote);
            // Se va al filtro nuevo para que quien la movió la siga viendo
            setSelectedId(quote.id);
            setStatus(to);
        } catch (requestError) {
            handleError(requestError, "No pudimos cambiar el estado.");
            void loadList();
        } finally {
            setIsChanging(false);
        }
    };

    // Al guardar se abre la nueva en su filtro, como después de cambiar un estado
    const handleSaved = (quote: IQuote) => {
        setIsRegistering(false);
        setSelectedId(quote.id);
        if (quote.status === status) void loadList();
        else setStatus(quote.status);
    };

    if (isRegistering) {
        return (
            <div className="qp">
                <ManualQuoteForm
                    token={token}
                    onSaved={handleSaved}
                    onCancel={() => setIsRegistering(false)}
                    onSessionExpired={onSessionExpired}
                />
            </div>
        );
    }

    return (
        <div className="qp">
            <div className="qp-bar">
                <div className="qp-filters" role="group" aria-label="Estado">
                    {QUOTE_STATUSES.map((one) => (
                        <button key={one} type="button" aria-pressed={status === one} onClick={() => setStatus(one)}>
                            {QUOTE_STATUS_PLURAL[one]} <span className="qp-filters__n">{counts[one]}</span>
                        </button>
                    ))}
                </div>
                <button type="button" className="qp-btn qp-btn--solid qp-bar__add" onClick={() => setIsRegistering(true)}>
                    + Registrar cotización
                </button>
            </div>

            {error ? <p className="qp-error" role="alert">{error}</p> : null}

            <div className="qp-split">
                <div>
                    {isLoading && !quotes.length ? (
                        <p className="qp-empty">Cargando…</p>
                    ) : quotes.length === 0 ? (
                        <p className="qp-empty">No hay cotizaciones {QUOTE_STATUS_PLURAL[status].toLowerCase()}.</p>
                    ) : (
                        <ul className="qp-list">
                            {quotes.map((quote) => (
                                <li key={quote.id}>
                                    <button
                                        type="button"
                                        className="qp-row"
                                        aria-current={quote.id === selectedId}
                                        onClick={() => setSelectedId(quote.id)}
                                    >
                                        <span className="qp-row__main">
                                            <b>
                                                {quote.customerName}
                                                {quote.source === "manual" ? <span className="qp-tag">Manual</span> : null}
                                            </b>
                                            <small>{getQuoteSizeLabel(quote.selection)}</small>
                                            <small>Para el {formatQuoteDate(quote.desiredDate)}</small>
                                        </span>
                                        <span className="qp-row__end">
                                            <span className="qp-row__total">{formatPrice(quote.total)}</span>
                                            <span className="qp-row__code">{quote.code}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {detail && detail.id === selectedId ? (
                    <QuoteDetail quote={detail} isChanging={isChanging} onChangeStatus={changeStatus} />
                ) : (
                    <div className="qp-detail qp-detail--empty">
                        {isLoadingDetail ? "Abriendo la cotización…" : "Elige una cotización de la lista."}
                    </div>
                )}
            </div>
        </div>
    );
};
