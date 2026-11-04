import { StatTile } from "../admin/stat-tile";
import { formatPrice, formatShortDate, getDelta } from "@/helpers";
import type { IWebReport } from "@/helpers";
import { formatCount, formatPercent } from "./web-helpers";
import { VisitsChart } from "./web-visits-chart";
import { QuoteSourcesCard, SourcesCard } from "./web-cards-sources";
import { FunnelCard, QuoteFunnelCard, QuoteTopCard, QuoteDropOffCard } from "./web-cards-funnel";
import { PromosCard, ProductsCard, CategoriesCard, HoursCard, ButtonsCard } from "./web-cards-activity";

export const WebBody = ({ report }: { report: IWebReport }) => {
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
                    spark={report.series.map((point) => point.sessions)}
                    detail="sesiones que abrieron la web"
                />
                <StatTile
                    label="Conversión"
                    value={formatPercent(totals.conversion)}
                    detail={`${formatCount(totals.paidOrders)} ${totals.paidOrders === 1 ? "pedido pagado" : "pedidos pagados"} por la web${
                        totals.whatsappOrders ? ` · ${formatCount(totals.whatsappOrders)} por WhatsApp` : ""
                    }${canCompare && previous.sessions > 0 ? ` · antes ${formatPercent(previous.conversion)}` : ""}`}
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

                <ProductsCard report={report} />
                <CategoriesCard report={report} />
                {report.promoClicks ? <PromosCard promos={report.promoClicks} /> : null}
                <HoursCard report={report} />
                <ButtonsCard report={report} />
            </div>
        </>
    );
};

/** Solo lo que pasa en el cotizador de la web. Los ingresos de cada pastelera no se muestran aquí: son de ella. */
export const QuotesBody = ({ report }: { report: IWebReport }) => {
    const { quotes, dataSince, range } = report;

    if (dataSince === null) {
        return <p className="adm-warning">Todavía no hay visitas medidas: el cotizador empieza a contar en cuanto alguien lo abre.</p>;
    }

    const funnel = quotes.funnel.all;
    const entered = funnel.find((step) => step.step === "visit")?.sessions ?? 0;
    const submitted = funnel.find((step) => step.step === "submit")?.sessions ?? 0;
    const whatsapp = funnel.find((step) => step.step === "whatsapp")?.sessions ?? 0;
    const topQuoted = quotes.top[0] ?? null;

    return (
        <>
            {dataSince > range.from ? (
                <p className="adm-warning">Empezamos a medir el {formatShortDate(dataSince, true)}: este período sale incompleto.</p>
            ) : null}

            <div className="adm-tiles adm-tiles--web">
                <StatTile
                    label="Cotizaciones enviadas"
                    value={formatCount(quotes.sent.all.count)}
                    detail={`${formatCount(quotes.sent.cake.count)} cakes · ${formatCount(quotes.sent.postre.count)} flan y cheesecake`}
                />
                <StatTile
                    label="Entran y envían"
                    value={entered > 0 ? formatPercent(Math.min(1, submitted / entered)) : "—"}
                    detail={`${formatCount(submitted)} de ${formatCount(entered)} sesiones que abrieron el cotizador`}
                />
                <StatTile
                    label="Total estimado promedio"
                    value={quotes.sent.all.averageTotal === null ? "—" : formatPrice(quotes.sent.all.averageTotal)}
                    detail={`${formatCount(whatsapp)} abrieron WhatsApp después de enviar`}
                />
                <StatTile
                    label="Lo más cotizado"
                    value={topQuoted ? topQuoted.name : "—"}
                    detail={topQuoted ? `${formatCount(topQuoted.count)} ${topQuoted.count === 1 ? "vez" : "veces"}` : "nadie envió una cotización todavía"}
                />
            </div>

            <div className="adm-web-grid">
                <QuoteFunnelCard quotes={quotes} />
                <QuoteTopCard quotes={quotes} />
                <QuoteDropOffCard quotes={quotes} />
                {report.sources ? <QuoteSourcesCard sources={report.sources} /> : null}
            </div>
        </>
    );
};
