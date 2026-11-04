import { useMemo } from "react";
import { formatHour } from "@/helpers";
import type { IWebReport, IPromoClick } from "@/helpers";
import { PAGE_LABEL, MIN_OPENS_FOR_RATE, formatCount } from "./web-helpers";
import { OpsEmpty } from "@/components";

/** Cuánta gente tocó el botón de cada lámina del carrusel del inicio. */
export const PromosCard = ({ promos }: { promos: IPromoClick[] }) => {
    const topClicks = Math.max(1, ...promos.map((promo) => promo.clicks));

    return (
        <div className="adm-card adm-web-grid__wide">
            <h3 className="script">Promos del inicio</h3>
            <p className="adm-note">Clics en el botón de cada lámina del carrusel. La portada no cuenta: su botón es el del menú.</p>

            {promos.length === 0 ? (
                <OpsEmpty title="Nadie tocó el botón de una promo en este período." />
            ) : (
                <ul className="adm-web-promos">
                    {promos.map((promo) => (
                        <li key={promo.id}>
                            <span className="adm-web-promos__name">{promo.name}</span>
                            <b>{formatCount(promo.clicks)}</b>
                            <span className="adm-web-table__bar" aria-hidden="true">
                                <i style={{ width: `${(promo.clicks / topClicks) * 100}%` }} />
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export const ProductsCard = ({ report }: { report: IWebReport }) => {
    const products = report.topProducts;
    const topAdds = Math.max(1, ...products.map((product) => product.adds));

    return (
        <div className="adm-card adm-web-grid__wide">
            <h3 className="script">Productos</h3>
            <p className="adm-note">Las aperturas solo cuentan en productos con opciones: los demás se agregan directo.</p>

            {products.length === 0 ? (
                <OpsEmpty title="Nadie abrió ni agregó productos en este período." />
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

export const CategoriesCard = ({ report }: { report: IWebReport }) => {
    const categories = report.topCategories;
    const top = categories[0]?.opens || 1;

    return (
        <div className="adm-card">
            <h3 className="script">Categorías más abiertas</h3>
            <p className="adm-note">Desde el menú, el inicio o un enlace guardado.</p>

            {categories.length === 0 ? (
                <OpsEmpty title="Nadie abrió una categoría en este período." />
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

export const HoursCard = ({ report }: { report: IWebReport }) => {
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

export const ButtonsCard = ({ report }: { report: IWebReport }) => {
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
