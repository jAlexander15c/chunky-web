import { useState } from "react";
import { formatPrice } from "@/helpers";
import type { IQuoteWebReport, IWebReport, QuoteReportKind } from "@/helpers";
import { FUNNEL_LABEL, QUOTE_KIND_OPTIONS, QUOTE_STEP_LABEL, CAKE_STEP_LABEL, getQuoteStepHint, formatCount } from "./web-helpers";
import { OpsEmpty } from "@/components";

export const FunnelCard = ({ report }: { report: IWebReport }) => {
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
                <OpsEmpty title="Nadie abrió la web en este período." />
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

export const QuoteFunnelCard = ({ quotes }: { quotes: IQuoteWebReport }) => {
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
                <OpsEmpty title="Nadie abrió el cotizador en este período." />
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

            {/* En "Todo" estas cifras ya están en las estampillas de arriba: aquí solo aparecen al filtrar */}
            {kind === "all" ? null : (
                <div className="adm-web-buttons adm-quote-facts">
                    <div>
                        <b>{formatCount(sent.count)}</b>
                        <span>{kind === "cake" ? "cakes enviados" : "postres enviados"}</span>
                    </div>
                    <div>
                        <b>{base > 0 ? `${Math.round(Math.min(1, submitted / base) * 100)} %` : "—"}</b>
                        <span>de los que arman envían</span>
                    </div>
                    <div>
                        <b>{sent.averageTotal === null ? "—" : formatPrice(sent.averageTotal)}</b>
                        <span>total estimado promedio</span>
                    </div>
                    <div>
                        <b>{topOfKind ? topOfKind.name : "—"}</b>
                        <span>el más cotizado</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export const QuoteTopCard = ({ quotes }: { quotes: IQuoteWebReport }) => {
    const top = quotes.top;
    const highest = Math.max(1, ...top.map((one) => one.count));

    return (
        <div className="adm-card">
            <h3 className="script">Lo que más cotizan</h3>
            <p className="adm-note">Cotizaciones enviadas en el período, por tamaño o postre.</p>

            {top.length === 0 ? (
                <OpsEmpty title="Nadie envió una cotización en este período." />
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

export const QuoteDropOffCard = ({ quotes }: { quotes: IQuoteWebReport }) => {
    const dropOff = quotes.cakeDropOff;
    const total = dropOff.reduce((sum, one) => sum + one.sessions, 0);
    const highest = Math.max(1, ...dropOff.map((one) => one.sessions));

    return (
        <div className="adm-card">
            <h3 className="script">Dónde lo dejan</h3>
            <p className="adm-note">Solo cakes: el paso más avanzado de los que armaron uno y no lo enviaron.</p>

            {total === 0 ? (
                <OpsEmpty title="Nadie dejó un cake a medias en este período." />
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
