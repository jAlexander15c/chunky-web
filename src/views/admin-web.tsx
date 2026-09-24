import { useCallback, useEffect, useMemo, useState } from "react";

import { StatTile } from "./admin-finance";
import {
    FINANCE_PERIODS,
    HttpError,
    fetchWebReport,
    formatDayLabel,
    formatHour,
    formatRange,
    formatShortDate,
    getDelta,
    getPeriodRange,
} from "@/helpers";
import type { FinancePeriod, IWebPoint, IWebReport, WebFunnelStep } from "@/helpers";

const REFRESH_MS = 60000;
const PERIOD_STORAGE_KEY = "chunky-admin-web-period";
const DEFAULT_PERIOD: FinancePeriod = "30d";

const FUNNEL_LABEL: Record<WebFunnelStep, string> = {
    visit: "Visitaron",
    category_open: "Abrieron una categoría",
    add_to_cart: "Agregaron al carrito",
    cart_open: "Abrieron el carrito",
    checkout_start: "Empezaron el checkout",
    pay_click: "Tocaron pagar",
    paid: "Pagaron",
};

const PAGE_LABEL: Record<string, string> = {
    "/": "Inicio",
    "/menu": "Menú",
    "/items": "Productos",
    "/cotizador": "Cotizador",
    "/pedido": "Estado del pedido",
};

/** Por debajo de esto un % de producto no dice nada: una apertura y un agregado dan 100 %. */
const MIN_OPENS_FOR_RATE = 5;

const formatCount = (value: number) => value.toLocaleString("es-PA");

const formatPercent = (ratio: number) =>
    `${(ratio * 100).toLocaleString("es-PA", { maximumFractionDigits: 1 })} %`;

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

/* ============ Gráfico de visitas ============ */

// Más angosto que el de finanzas: comparte fila con el embudo y el texto no debe achicarse tanto
const VISITS_CHART = { width: 520, height: 240, left: 34, right: 30, top: 12, bottom: 28 };
const CHART_LABELS = 5;

