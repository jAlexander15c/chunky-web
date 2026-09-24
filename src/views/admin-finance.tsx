import { useCallback, useEffect, useMemo, useState } from "react";

import {
    FINANCE_PERIODS,
    HttpError,
    fetchFinance,
    formatDayLabel,
    formatHour,
    formatMoney,
    formatRange,
    formatShortDate,
    getDelta,
    getPeriodRange,
} from "@/helpers";
import type { FinancePeriod, IFinancePoint, IFinanceReport } from "@/helpers";

const REFRESH_MS = 60000;
const PERIOD_STORAGE_KEY = "chunky-admin-finance-period";
const DEFAULT_PERIOD: FinancePeriod = "30d";

/** Etiqueta corta del eje de horas en 12 h: "8a", "12p", "2p". */
const formatHourTick = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;

/** El 0 de getUTCDay es domingo; la semana del negocio arranca el lunes. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABEL = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const WEEKDAY_NAME = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/* ============ Estampilla de cifra ============ */

interface IStatTileProps {
    label: string;
    value: string;
    detail?: string;
    isAlert?: boolean;
    split?: { left: number; right: number };
    /** Variación contra el período anterior, en %. */
    delta?: number | null;
    action?: { label: string; onClick: () => void };
}

export const StatTile = ({ label, value, detail, isAlert, split, delta, action }: IStatTileProps) => (
    <div className="stamp-lift">
        <div className="stamp adm-tile">
            <span className="adm-tile__label">{label}</span>
            <span className={`adm-tile__value${isAlert ? " is-alert" : ""}`}>{value}</span>
            {delta !== undefined && delta !== null ? (
                <span className={`adm-delta ${delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat"}`}>
                    {delta > 0 ? "↑" : delta < 0 ? "↓" : "="} {Math.abs(delta)} % vs período anterior
                </span>
            ) : null}
            {detail ? <span className="adm-tile__detail">{detail}</span> : null}
            {split && split.left + split.right > 0 ? (
                <span className="adm-split" aria-hidden="true">
                    <i style={{ width: `${(split.left / (split.left + split.right)) * 100}%` }} className="is-local" />
                    <i style={{ width: `${(split.right / (split.left + split.right)) * 100}%` }} className="is-web" />
                </span>
            ) : null}
            {action ? (
                <button type="button" className="adm-link adm-tile__link" onClick={action.onClick}>
                    {action.label} →
                </button>
            ) : null}
        </div>
    </div>
);

/* ============ Gráfico de venta ============ */

const SALES_CHART = { width: 720, height: 262, left: 46, right: 54, top: 14, bottom: 32 };
/** Etiquetas del eje x que caben sin encimarse. */
const CHART_LABELS = 7;

/**
 * Venta de los dos canales por día o por semana. Un punto sin ventas corta la línea en vez
 * de bajarla a cero, que se leería como un día malo. Una devolución no la baja de cero.
 */
