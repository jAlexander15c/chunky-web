import { useCallback, useEffect, useMemo, useState } from "react";

import { StatTile } from "./admin-finance";
import {
    FINANCE_PERIODS,
    HttpError,
    fetchWebReport,
    formatDayLabel,
    formatHour,
    formatRange,
    formatPrice,
    formatShortDate,
    getDelta,
    getPeriodRange,
} from "@/helpers";
import type {
    CakeQuoteStep,
    FinancePeriod,
    IQuoteWebReport,
    IWebPoint,
    IWebReport,
    IWebSource,
    QuoteFunnelStep,
    QuoteReportKind,
    WebFunnelStep,
} from "@/helpers";

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

const QUOTE_KIND_OPTIONS: { id: QuoteReportKind; label: string }[] = [
    { id: "all", label: "Todo" },
    { id: "cake", label: "Cakes" },
    { id: "postre", label: "Flan y cheesecake" },
];

const QUOTE_STEP_LABEL: Record<QuoteFunnelStep, string> = {
    visit: "Entró al cotizador",
    start: "Empezó a armar",
    photo: "Subió fotos",
    contact: "Escribió sus datos",
    submit: "Envió",
    whatsapp: "Abrió WhatsApp",
};

const CAKE_STEP_LABEL: Record<CakeQuoteStep, string> = {
    tamano: "Tamaño y altura",
    masa: "Masa",
    rellenos: "Rellenos",
    fotos: "Fotos y topper",
    datos: "Tus datos",
};

/** Aclaración bajo el nombre del paso, según lo que se está viendo. */
const getQuoteStepHint = (step: QuoteFunnelStep, kind: QuoteReportKind) => {
    if (step === "whatsapp") return "después de enviar";
    if (step === "photo") return kind === "postre" ? "no aplica" : kind === "all" ? "solo cakes" : "";
    if (kind === "all") return "";
    if (step === "visit") return "todavía sin elegir";
    if (step === "start") return kind === "cake" ? "eligió un cake" : "eligió un postre";
    return "";
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
/** Con menos visitas la conversión de un origen no dice nada. */
const MIN_SESSIONS_FOR_RATE = 10;
/** Desde aquí la conversión de un origen sale en verde. */
const GOOD_SOURCE_CONVERSION = 0.05;

/** Nombres de los orígenes que la web reconoce; el resto se muestra con su dominio. */
const SOURCE_LABEL: Record<string, string> = {
    instagram: "Instagram",
    facebook: "Facebook",
    whatsapp: "WhatsApp",
    google: "Google",
    pedidosya: "PedidosYa",
    tiktok: "TikTok",
    directo: "Directo",
};

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

                {report.sources ? <SourcesCard sources={report.sources} /> : null}

                <QuoteFunnelCard quotes={report.quotes} />
                <QuoteTopCard quotes={report.quotes} />
                <QuoteDropOffCard quotes={report.quotes} />

                <ProductsCard report={report} />
                <CategoriesCard report={report} />
                <HoursCard report={report} />
                <ButtonsCard report={report} />
            </div>
        </>
    );
};

/* ============ Tarjetas ============ */

