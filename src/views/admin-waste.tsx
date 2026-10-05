import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { HttpError, formatMoney, formatQuantity } from "@/helpers";
import { fetchWasteReport } from "@/helpers/inventory";
import { WASTE_REASON_LABEL, formatWastePercent, getWasteTone } from "@/helpers/product-waste";
import type { IWasteReport, WasteByReason, WasteReason } from "@/helpers/product-waste";


interface IAdminWasteProps {
    token: string;
    onSessionExpired: () => void;
    refreshKey?: number;
    /** Período del encabezado del tablero. */
    from: string;
    to: string;
}

const REASONS: WasteReason[] = ["vencido", "danado", "consumo_interno"];

/** Colores de la barra y la leyenda: vencido en rojo, se dañó en orquídea, consumo interno en mora. */
const REASON_COLOR: Record<WasteReason, string> = {
    vencido: "var(--adm-crit)",
    danado: "var(--orquidea)",
    consumo_interno: "var(--mora)",
};

/** En la tarjeta de cada producto cabe la versión corta. */
const SHORT_REASON_LABEL: Record<WasteReason, string> = {
    vencido: "Vencido",
    danado: "Se dañó",
    consumo_interno: "Interno",
};

const REFRESH_MS = 60000;

const ReasonLegend = ({ byReason, short = false }: { byReason: WasteByReason; short?: boolean }) => (
    <div className="adm-waste__legend">
        {REASONS.filter((reason) => byReason[reason] > 0).map((reason) => (
            <span key={reason} style={{ "--waste-color": REASON_COLOR[reason] } as CSSProperties}>
                {(short ? SHORT_REASON_LABEL : WASTE_REASON_LABEL)[reason]} {formatQuantity(byReason[reason])}
            </span>
        ))}
    </div>
);

/** Cuánto producto por lotes se pierde en el período: unidades, % de lo producido y dinero. */
export const AdminWaste = ({ token, onSessionExpired, refreshKey, from, to }: IAdminWasteProps) => {
    const [report, setReport] = useState<IWasteReport | null>(null);
    const [error, setError] = useState("");
    // El período que se pidió para el reporte que se ve
    const [loadedKey, setLoadedKey] = useState("");
    const [hasFailed, setHasFailed] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        const load = () => {
            fetchWasteReport(token, from, to, controller.signal)
                .then((data) => {
                    setReport(data);
                    setLoadedKey(`${from}|${to}`);
                    setError("");
                    setHasFailed(false);
                })
                .catch((requestError) => {
                    if (controller.signal.aborted) return;
                    if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                    setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar la merma.");
                    setHasFailed(true);
                });
        };
        load();
        const timer = window.setInterval(load, REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [token, from, to, refreshKey, onSessionExpired]);

    // Cargando mientras no haya llegado el reporte de lo que se está pidiendo
    const isLoading = !hasFailed && (report === null || loadedKey !== `${from}|${to}`);

    return (
        <section className="adm-band" aria-busy={isLoading}>
            <div className="adm-band__head">
                <h2 className="script">Merma</h2>
                <span className="adm-band__sub">Productos por lotes</span>
                <span className="adm-src is-own">Postgres</span>
            </div>

            <div className="adm-card adm-waste">
                {error ? <p className="adm-error">{error}</p> : null}

                {!report ? (
                    isLoading ? <p className="adm-empty">Cargando la merma…</p> : null
                ) : (
                    <div className={isLoading ? "adm-waste__body is-stale" : "adm-waste__body"}>
                        {report.totals.produced === 0 && report.totals.waste === 0 && report.products.length === 0 ? (
                            <p className="adm-empty">No hubo lotes ni merma de productos en este período.</p>
                        ) : (
                            <>
                                <div className="adm-waste__kpis">
                                    <div>
                                        <span>Merma</span>
                                        <b>{formatQuantity(report.totals.waste)}</b>
                                        <small>de {formatQuantity(report.totals.produced)} producidas</small>
                                    </div>
                                    <div>
                                        <span>%</span>
                                        <b>{formatWastePercent(report.totals.percent)}</b>
                                        <small>merma ÷ producido</small>
                                    </div>
                                    <div>
                                        {/* La moneda va en la etiqueta: así el monto cabe en una línea a 390 px */}
                                        <span>Costo B/.</span>
                                        <b>{formatMoney(report.totals.cost)}</b>
                                        <small>{report.totals.unitsWithoutCost > 0 ? `${formatQuantity(report.totals.unitsWithoutCost)} u. sin costo` : "todo con costo"}</small>
                                    </div>
                                </div>

                                {report.totals.waste > 0 ? (
                                    <>
                                        <div className="adm-waste__bar" role="img" aria-label="Merma por motivo">
                                            {REASONS.filter((reason) => report.totals.byReason[reason] > 0).map((reason) => (
                                                <i key={reason} style={{ width: `${(report.totals.byReason[reason] / report.totals.waste) * 100}%`, background: REASON_COLOR[reason] }} />
                                            ))}
                                        </div>
                                        <ReasonLegend byReason={report.totals.byReason} />
                                    </>
                                ) : null}

                                <div className="adm-waste__cards">
                                    {report.products.map((product) => (
                                        <article className="adm-waste__card" key={product.variantId}>
                                            <div className="adm-waste__top">
                                                <h3>{product.name}</h3>
                                                <span className={`adm-waste__pct is-${getWasteTone(product.percent)}`}>{formatWastePercent(product.percent)}</span>
                                            </div>
                                            <div className="adm-waste__stats">
                                                <span>
                                                    Producidas<b>{formatQuantity(product.produced)}</b>
                                                </span>
                                                <span>
                                                    Merma<b>{formatQuantity(product.waste)}</b>
                                                </span>
                                                <span>
                                                    Costo<b>{product.cost === null ? "sin costo" : `B/. ${formatMoney(product.cost)}`}</b>
                                                    {product.cost !== null && product.unitsWithoutCost > 0 ? <em>{formatQuantity(product.unitsWithoutCost)} u. sin costo</em> : null}
                                                </span>
                                            </div>
                                            {product.waste > 0 ? <ReasonLegend byReason={product.byReason} short /> : null}
                                        </article>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};