const SalesChart = ({ points, granularity }: { points: IFinancePoint[]; granularity: "day" | "week" }) => {
    const { paths, marks, gridLines, labels } = useMemo(() => {
        const highest = Math.max(100, ...points.map((point) => Math.max(point.mostrador, point.web)));
        const step = Math.max(50, Math.ceil(highest / 4 / 50) * 50);
        const top = step * 4;

        const getX = (index: number) =>
            SALES_CHART.left + (index * (SALES_CHART.width - SALES_CHART.left - SALES_CHART.right)) / Math.max(1, points.length - 1);
        const getY = (value: number) =>
            SALES_CHART.top + (1 - Math.max(0, value) / top) * (SALES_CHART.height - SALES_CHART.top - SALES_CHART.bottom);

        const isClosed = (point: IFinancePoint) => point.total === 0 && point.tickets === 0;

        const buildPath = (key: "mostrador" | "web") => {
            const segments: string[] = [];
            let current: string[] = [];

            points.forEach((point, index) => {
                if (isClosed(point)) {
                    if (current.length) segments.push(current.join(" "));
                    current = [];
                    return;
                }
                current.push(`${current.length ? "L" : "M"}${getX(index).toFixed(1)},${getY(point[key]).toFixed(1)}`);
            });

            if (current.length) segments.push(current.join(" "));
            return segments;
        };

        const lastOpen = [...points].reverse().find((point) => !isClosed(point));
        const lastIndex = lastOpen ? points.lastIndexOf(lastOpen) : -1;
        const labelStep = Math.max(1, Math.ceil(points.length / CHART_LABELS));

        return {
            paths: { mostrador: buildPath("mostrador"), web: buildPath("web") },
            marks:
                lastIndex >= 0
                    ? (["mostrador", "web"] as const).map((key) => ({
                          key,
                          x: getX(lastIndex),
                          y: getY(points[lastIndex][key]),
                          value: Math.round(points[lastIndex][key]),
                      }))
                    : [],
            gridLines: Array.from({ length: 5 }, (_, index) => ({ value: index * step, y: getY(index * step) })),
            labels: points
                .map((point, index) => ({
                    label: granularity === "day" && points.length <= 14 ? formatDayLabel(point.date) : formatShortDate(point.date),
                    x: getX(index),
                    index,
                }))
                .filter((entry) => entry.index % labelStep === 0),
        };
    }, [points, granularity]);

    return (
        <svg
            className="adm-chart"
            viewBox={`0 0 ${SALES_CHART.width} ${SALES_CHART.height}`}
            role="img"
            aria-label={`Venta ${granularity === "day" ? "diaria" : "semanal"} de mostrador y web`}
        >
            {gridLines.map((line) => (
                <g key={line.value}>
                    <line x1={SALES_CHART.left} y1={line.y} x2={SALES_CHART.width - SALES_CHART.right} y2={line.y} className="adm-chart__grid" />
                    <text x={SALES_CHART.left - 9} y={line.y + 4} textAnchor="end" className="adm-chart__axis">{line.value}</text>
                </g>
            ))}

            {paths.mostrador.map((path, index) => (
                <path key={`m${index}`} d={path} className="adm-chart__line is-local" />
            ))}
            {paths.web.map((path, index) => (
                <path key={`w${index}`} d={path} className="adm-chart__line is-web" />
            ))}

            {marks.map((mark) => (
                <g key={mark.key}>
                    <circle cx={mark.x} cy={mark.y} r={5} className={`adm-chart__dot is-${mark.key === "mostrador" ? "local" : "web"}`} />
                    <text x={mark.x + 10} y={mark.y + 4} className={`adm-chart__mark is-${mark.key === "mostrador" ? "local" : "web"}`}>
                        {mark.value}
                    </text>
                </g>
            ))}

            {labels.map((entry) => (
                <text key={entry.index} x={entry.x} y={SALES_CHART.height - 10} textAnchor="middle" className="adm-chart__axis">
                    {entry.label}
                </text>
            ))}
        </svg>
    );
};

/* ============ Cálculos de la vista ============ */

/** "hoy", "hace 1 d" o "hace N d", contado en días de Panamá. */
const formatAgeInDays = (value: string) => {
    const days = Math.floor((Date.now() - new Date(value).getTime()) / (24 * 60 * 60 * 1000));
    return days <= 0 ? "hoy" : `hace ${days} d`;
};

const readStoredPeriod = (): FinancePeriod => {
    try {
        const stored = window.localStorage.getItem(PERIOD_STORAGE_KEY);
        return FINANCE_PERIODS.some((period) => period.id === stored) ? (stored as FinancePeriod) : DEFAULT_PERIOD;
    } catch {
        return DEFAULT_PERIOD;
    }
};

const storePeriod = (period: FinancePeriod) => {
    try {
        window.localStorage.setItem(PERIOD_STORAGE_KEY, period);
    } catch {
        return;
    }
};

/* ============ Finanzas ============ */

interface IAdminFinanceProps {
    token: string;
    onSessionExpired: () => void;
    refreshKey: number;
}