/** Sesiones y carritos en línea, pedidos pagados en barras. Los tres son conteos: mismo eje. */
const VisitsChart = ({ points, granularity }: { points: IWebPoint[]; granularity: "day" | "week" }) => {
    const chart = useMemo(() => {
        const highest = Math.max(4, ...points.map((point) => point.sessions));
        const step = Math.max(1, Math.ceil(highest / 4));
        const top = step * 4;
        const plotWidth = VISITS_CHART.width - VISITS_CHART.left - VISITS_CHART.right;

        const getX = (index: number) => VISITS_CHART.left + (index * plotWidth) / Math.max(1, points.length - 1);
        const getY = (value: number) =>
            VISITS_CHART.top + (1 - value / top) * (VISITS_CHART.height - VISITS_CHART.top - VISITS_CHART.bottom);

        const buildPath = (key: "sessions" | "carts") =>
            points.map((point, index) => `${index ? "L" : "M"}${getX(index).toFixed(1)},${getY(point[key]).toFixed(1)}`).join(" ");

        const barWidth = Math.max(3, Math.min(18, (plotWidth / Math.max(1, points.length)) * 0.5));
        const lastIndex = points.length - 1;
        const labelStep = Math.max(1, Math.ceil(points.length / CHART_LABELS));

        return {
            sessions: buildPath("sessions"),
            carts: buildPath("carts"),
            area: points.length
                ? `M${getX(0)},${getY(0)} ${points.map((point, index) => `L${getX(index).toFixed(1)},${getY(point.sessions).toFixed(1)}`).join(" ")} L${getX(lastIndex)},${getY(0)}Z`
                : "",
            bars: points
                .map((point, index) => ({ index, x: getX(index) - barWidth / 2, y: getY(point.paidOrders), height: getY(0) - getY(point.paidOrders) }))
                .filter((bar) => bar.height > 0),
            barWidth,
            mark: lastIndex >= 0 ? { x: getX(lastIndex), y: getY(points[lastIndex].sessions), value: points[lastIndex].sessions } : null,
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
            viewBox={`0 0 ${VISITS_CHART.width} ${VISITS_CHART.height}`}
            role="img"
            aria-label={`Sesiones, carritos y pedidos pagados por ${granularity === "day" ? "día" : "semana"}`}
        >
            {chart.gridLines.map((line) => (
                <g key={line.value}>
                    <line x1={VISITS_CHART.left} y1={line.y} x2={VISITS_CHART.width - VISITS_CHART.right} y2={line.y} className="adm-chart__grid" />
                    <text x={VISITS_CHART.left - 9} y={line.y + 4} textAnchor="end" className="adm-chart__axis">{line.value}</text>
                </g>
            ))}

            <path d={chart.area} className="adm-chart__area" />
            {chart.bars.map((bar) => (
                <rect key={bar.index} x={bar.x} y={bar.y} width={chart.barWidth} height={bar.height} rx={2} className="adm-chart__bar is-paid" />
            ))}
            <path d={chart.sessions} className="adm-chart__line is-local" />
            <path d={chart.carts} className="adm-chart__line is-web adm-chart__line--thin" />

            {chart.mark ? (
                <g>
                    <circle cx={chart.mark.x} cy={chart.mark.y} r={5} className="adm-chart__dot is-local" />
                    <text x={chart.mark.x + 10} y={chart.mark.y + 4} className="adm-chart__mark is-local">{chart.mark.value}</text>
                </g>
            ) : null}

            {chart.labels.map((entry) => (
                <text key={entry.index} x={entry.x} y={VISITS_CHART.height - 10} textAnchor="middle" className="adm-chart__axis">
                    {entry.label}
                </text>
            ))}
        </svg>
    );
};

/* ============ Sección Web ============ */

interface IAdminWebProps {
    token: string;
    onSessionExpired: () => void;
    refreshKey: number;
}

export const AdminWeb = ({ token, onSessionExpired, refreshKey }: IAdminWebProps) => {
    const [period, setPeriod] = useState<FinancePeriod>(readStoredPeriod);
    const [report, setReport] = useState<IWebReport | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const { from, to } = getPeriodRange(period);

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

    const changePeriod = (next: FinancePeriod) => {
        setPeriod(next);
        storePeriod(next);
    };

    const isStale = isLoading && report !== null;

    return (
        <section className="adm-band" aria-busy={isLoading}>
            <div className="adm-band__head">
                <h2 className="script">La web</h2>
                <span className="adm-band__sub">Qué hace la gente antes de pagar · sesiones = pestañas distintas</span>
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
                isLoading ? <p className="adm-empty">Cargando las estadísticas de la web…</p> : null
            ) : (
                <div className={isStale ? "adm-fin is-stale" : "adm-fin"}>
                    <WebBody report={report} />
                </div>
            )}
        </section>
    );
};