const SourcesCard = ({ sources }: { sources: IWebSource[] }) => {
    // Lo de antes de medir el origen va al final, aunque tenga más visitas
    const measured = sources.filter((entry) => entry.source !== null);
    const unmeasured = sources.find((entry) => entry.source === null) ?? null;
    const topSessions = Math.max(1, ...measured.map((entry) => entry.sessions));

    return (
        <div className="adm-card adm-web-grid__wide">
            <h3 className="script">De dónde llegan</h3>
            <p className="adm-note">Cada visita cuenta en el origen con que abrió la web: el enlace con utm, la página anterior o la app de Instagram.</p>

            {sources.length === 0 ? (
                <p className="adm-empty">No hubo visitas en este período.</p>
            ) : (
                <>
                    <div className="adm-scroll">
                        <table className="adm-web-table adm-web-sources">
                            <thead>
                                <tr>
                                    <th>Origen</th>
                                    <th className="is-num">Visitas</th>
                                    <th className="is-num">Con carrito</th>
                                    <th className="is-num">Pagados</th>
                                    <th className="is-num">Conversión</th>
                                    <th className="is-num">Cotizaciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {measured.map((entry) => {
                                    const conversion = entry.sessions >= MIN_SESSIONS_FOR_RATE ? Math.min(1, entry.paidOrders / entry.sessions) : null;
                                    const hasMediums = entry.mediums.some((item) => item.medium !== null);
                                    return (
                                        <tr key={entry.source}>
                                            <td>
                                                {SOURCE_LABEL[entry.source ?? ""] ?? entry.source}
                                                <span className="adm-web-table__bar" aria-hidden="true">
                                                    <i style={{ width: `${(entry.sessions / topSessions) * 100}%` }} />
                                                </span>
                                                {hasMediums ? (
                                                    <span className="adm-web-sources__mediums">
                                                        {entry.mediums.map((item) => (
                                                            <span key={item.medium ?? "sin-marca"}>
                                                                {item.medium ?? "sin marca"} <b>{formatCount(item.sessions)}</b>
                                                            </span>
                                                        ))}
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="is-num"><b>{formatCount(entry.sessions)}</b></td>
                                            <td className="is-num">{formatCount(entry.carts)}</td>
                                            <td className="is-num">{formatCount(entry.paidOrders)}</td>
                                            <td className="is-num">
                                                {conversion === null ? (
                                                    <span className="adm-web-table__muted">pocas visitas</span>
                                                ) : (
                                                    <span className={`adm-pill ${conversion >= GOOD_SOURCE_CONVERSION ? "is-ok" : "is-warn"}`}>
                                                        {formatPercent(conversion)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="is-num">{formatCount(entry.quotes)}</td>
                                        </tr>
                                    );
                                })}
                                {unmeasured ? (
                                    <tr>
                                        <td className="adm-web-table__muted">Antes de medir el origen</td>
                                        <td className="is-num"><b>{formatCount(unmeasured.sessions)}</b></td>
                                        <td className="is-num">{formatCount(unmeasured.carts)}</td>
                                        <td className="is-num">{formatCount(unmeasured.paidOrders)}</td>
                                        <td className="is-num"><span className="adm-web-table__muted">—</span></td>
                                        <td className="is-num">{formatCount(unmeasured.quotes)}</td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                    <p className="adm-web-sources__legend">
                        <span><b>Directo</b>: escribieron la dirección, un enlace guardado o una app que no dice de dónde viene.</span>
                        <span><b>Sin marca</b>: llegaron por un enlace sin utm (un post, un DM).</span>
                    </p>
                </>
            )}
        </div>
    );
};

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

const QuoteFunnelCard = ({ quotes }: { quotes: IQuoteWebReport }) => {
    const [kind, setKind] = useState<QuoteReportKind>("all");
    const funnel = quotes.funnel[kind];
    const sent = quotes.sent[kind];
    const first = funnel[0]?.sessions ?? 0;

    // Cada paso contra el anterior que existe: en postres no hay fotos
    const rows = funnel.map((step, index) => {
        const before = funnel.slice(0, index).reverse().find((one) => one.sessions !== null) ?? null;
        const rate = step.sessions !== null && before?.sessions ? Math.min(1, step.sessions / before.sessions) : null;
        return { ...step, before, rate };
    });

    // WhatsApp no cuenta como fuga. Al ver un solo tipo, "entró → armó" tampoco: eligieron el otro.
    const firstLeak = kind === "all" ? 1 : 2;
    const leak = rows.reduce<(typeof rows)[number] | null>(
        (worst, row, index) =>
            index >= firstLeak && index < rows.length - 1 && row.rate !== null && (worst === null || row.rate < (worst.rate ?? 1)) ? row : worst,
        null
    );

    const submitted = funnel.find((step) => step.step === "submit")?.sessions ?? 0;
    const started = funnel.find((step) => step.step === "start")?.sessions ?? 0;
    const base = kind === "all" ? first : started;
    const topOfKind = quotes.top.find((one) => one.kind === kind) ?? null;

    return (
        <div className="adm-card adm-web-grid__wide">
            <div className="adm-card-head">
                <div className="grow">
                    <h3 className="script">Cotizador</h3>
                    <p className="adm-note">Sesiones que llegaron a cada paso. El % es contra el paso anterior.</p>
                </div>
                <div className="adm-chips" role="group" aria-label="Qué cotizaron">
                    {QUOTE_KIND_OPTIONS.map((option) => (
                        <button type="button" key={option.id} className="adm-chip" aria-pressed={kind === option.id} onClick={() => setKind(option.id)}>
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {first === 0 ? (
                <p className="adm-empty">Nadie abrió el cotizador en este período.</p>
            ) : (
                <>
                    <div className="adm-funnel">
                        {rows.map((row) => {
                            const isMissing = row.sessions === null;
                            const className = `adm-funnel__step${row.step === "submit" ? " is-paid" : ""}${isMissing ? " is-na" : ""}${leak === row ? " is-leak" : ""}`;
                            return (
                                <div className={className} key={row.step}>
                                    <span className="adm-funnel__name">
                                        {QUOTE_STEP_LABEL[row.step]}
                                        {getQuoteStepHint(row.step, kind) ? <small>{getQuoteStepHint(row.step, kind)}</small> : null}
                                    </span>
                                    <span className="adm-funnel__track">
                                        <i style={{ width: isMissing ? "100%" : `${Math.min(100, ((row.sessions ?? 0) / first) * 100)}%` }}>
                                            {isMissing ? "—" : formatCount(row.sessions ?? 0)}
                                        </i>
                                    </span>
                                    <span className="adm-funnel__rate">{row.rate === null ? "" : `${Math.round(row.rate * 100)} %`}</span>
                                </div>
                            );
                        })}
                    </div>
                    {leak?.before && leak.rate !== null ? (
                        <p className="adm-callout adm-callout--warn">
                            Donde más se pierde: <b>{QUOTE_STEP_LABEL[leak.before.step].toLowerCase()} → {QUOTE_STEP_LABEL[leak.step].toLowerCase()}</b>,
                            solo sigue el {Math.round(leak.rate * 100)} %.
                        </p>
                    ) : null}
                </>
            )}

            <div className="adm-web-buttons adm-quote-facts">
                <div>
                    <b>{formatCount(sent.count)}</b>
                    <span>{kind === "cake" ? "cakes enviados" : kind === "postre" ? "postres enviados" : "cotizaciones enviadas"}</span>
                </div>
                <div>
                    <b>{base > 0 ? `${Math.round(Math.min(1, submitted / base) * 100)} %` : "—"}</b>
                    <span>{kind === "all" ? "de los que entran envían" : "de los que arman envían"}</span>
                </div>
                <div>
                    <b>{sent.averageTotal === null ? "—" : formatPrice(sent.averageTotal)}</b>
                    <span>total estimado promedio</span>
                </div>
                {kind === "all" ? (
                    <div>
                        <b>{formatCount(quotes.sent.cake.count)} · {formatCount(quotes.sent.postre.count)}</b>
                        <span>cakes · flan y cheesecake enviados</span>
                    </div>
                ) : (
                    <div>
                        <b>{topOfKind ? topOfKind.name : "—"}</b>
                        <span>el más cotizado</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const QuoteTopCard = ({ quotes }: { quotes: IQuoteWebReport }) => {
    const top = quotes.top;
    const highest = Math.max(1, ...top.map((one) => one.count));

    return (
        <div className="adm-card">
            <h3 className="script">Lo que más cotizan</h3>
            <p className="adm-note">Cotizaciones enviadas en el período, por tamaño o postre.</p>

            {top.length === 0 ? (
                <p className="adm-empty">Nadie envió una cotización en este período.</p>
            ) : (
                <div className="adm-scroll">
                    <table className="adm-web-table">
                        <thead>
                            <tr>
                                <th>Qué</th>
                                <th className="is-num">Enviadas</th>
                                <th className="is-num">Total est.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {top.map((one) => (
                                <tr key={`${one.kind}-${one.name}`}>
                                    <td>
                                        {one.name}
                                        <span className={`adm-quote-kind${one.kind === "postre" ? " is-postre" : ""}`}>{one.kind}</span>
                                        <span className="adm-web-table__bar" aria-hidden="true">
                                            <i style={{ width: `${(one.count / highest) * 100}%` }} />
                                        </span>
                                    </td>
                                    <td className="is-num"><b>{formatCount(one.count)}</b></td>
                                    <td className="is-num">{one.averageTotal === null ? "—" : formatPrice(one.averageTotal)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const QuoteDropOffCard = ({ quotes }: { quotes: IQuoteWebReport }) => {
    const dropOff = quotes.cakeDropOff;
    const total = dropOff.reduce((sum, one) => sum + one.sessions, 0);
    const highest = Math.max(1, ...dropOff.map((one) => one.sessions));

    return (
        <div className="adm-card">
            <h3 className="script">Dónde lo dejan</h3>
            <p className="adm-note">Solo cakes: el paso más avanzado de los que armaron uno y no lo enviaron.</p>

            {total === 0 ? (
                <p className="adm-empty">Nadie dejó un cake a medias en este período.</p>
            ) : (
                <div className="adm-scroll">
                    <table className="adm-web-table">
                        <thead>
                            <tr>
                                <th>Último paso</th>
                                <th className="is-num">Sesiones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dropOff.map((one) => (
                                <tr key={one.step}>
                                    <td>
                                        {CAKE_STEP_LABEL[one.step]}
                                        <span className="adm-web-table__bar" aria-hidden="true">
                                            <i style={{ width: `${(one.sessions / highest) * 100}%` }} />
                                        </span>
                                    </td>
                                    <td className="is-num"><b>{formatCount(one.sessions)}</b></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
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
