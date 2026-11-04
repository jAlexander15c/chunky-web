import type { IWebSource } from "@/helpers";
import { MIN_SESSIONS_FOR_RATE, GOOD_SOURCE_CONVERSION, SOURCE_LABEL, formatCount, formatPercent } from "./web-helpers";
import { OpsEmpty } from "@/components";

/* ============ Tarjetas ============ */

/** De dónde llega la gente que cotiza, ordenado por cuántas cotizaciones salieron de cada origen. */
export const QuoteSourcesCard = ({ sources }: { sources: IWebSource[] }) => {
    const quoting = sources.filter((entry) => entry.source !== null && entry.quotes > 0).sort((a, b) => b.quotes - a.quotes);
    const topQuotes = Math.max(1, ...quoting.map((entry) => entry.quotes));

    return (
        <div className="adm-card adm-web-grid__wide">
            <h3 className="script">De dónde llegan los que cotizan</h3>
            <p className="adm-note">Sesiones que enviaron una cotización, por el origen con que abrieron la web.</p>

            {quoting.length === 0 ? (
                <OpsEmpty title="Nadie envió una cotización en este período." />
            ) : (
                <div className="adm-scroll">
                    <table className="adm-web-table">
                        <thead>
                            <tr>
                                <th>Origen</th>
                                <th className="is-num">Visitas</th>
                                <th className="is-num">Enviaron</th>
                                <th className="is-num">Tasa</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quoting.map((entry) => (
                                <tr key={entry.source}>
                                    <td>
                                        {SOURCE_LABEL[entry.source ?? ""] ?? entry.source}
                                        <span className="adm-web-table__bar" aria-hidden="true">
                                            <i style={{ width: `${(entry.quotes / topQuotes) * 100}%` }} />
                                        </span>
                                    </td>
                                    <td className="is-num">{formatCount(entry.sessions)}</td>
                                    <td className="is-num"><b>{formatCount(entry.quotes)}</b></td>
                                    <td className="is-num">
                                        {entry.sessions >= MIN_SESSIONS_FOR_RATE ? (
                                            formatPercent(Math.min(1, entry.quotes / entry.sessions))
                                        ) : (
                                            <span className="adm-web-table__muted">pocas visitas</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export const SourcesCard = ({ sources }: { sources: IWebSource[] }) => {
    // Lo de antes de medir el origen va al final, aunque tenga más visitas
    const measured = sources.filter((entry) => entry.source !== null);
    const unmeasured = sources.find((entry) => entry.source === null) ?? null;
    const topSessions = Math.max(1, ...measured.map((entry) => entry.sessions));

    return (
        <div className="adm-card adm-web-grid__wide">
            <h3 className="script">De dónde llegan</h3>
            <p className="adm-note">Cada visita cuenta en el origen con que abrió la web: el enlace con utm, la página anterior o la app de Instagram.</p>

            {sources.length === 0 ? (
                <OpsEmpty title="No hubo visitas en este período." />
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