const WebBody = ({ report }: { report: IWebReport }) => {
    const { totals, previous, range, dataSince } = report;

    if (dataSince === null) {
        return (
            <p className="adm-warning">
                Todavía no hay visitas medidas. La web empieza a contar sola en cuanto un cliente la abre: vuelve en unos días.
            </p>
        );
    }

    const canCompare = dataSince <= range.previousFrom;
    const topAdded = report.topProducts.find((product) => product.adds > 0) ?? null;

    return (
        <>
            {dataSince > range.from ? (
                <p className="adm-warning">
                    Empezamos a medir el {formatShortDate(dataSince, true)}: este período sale incompleto y no se compara.
                </p>
            ) : !canCompare ? (
                <p className="adm-warning">
                    Empezamos a medir el {formatShortDate(dataSince, true)}: el período anterior sale incompleto, así que no se compara.
                </p>
            ) : null}

            <div className="adm-tiles adm-tiles--web">
                <StatTile
                    label="Visitas"
                    value={formatCount(totals.sessions)}
                    delta={canCompare ? getDelta(totals.sessions, previous.sessions) : null}
                    detail="sesiones que abrieron la web"
                />
                <StatTile
                    label="Conversión"
                    value={formatPercent(totals.conversion)}
                    detail={`${formatCount(totals.paidOrders)} ${totals.paidOrders === 1 ? "pedido pagado" : "pedidos pagados"} por la web${
                        canCompare && previous.sessions > 0 ? ` · antes ${formatPercent(previous.conversion)}` : ""
                    }`}
                />
                <StatTile
                    label="Checkouts sin pagar"
                    value={formatCount(totals.abandonedCheckouts)}
                    isAlert={totals.abandonedCheckouts > 0}
                    detail="llenaron sus datos y no tocaron Yappy"
                />
                <StatTile
                    label="Lo más agregado"
                    value={topAdded ? topAdded.name : "—"}
                    detail={topAdded ? `${formatCount(topAdded.adds)} ${topAdded.adds === 1 ? "vez" : "veces"} al carrito` : "nadie agregó nada todavía"}
                />
            </div>

            <div className="adm-web-grid">
                <FunnelCard report={report} />

                <div className="adm-card">
                    <h3 className="script">Visitas por {range.granularity === "day" ? "día" : "semana"}</h3>
                    <p className="adm-note">
                        {range.granularity === "day"
                            ? "Sesiones, sesiones con algo en el carrito y pedidos pagados. Mismo eje."
                            : "Por semana, contadas desde el primer día del período. Mismo eje."}
                    </p>
                    <div className="adm-legend">
                        <span><i className="is-local" />Sesiones</span>
                        <span><i className="is-web" />Con carrito</span>
                        <span><i className="is-paid" />Pagados</span>
                    </div>
                    <VisitsChart points={report.series} granularity={range.granularity} />
                </div>

                <ProductsCard report={report} />
                <CategoriesCard report={report} />
                <HoursCard report={report} />
                <ButtonsCard report={report} />
            </div>
        </>
    );
};

/* ============ Tarjetas ============ */