export const AdminFinance = ({ token, onSessionExpired, refreshKey }: IAdminFinanceProps) => {
    const [period, setPeriod] = useState<FinancePeriod>(readStoredPeriod);
    const [report, setReport] = useState<IFinanceReport | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const { from, to } = getPeriodRange(period);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                setReport(await fetchFinance(token, from, to, signal));
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) {
                    onSessionExpired();
                    return;
                }
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar las finanzas.");
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

    const changePeriod = (next: FinancePeriod) => {
        setPeriod(next);
        storePeriod(next);
    };

    // Mientras llega el período nuevo se sigue viendo el anterior, atenuado
    const isStale = isLoading && report !== null;

    return (
        <section className="adm-band" aria-busy={isLoading}>
            <div className="adm-band__head">
                <h2 className="script">Finanzas</h2>
                <span className="adm-band__sub">Venta, cobros, salidas de efectivo y cuándo se vende</span>
                <span className="adm-src is-own">Postgres</span>
            </div>

            <div className="adm-period">
                <div className="adm-chips" role="group" aria-label="Período">
                    {FINANCE_PERIODS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className="adm-chip"
                            aria-pressed={period === option.id}
                            onClick={() => changePeriod(option.id)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                {report ? (
                    <span className="adm-period__range">
                        {formatRange(report.range.from, report.range.to)} · comparado con {formatRange(report.range.previousFrom, report.range.previousTo)}
                    </span>
                ) : null}
            </div>

            {error ? <p className="adm-error">{error}</p> : null}

            {!report ? (
                isLoading ? <p className="adm-empty">Cargando las finanzas…</p> : null
            ) : (
                <div className={isStale ? "adm-fin is-stale" : "adm-fin"}>
                    <FinanceBody report={report} />
                </div>
            )}
        </section>
    );
};

const FinanceBody = ({ report }: { report: IFinanceReport }) => {
    const { totals, previous, range, dataSince } = report;

    // Solo se compara si el historial cubre todo el período anterior
    const canCompare = dataSince !== null && dataSince <= range.previousFrom;
    const net = Math.round((totals.total - report.outflows.total) * 100) / 100;

    return (
        <>
            {dataSince === null ? (
                <p className="adm-warning">
                    Todavía no hay recibos guardados. Se guardan solos cada vez que el sistema lee los recibos de Loyverse.
                </p>
            ) : dataSince > range.from ? (
                <p className="adm-warning">
                    Historial desde el {formatShortDate(dataSince, true)}: antes de esa fecha el sistema no guardaba los recibos,
                    así que este período sale incompleto y no se compara.
                </p>
            ) : !canCompare ? (
                <p className="adm-warning">
                    Historial desde el {formatShortDate(dataSince, true)}: el período anterior sale incompleto, así que no se compara.
                </p>
            ) : null}

            <div className="adm-tiles adm-tiles--fin">
                <StatTile
                    label="Venta del período"
                    value={`B/. ${formatMoney(totals.total)}`}
                    delta={canCompare ? getDelta(totals.total, previous.total) : null}
                    detail={`mostrador B/. ${formatMoney(totals.mostrador)} · web B/. ${formatMoney(totals.web)}`}
                    split={{ left: Math.max(0, totals.mostrador), right: Math.max(0, totals.web) }}
                />
                <StatTile
                    label="Tickets"
                    value={totals.tickets.toLocaleString("es-PA")}
                    delta={canCompare ? getDelta(totals.tickets, previous.tickets) : null}
                    detail={totals.refunds > 0 ? `devoluciones B/. ${formatMoney(totals.refunds)}` : undefined}
                />
                <StatTile
                    label="Ticket promedio"
                    value={`B/. ${formatMoney(totals.averageTicket)}`}
                    delta={canCompare ? getDelta(totals.averageTicket, previous.averageTicket) : null}
                />
                <StatTile
                    label="Salidas de efectivo"
                    value={`B/. ${formatMoney(report.outflows.total)}`}
                    detail={`${report.outflows.count} ${report.outflows.count === 1 ? "salida" : "salidas"} del cajón y del fondo aparte`}
                />
                <StatTile
                    label="Venta menos salidas"
                    value={`B/. ${formatMoney(net)}`}
                    isAlert={net < 0}
                    detail="un depósito al banco anotado como salida también resta aquí"
                />
                <StatTile
                    label="Créditos por cobrar"
                    value={`B/. ${formatMoney(report.credits.total)}`}
                    isAlert={report.credits.count > 0}
                    detail={
                        report.credits.count === 0
                            ? "nadie debe nada"
                            : `${report.credits.count} ${report.credits.count === 1 ? "cuenta" : "cuentas"}${
                                  report.credits.oldestAt ? ` · la más vieja, ${formatAgeInDays(report.credits.oldestAt)}` : ""
                              }`
                    }
                />
            </div>

            <div className="adm-fin-grid">
                <div className="adm-card">
                    <h3 className="script">Venta por {range.granularity === "day" ? "día" : "semana"}</h3>
                    <p className="adm-note">
                        {range.granularity === "day"
                            ? "Balboas por día. Un día cerrado corta la línea."
                            : "Balboas por semana, contadas desde el primer día del período."}
                    </p>
                    <div className="adm-legend">
                        <span><i className="is-local" />Mostrador</span>
                        <span><i className="is-web" />Web</span>
                    </div>
                    <SalesChart points={report.series} granularity={range.granularity} />
                </div>

                <PaymentsCard report={report} />
                <PatternsCard report={report} />
                <TopProductsCard report={report} />
                <OutflowsCard report={report} />
            </div>
        </>
    );
};

/* ============ Tarjetas ============ */

const PaymentsCard = ({ report }: { report: IFinanceReport }) => {
    const { payments } = report;
    const rows = [
        { key: "cash", label: "Efectivo", value: payments.cash },
        { key: "card", label: "Tarjeta", value: payments.card },
        { key: "yappy", label: "Yappy en el local", value: payments.yappy },
        { key: "web", label: "Yappy web", value: Math.max(0, payments.web) },
    ];
    const sum = rows.reduce((total, row) => total + row.value, 0);

    return (
        <div className="adm-card">
            <h3 className="script">Cómo pagaron</h3>
            <p className="adm-note">El local, según los cierres de turno; la web siempre es Yappy.</p>

            {sum === 0 ? (
                <p className="adm-empty">Sin cobros registrados en este período.</p>
            ) : (
                <>
                    <div className="adm-stack" aria-hidden="true">
                        {rows.map((row) =>
                            row.value > 0 ? <i key={row.key} className={`is-${row.key}`} style={{ width: `${(row.value / sum) * 100}%` }} /> : null
                        )}
                    </div>
                    <div className="adm-pay">
                        {rows.map((row) => (
                            <div className="adm-pay__row" key={row.key}>
                                <i className={`adm-pay__sw is-${row.key}`} aria-hidden="true" />
                                <span>{row.label}</span>
                                <b>B/. {formatMoney(row.value)}</b>
                                <em>{Math.round((row.value / sum) * 100)} %</em>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {payments.shifts === 0 ? (
                <p className="adm-callout">Ningún turno cerró en este período: lo cobrado en el local todavía no tiene desglose.</p>
            ) : payments.shiftsWithoutBreakdown > 0 ? (
                <p className="adm-callout">
                    {payments.shiftsWithoutBreakdown} de {payments.shifts} turnos cerraron antes de que existiera el desglose por
                    método: lo que cobraron no aparece aquí.
                </p>
            ) : null}
        </div>
    );
};

const PatternsCard = ({ report }: { report: IFinanceReport }) => {
    const weekdays = WEEKDAY_ORDER.map((weekday) => report.weekdays[weekday]);
    const bestAverage = Math.max(0, ...weekdays.map((entry) => entry.average));
    const openWeekdays = weekdays.filter((entry) => entry.openDays > 0);
    const slowestWeekday = openWeekdays.length > 1 ? [...openWeekdays].sort((a, b) => a.average - b.average)[0] : null;

    // Solo las horas en que se vendió algo, más una de margen: el local no abre de madrugada
    const activeHours = report.hours.filter((entry) => entry.tickets > 0).map((entry) => entry.hour);
    const firstHour = activeHours.length ? Math.max(0, Math.min(...activeHours)) : 8;
    const lastHour = activeHours.length ? Math.min(23, Math.max(...activeHours)) : 21;
    const hours = report.hours.slice(firstHour, lastHour + 1);
    const busiest = Math.max(1, ...hours.map((entry) => entry.tickets));
    const peak = hours.reduce((best, entry) => (entry.tickets > best.tickets ? entry : best), hours[0]);

    if (report.totals.tickets === 0) {
        return (
            <div className="adm-card">
                <h3 className="script">Cuándo se vende</h3>
                <p className="adm-empty">Sin ventas en este período.</p>
            </div>
        );
    }

    return (
        <div className="adm-card">
            <h3 className="script">Cuándo se vende</h3>
            <p className="adm-note">Venta promedio de cada día de la semana que abrió, y tickets por hora.</p>

            <div className="adm-week">
                {weekdays.map((entry) => (
                    <div className="adm-week__day" key={entry.weekday}>
                        <span className="adm-week__val">{entry.openDays > 0 ? Math.round(entry.average) : "—"}</span>
                        <span className="adm-week__track">
                            <i
                                className={entry.average === bestAverage && bestAverage > 0 ? "is-best" : undefined}
                                style={{ height: `${bestAverage > 0 ? Math.max(3, (entry.average / bestAverage) * 100) : 3}%` }}
                            />
                        </span>
                        <span className="adm-week__lab">{WEEKDAY_LABEL[entry.weekday]}</span>
                    </div>
                ))}
            </div>

            <div className="adm-hours" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}>
                {hours.map((entry) => (
                    <span key={entry.hour} className="adm-hours__cell">
                        <i
                            title={`${formatHour(entry.hour)} · ${entry.tickets} tickets · B/. ${formatMoney(entry.total)}`}
                            style={{ opacity: entry.tickets > 0 ? 0.15 + (entry.tickets / busiest) * 0.85 : 0.06 }}
                        />
                        <small>{entry.hour % 2 === 0 ? formatHourTick(entry.hour) : ""}</small>
                    </span>
                ))}
            </div>

            <div className="adm-facts">
                {report.bestDay ? (
                    <span>
                        Mejor día: <b>{formatDayLabel(report.bestDay.date)} · B/. {formatMoney(report.bestDay.total)}</b>
                    </span>
                ) : null}
                {peak && peak.tickets > 0 ? (
                    <span>
                        Hora pico: <b>{formatHour(peak.hour)} – {formatHour((peak.hour + 1) % 24)}</b>
                    </span>
                ) : null}
                {slowestWeekday ? (
                    <span>
                        Día más flojo: <b>{WEEKDAY_NAME[slowestWeekday.weekday]}</b>
                    </span>
                ) : null}
            </div>
        </div>
    );
};

const TopProductsCard = ({ report }: { report: IFinanceReport }) => {
    const products = report.topProducts;

    return (
        <div className="adm-card">
            <h3 className="script">Lo que más se vende</h3>
            <p className="adm-note">Unidades de los dos canales · sale de Loyverse, que guarda 31 días.</p>

            {report.topProductsNote === "fuera-de-rango" ? (
                <p className="adm-empty">
                    Loyverse solo deja leer el detalle por producto de los últimos 31 días. Elige 7 o 30 días, o este mes.
                </p>
            ) : report.topProductsNote === "sin-conexion" ? (
                <p className="adm-empty">Loyverse no respondió en esta carga: el resto de las cifras sigue al día.</p>
            ) : products && products.length > 0 ? (
                <div className="adm-bars">
                    {products.map((product) => {
                        const top = products[0].units || 1;
                        return (
                            <div className="adm-bar" key={product.name}>
                                <div className="adm-bar__top">
                                    <span>{product.name}</span>
                                    <span className="adm-bar__val">{product.units} <em>· {product.webShare} % web</em></span>
                                </div>
                                <div className="adm-bar__track" style={{ width: `${(product.units / top) * 100}%` }}>
                                    <i className="is-local" style={{ width: `${100 - product.webShare}%` }} />
                                    <i className="is-web" style={{ width: `${product.webShare}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="adm-empty">Todavía no hay ventas en este período.</p>
            )}
        </div>
    );
};

const OutflowsCard = ({ report }: { report: IFinanceReport }) => (
    <div className="adm-card">
        <h3 className="script">Salidas de efectivo</h3>
        <p className="adm-note">Del cajón y del fondo aparte, agrupadas por el motivo que se anotó.</p>

        {report.outflows.reasons.length === 0 ? (
            <p className="adm-empty">No salió efectivo en este período.</p>
        ) : (
            <div className="adm-outflows">
                {report.outflows.reasons.map((entry) => (
                    <div className="adm-outflows__row" key={entry.reason}>
                        <span>
                            {entry.reason}
                            {entry.count > 1 ? <em> · {entry.count} veces</em> : null}
                        </span>
                        <b>− B/. {formatMoney(entry.total)}</b>
                    </div>
                ))}
            </div>
        )}
    </div>
);
