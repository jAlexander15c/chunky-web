import { useEffect, useState } from "react";

import { HttpError, QUOTE_INCOME_PERIODS, fetchQuoteSummary, formatPrice, getDelta, getQuoteIncomeRange } from "@/helpers";
import type { IQuoteSummary, QuoteIncomePeriod } from "@/helpers";

import "./quotes-income.css";

interface IQuotesIncomeProps {
    token: string;
    onSessionExpired: () => void;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09-01" y "2026-09-07" -> "1–7 sep"; si cambia el mes, "29 sep–5 oct". */
const formatWeekLabel = (from: string, to: string) => {
    const [, fromMonth, fromDay] = from.split("-").map(Number);
    const [, toMonth, toDay] = to.split("-").map(Number);
    if (from === to) return `${fromDay} ${MONTHS[fromMonth - 1]}`;
    return fromMonth === toMonth
        ? `${fromDay}–${toDay} ${MONTHS[toMonth - 1]}`
        : `${fromDay} ${MONTHS[fromMonth - 1]}–${toDay} ${MONTHS[toMonth - 1]}`;
};

/** "2026-09-01" -> "septiembre 2026" para el subtítulo de un mes entero. */
const formatRangeLabel = (from: string, to: string) => {
    const [fromYear, fromMonth] = from.split("-").map(Number);
    const isWholeMonth = from.endsWith("-01") && to.slice(0, 7) === from.slice(0, 7);
    if (isWholeMonth) {
        return new Date(fromYear, fromMonth - 1, 1).toLocaleDateString("es-PA", { month: "long", year: "numeric" });
    }
    return `${formatWeekLabel(from, from)} – ${formatWeekLabel(to, to)}`;
};

/** Un paso redondo para el eje: el tope queda justo encima del valor más alto. */
const getNiceStep = (max: number, ticks: number) => {
    const raw = Math.max(max, 1) / ticks;
    return [5, 10, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((step) => step >= raw) ?? Math.ceil(raw / 1000) * 1000;
};

const CHART = { width: 440, height: 210, left: 46, right: 8, top: 14, bottom: 30 };
const CHART_TICKS = 3;

/** Bruto y neto de cada semana, lado a lado, en una sola escala. */
const WeeklyChart = ({ series }: { series: IQuoteSummary["series"] }) => {
    const step = getNiceStep(Math.max(...series.map((one) => one.gross)), CHART_TICKS);
    const top = step * CHART_TICKS;
    const plotHeight = CHART.height - CHART.top - CHART.bottom;
    const plotWidth = CHART.width - CHART.left - CHART.right;
    const slot = plotWidth / series.length;
    const barWidth = Math.min(30, (slot - 14) / 2);
    const getY = (value: number) => CHART.top + plotHeight - (Math.max(value, 0) / top) * plotHeight;

    return (
        <svg className="qi-chart" viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label="Ingreso bruto y neto por semana">
            {Array.from({ length: CHART_TICKS + 1 }, (_, index) => {
                const value = step * index;
                const y = getY(value);
                return (
                    <g key={value}>
                        <line className="qi-chart__grid" x1={CHART.left} x2={CHART.width - CHART.right} y1={y} y2={y} />
                        <text className="qi-chart__label" x={CHART.left - 8} y={y + 4} textAnchor="end">
                            ${value}
                        </text>
                    </g>
                );
            })}
            {series.map((week, index) => {
                const center = CHART.left + slot * index + slot / 2;
                return (
                    <g key={week.from}>
                        <rect className="qi-chart__gross" x={center - barWidth - 2} y={getY(week.gross)} width={barWidth} height={getY(0) - getY(week.gross)} rx={4}>
                            <title>{`Bruto ${formatPrice(week.gross)}`}</title>
                        </rect>
                        <rect className="qi-chart__net" x={center + 2} y={getY(week.net)} width={barWidth} height={getY(0) - getY(week.net)} rx={4}>
                            <title>{`Neto ${formatPrice(week.net)}`}</title>
                        </rect>
                        <text className="qi-chart__label" x={center} y={CHART.height - 8} textAnchor="middle">
                            {formatWeekLabel(week.from, week.to)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

const Delta = ({ value }: { value: number | null }) =>
    value === null ? null : (
        <span className={`qi-delta ${value > 0 ? "is-up" : value < 0 ? "is-down" : "is-flat"}`}>
            {value > 0 ? "↑" : value < 0 ? "↓" : "="} {Math.abs(value)} %
        </span>
    );

const IncomeBody = ({ summary }: { summary: IQuoteSummary }) => {
    const { delivered, previous, pending, bySource } = summary;
    const netShare = delivered.gross > 0 ? Math.round((delivered.net / delivered.gross) * 100) : 0;
    const webShare = delivered.gross > 0 ? (bySource.web.gross / delivered.gross) * 100 : 0;

    return (
        <>
            <div className="qi-tiles">
                <div className="qi-tile">
                    <span className="qi-tile__label">Ingreso bruto</span>
                    <span className="qi-tile__value">{formatPrice(delivered.gross)}</span>
                    <span className="qi-tile__detail">
                        <Delta value={getDelta(delivered.gross, previous.gross)} />
                        {delivered.count === 1 ? "1 entregada" : `${delivered.count} entregadas`}
                    </span>
                </div>
                <div className="qi-tile">
                    <span className="qi-tile__label">Costo estimado</span>
                    <span className="qi-tile__value">{formatPrice(delivered.cost)}</span>
                    <span className="qi-tile__detail">Ingredientes, empaque y gastos</span>
                </div>
                <div className="qi-tile qi-tile--net">
                    <span className="qi-tile__label">Ingreso neto</span>
                    <span className="qi-tile__value">{formatPrice(delivered.net)}</span>
                    <span className="qi-tile__detail">
                        <Delta value={getDelta(delivered.net, previous.net)} />
                        {netShare}% del bruto
                    </span>
                </div>
                <div className="qi-tile qi-tile--pending">
                    <span className="qi-tile__label">Por cobrar</span>
                    <span className="qi-tile__value">{formatPrice(pending.gross)}</span>
                    <span className="qi-tile__detail">
                        {pending.count === 1 ? "1 confirmada sin entregar" : `${pending.count} confirmadas sin entregar`}
                    </span>
                </div>
            </div>

            <div className="qi-row">
                <section className="qi-card">
                    <div className="qi-card__head">
                        <h2 className="qi-h">Por semana</h2>
                        <div className="qi-legend" aria-hidden="true">
                            <span><i className="is-gross" />Bruto</span>
                            <span><i className="is-net" />Neto</span>
                        </div>
                    </div>
                    <WeeklyChart series={summary.series} />
                </section>

                <section className="qi-card">
                    <h2 className="qi-h">De dónde vienen</h2>
                    <div className="qi-bar" aria-hidden="true">
                        <span className="is-web" style={{ width: `${webShare}%` }} />
                        <span className="is-manual" style={{ width: `${delivered.gross > 0 ? 100 - webShare : 0}%` }} />
                    </div>
                    <dl className="qi-sources">
                        <div>
                            <dt><b>Web</b> · cotizador</dt>
                            <dd>{bySource.web.count} · {formatPrice(bySource.web.gross)}</dd>
                        </div>
                        <div>
                            <dt><b>Manual</b> · registradas aquí</dt>
                            <dd>{bySource.manual.count} · {formatPrice(bySource.manual.gross)}</dd>
                        </div>
                    </dl>
                    <p className="qi-note">Cuentan las entregadas con fecha de entrega en el rango. Las canceladas no cuentan.</p>
                </section>
            </div>

            <section className="qi-card">
                <h2 className="qi-h">Por producto</h2>
                {summary.byProduct.length ? (
                    <div className="qi-table-wrap">
                        <table className="qi-table">
                            <thead>
                                <tr>
                                    <th scope="col">Producto</th>
                                    <th scope="col" className="is-num">Entregados</th>
                                    <th scope="col" className="is-num">Bruto</th>
                                    <th scope="col" className="is-num">Costo</th>
                                    <th scope="col" className="is-num">Neto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.byProduct.map((one) => (
                                    <tr key={one.label}>
                                        <th scope="row">{one.label}</th>
                                        <td className="is-num">{one.count}</td>
                                        <td className="is-num">{formatPrice(one.gross)}</td>
                                        <td className="is-num">{formatPrice(one.cost)}</td>
                                        <td className="is-num">{formatPrice(one.net)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <th scope="row">Total</th>
                                    <td className="is-num">{delivered.count}</td>
                                    <td className="is-num">{formatPrice(delivered.gross)}</td>
                                    <td className="is-num">{formatPrice(delivered.cost)}</td>
                                    <td className="is-num">{formatPrice(delivered.net)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                ) : (
                    <p className="qi-empty">Todavía no hay entregas en este rango.</p>
                )}
                <p className="qi-note">
                    El costo de los cakes es un estimado: precio ÷ 2.95, el mismo factor de los postres (gastos, mano de obra y
                    utilidad). Flan y cheesecake usan su costo de la hoja más el empaque de $3.
                </p>
            </section>
        </>
    );
};

/** Ingreso bruto y neto de las cotizaciones entregadas. Solo lo ve la pastelera en /gestion. */
export const QuotesIncome = ({ token, onSessionExpired }: IQuotesIncomeProps) => {
    const [period, setPeriod] = useState<QuoteIncomePeriod>("mes");
    const [summary, setSummary] = useState<IQuoteSummary | null>(null);
    const [error, setError] = useState("");
    const range = getQuoteIncomeRange(period);

    useEffect(() => {
        const controller = new AbortController();
        fetchQuoteSummary(token, range.from, range.to, controller.signal)
            .then((data) => {
                setSummary(data);
                setError("");
            })
            .catch((requestError) => {
                if (controller.signal.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) {
                    onSessionExpired();
                    return;
                }
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos calcular los ingresos.");
            });
        return () => controller.abort();
    }, [token, range.from, range.to, onSessionExpired]);

    const isCurrent = summary?.range.from === range.from && summary.range.to === range.to;

    return (
        <div className="qi">
            <div className="qi-top">
                <p className="qi-range">Por fecha de entrega · {formatRangeLabel(range.from, range.to)}</p>
                <div className="qi-periods" role="group" aria-label="Período">
                    {QUOTE_INCOME_PERIODS.map((one) => (
                        <button key={one.id} type="button" aria-pressed={period === one.id} onClick={() => setPeriod(one.id)}>
                            {one.label}
                        </button>
                    ))}
                </div>
            </div>

            {error ? <p className="qi-error" role="alert">{error}</p> : null}

            {summary ? (
                <div className={`qi-body${isCurrent ? "" : " is-loading"}`} aria-busy={!isCurrent}>
                    <IncomeBody summary={summary} />
                </div>
            ) : error ? null : (
                <p className="qi-empty">Calculando…</p>
            )}
        </div>
    );
};