const FunnelCard = ({ report }: { report: IWebReport }) => {
    const { funnel } = report;
    const first = funnel[0]?.sessions ?? 0;

    // El paso que más gente pierde. "Pagaron" no cuenta: el pago lo decide Yappy, no la web.
    const leak = funnel.reduce<{ index: number; rate: number } | null>((worst, step, index) => {
        if (index === 0 || index === funnel.length - 1) return worst;
        const before = funnel[index - 1].sessions;
        if (before === 0) return worst;
        const rate = step.sessions / before;
        return worst === null || rate < worst.rate ? { index, rate } : worst;
    }, null);

    return (
        <div className="adm-card">
            <h3 className="script">Embudo de compra</h3>
            <p className="adm-note">Sesiones que llegaron a cada paso. El % es contra el paso anterior.</p>

            {first === 0 ? (
                <p className="adm-empty">Nadie abrió la web en este período.</p>
            ) : (
                <>
                    <div className="adm-funnel">
                        {funnel.map((step, index) => {
                            const before = index > 0 ? funnel[index - 1].sessions : 0;
                            const className = `adm-funnel__step${step.step === "paid" ? " is-paid" : ""}${leak?.index === index ? " is-leak" : ""}`;
                            return (
                                <div className={className} key={step.step}>
                                    <span className="adm-funnel__name">{FUNNEL_LABEL[step.step]}</span>
                                    <span className="adm-funnel__track">
                                        <i style={{ width: `${Math.min(100, (step.sessions / first) * 100)}%` }}>{formatCount(step.sessions)}</i>
                                    </span>
                                    <span className="adm-funnel__rate">
                                        {index > 0 && before > 0 ? `${Math.round(Math.min(1, step.sessions / before) * 100)} %` : ""}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {leak ? (
                        <p className="adm-callout adm-callout--warn">
                            Donde más se pierde: <b>{FUNNEL_LABEL[funnel[leak.index - 1].step].toLowerCase()} → {FUNNEL_LABEL[funnel[leak.index].step].toLowerCase()}</b>,
                            solo sigue el {Math.round(leak.rate * 100)} %.
                        </p>
                    ) : null}
                </>
            )}
        </div>
    );
};

const ProductsCard = ({ report }: { report: IWebReport }) => {
    const products = report.topProducts;
    const topAdds = Math.max(1, ...products.map((product) => product.adds));

    return (
        <div className="adm-card adm-web-grid__wide">
            <h3 className="script">Productos</h3>
            <p className="adm-note">Las aperturas solo cuentan en productos con opciones: los demás se agregan directo.</p>

            {products.length === 0 ? (
                <p className="adm-empty">Nadie abrió ni agregó productos en este período.</p>
            ) : (
                <div className="adm-scroll">
                    <table className="adm-web-table">
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th className="is-num">Aperturas</th>
                                <th className="is-num">Al carrito</th>
                                <th className="is-num">Agregado / abierto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map((product) => {
                                const rate = product.opens >= MIN_OPENS_FOR_RATE ? Math.min(1, product.adds / product.opens) : null;
                                return (
                                    <tr key={product.id}>
                                        <td>
                                            {product.name}
                                            <span className="adm-web-table__bar" aria-hidden="true">
                                                <i style={{ width: `${(product.adds / topAdds) * 100}%` }} />
                                            </span>
                                        </td>
                                        <td className="is-num">{product.opens > 0 ? formatCount(product.opens) : "—"}</td>
                                        <td className="is-num"><b>{formatCount(product.adds)}</b></td>
                                        <td className="is-num">
                                            {product.opens === 0 ? (
                                                <span className="adm-web-table__muted">directo</span>
                                            ) : rate === null ? (
                                                <span className="adm-web-table__muted">pocas aperturas</span>
                                            ) : (
                                                <span className={`adm-pill ${rate >= 0.5 ? "is-ok" : "is-warn"}`}>{Math.round(rate * 100)} %</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const CategoriesCard = ({ report }: { report: IWebReport }) => {
    const categories = report.topCategories;
    const top = categories[0]?.opens || 1;

    return (
        <div className="adm-card">
            <h3 className="script">Categorías más abiertas</h3>
            <p className="adm-note">Desde el menú, el inicio o un enlace guardado.</p>

            {categories.length === 0 ? (
                <p className="adm-empty">Nadie abrió una categoría en este período.</p>
            ) : (
                <div className="adm-bars">
                    {categories.map((category) => (
                        <div className="adm-bar" key={category.id}>
                            <div className="adm-bar__top">
                                <span>{category.name}</span>
                                <span className="adm-bar__val">{formatCount(category.opens)}</span>
                            </div>
                            <div className="adm-bar__track" style={{ width: `${(category.opens / top) * 100}%` }}>
                                <i className="is-local" style={{ width: "100%" }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const HOURS_CHART = { width: 520, height: 170, left: 30, right: 6, top: 8, bottom: 22 };

const HoursCard = ({ report }: { report: IWebReport }) => {
    const chart = useMemo(() => {
        const highest = Math.max(4, ...report.hours.map((entry) => entry.sessions));
        const step = Math.max(1, Math.ceil(highest / 4));
        const top = step * 4;
        const plotHeight = HOURS_CHART.height - HOURS_CHART.top - HOURS_CHART.bottom;
        const slot = (HOURS_CHART.width - HOURS_CHART.left - HOURS_CHART.right) / 24;
        const getY = (value: number) => HOURS_CHART.top + (1 - value / top) * plotHeight;
        const peak = report.hours.reduce((best, entry) => (entry.sessions > best.sessions ? entry : best), report.hours[0]);

        return {
            peak,
            gridLines: Array.from({ length: 5 }, (_, index) => ({ value: index * step, y: getY(index * step) })),
            bars: report.hours.map((entry) => ({
                hour: entry.hour,
                sessions: entry.sessions,
                x: HOURS_CHART.left + entry.hour * slot + 2,
                y: getY(entry.sessions),
                width: slot - 4,
                height: HOURS_CHART.top + plotHeight - getY(entry.sessions),
                center: HOURS_CHART.left + entry.hour * slot + slot / 2,
            })),
        };
    }, [report.hours]);

    return (
        <div className="adm-card">
            <h3 className="script">A qué hora entran</h3>
            <p className="adm-note">Sesiones por la hora en que empezaron, en hora de Panamá.</p>

            <svg className="adm-chart" viewBox={`0 0 ${HOURS_CHART.width} ${HOURS_CHART.height}`} role="img" aria-label="Sesiones por hora del día">
                {chart.gridLines.map((line) => (
                    <g key={line.value}>
                        <line x1={HOURS_CHART.left} y1={line.y} x2={HOURS_CHART.width - HOURS_CHART.right} y2={line.y} className="adm-chart__grid" />
                        <text x={HOURS_CHART.left - 6} y={line.y + 4} textAnchor="end" className="adm-chart__axis">{line.value}</text>
                    </g>
                ))}
                {chart.bars.map((bar) => (
                    <g key={bar.hour}>
                        {bar.height > 0 ? (
                            <rect
                                x={bar.x}
                                y={bar.y}
                                width={bar.width}
                                height={bar.height}
                                rx={3}
                                className={`adm-chart__bar ${chart.peak.sessions > 0 && bar.hour === chart.peak.hour ? "is-web" : "is-local"}`}
                            >
                                <title>{`${formatHour(bar.hour)} · ${bar.sessions} sesiones`}</title>
                            </rect>
                        ) : null}
                        {bar.hour % 3 === 0 ? (
                            <text x={bar.center} y={HOURS_CHART.height - 6} textAnchor="middle" className="adm-chart__axis">{`${bar.hour}h`}</text>
                        ) : null}
                    </g>
                ))}
            </svg>

            {chart.peak.sessions > 0 ? (
                <div className="adm-facts">
                    <span>
                        Hora pico: <b>{formatHour(chart.peak.hour)} – {formatHour((chart.peak.hour + 1) % 24)}</b>
                    </span>
                </div>
            ) : null}
        </div>
    );
};

const ButtonsCard = ({ report }: { report: IWebReport }) => {
    const { buttons, pages } = report;
    const totalViews = pages.reduce((total, page) => total + page.views, 0);
    const topPages = pages.slice(0, 2).map((page) => `${totalViews > 0 ? Math.round((page.views / totalViews) * 100) : 0} % ${(PAGE_LABEL[page.path] ?? page.path).toLowerCase()}`);

    return (
        <div className="adm-card adm-web-grid__wide">
            <h3 className="script">Otros botones</h3>
            <p className="adm-note">Fuera del embudo, pero dicen qué más busca la gente.</p>

            <div className="adm-web-buttons">
                <div>
                    <b>{formatCount(buttons.whatsapp)}</b>
                    <span>abrieron WhatsApp</span>
                </div>
                <div>
                    <b>{formatCount(buttons.quotes)}</b>
                    <span>cotizaciones de cake enviadas</span>
                </div>
                <div>
                    <b>{formatCount(buttons.pastaOpens)} → {formatCount(buttons.pastaAdds)}</b>
                    <span>armador de pasta abierto → pasta agregada</span>
                </div>
                <div>
                    <b>{formatCount(totalViews)}</b>
                    <span>páginas vistas{topPages.length ? ` · ${topPages.join(", ")}` : ""}</span>
                </div>
            </div>
        </div>
    );
};
