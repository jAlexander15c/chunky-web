import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { HttpError, fetchWebReport, formatRange } from "@/helpers";
import type { IWebReport } from "@/helpers";
import { formatCount } from "./admin/web-helpers";
import { WebBody, QuotesBody } from "./admin/web-bodies";

const REFRESH_MS = 60000;

/** Pestañas de la sección: lo que se pide para comprar y lo que se pide para cotizar. */
type WebTab = "pedidos" | "cotizaciones";
const WEB_TAB_PARAM = "t";

/* ============ Sección Web ============ */

interface IAdminWebProps {
    token: string;
    onSessionExpired: () => void;
    refreshKey: number;
    /** Primer y último día (incluidos): los elige el encabezado del tablero, iguales para Ventas y Web. */
    from: string;
    to: string;
}

export const AdminWeb = ({ token, onSessionExpired, refreshKey, from, to }: IAdminWebProps) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const tab: WebTab = searchParams.get(WEB_TAB_PARAM) === "cotizaciones" ? "cotizaciones" : "pedidos";
    const [report, setReport] = useState<IWebReport | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                setReport(await fetchWebReport(token, from, to, signal));
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) {
                    onSessionExpired();
                    return;
                }
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar las estadísticas de la web.");
            } finally {
                if (!signal?.aborted) setIsLoading(false);
            }
        },
        [token, from, to, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        void load(controller.signal);

        const timer = window.setInterval(() => void load(), REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [load, refreshKey]);

    // La pestaña va en la dirección, como la sección: al recargar se queda donde estaba
    const changeTab = (next: WebTab) =>
        setSearchParams(
            (current) => {
                const params = new URLSearchParams(current);
                if (next === "pedidos") params.delete(WEB_TAB_PARAM);
                else params.set(WEB_TAB_PARAM, next);
                return params;
            },
            { replace: true }
        );

    const isStale = isLoading && report !== null;

    return (
        <section className="adm-section-body" aria-busy={isLoading}>
            {report ? (
                <p className="adm-period__range">
                    {formatRange(report.range.from, report.range.to)} · comparado con {formatRange(report.range.previousFrom, report.range.previousTo)}
                </p>
            ) : null}

            <div className="adm-tabs" role="tablist" aria-label="Qué mirar de la web">
                <button type="button" role="tab" className="adm-tab" aria-selected={tab === "pedidos"} onClick={() => changeTab("pedidos")}>
                    Pedidos
                </button>
                <button
                    type="button"
                    role="tab"
                    className="adm-tab"
                    aria-selected={tab === "cotizaciones"}
                    onClick={() => changeTab("cotizaciones")}
                >
                    Cotizaciones
                    {report ? <span className="adm-tab__count">{formatCount(report.quotes.sent.all.count)}</span> : null}
                </button>
            </div>

            {error ? <p className="adm-error">{error}</p> : null}

            {!report ? (
                isLoading ? <div className="adm-skeleton adm-skeleton--tiles" aria-label="Cargando las estadísticas de la web" /> : null
            ) : (
                <div className={isStale ? "adm-fin is-stale" : "adm-fin"} role="tabpanel">
                    {tab === "pedidos" ? <WebBody report={report} /> : <QuotesBody report={report} />}
                </div>
            )}
        </section>
    );
};
