import { useCallback, useEffect, useState } from "react";

import {
    HttpError,
    addDays,
    fetchAdminCredits,
    fetchFinance,
    fetchProducts,
    fetchWebReport,
    formatMoney,
    getDelta,
    getPanamaTodayText,
} from "@/helpers";
import type { ICreditTicket, IDashboard, IFinanceReport, IProductStatus, ISupplyStatus, IWebReport } from "@/helpers";

import { StatTile } from "./admin-finance";
import { HourChart } from "./admin-hour-chart";
import type { AdminSection } from "./admin-sections";

/** Viene de public/: la misma mascota pequeña de los correos. */
const MASCOTA_SRC = "/correo/mascota.png";

const REFRESH_MS = 60000;
/** El promedio por hora sale de las cuatro semanas anteriores a hoy. */
const AVERAGE_DAYS = 28;
/** Cuántos nombres se listan en un pendiente antes de resumir con "y N más". */
const NAMES_SHOWN = 3;
/** Los productos que más se venden hoy. */
const TOP_TODAY = 5;

type AttentionTone = "crit" | "warn" | "info";

interface IAttentionItem {
    id: string;
    tone: AttentionTone;
    tag: string;
    title: string;
    detail: string;
    action: { label: string; section: AdminSection; anchor?: string };
}

const TONE_ORDER: Record<AttentionTone, number> = { crit: 0, warn: 1, info: 2 };

/** "a, b y c", y "a, b, c y 2 más" cuando hay más de los que caben. */
const formatNames = (names: string[]) => {
    const shown = names.slice(0, NAMES_SHOWN);
    const rest = names.length - shown.length;
    if (rest > 0) return `${shown.join(", ")} y ${rest} más`;
    return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} y ${shown[shown.length - 1]}` : (shown[0] ?? "");
};

const getDaysAgo = (value: string) => Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / (24 * 60 * 60 * 1000)));

const formatDaysAgo = (days: number) => (days === 0 ? "de hoy" : days === 1 ? "de ayer" : `de hace ${days} días`);

/** Lo que alguien tiene que resolver hoy, de lo más grave a lo menos. Cada uno lleva a su sección. */
const getAttentionItems = ({
    openIncidents,
    supplies,
    products,
    credits,
}: {
    openIncidents: number;
    supplies: ISupplyStatus[];
    products: IProductStatus[];
    credits: ICreditTicket[];
}): IAttentionItem[] => {
    const items: IAttentionItem[] = [];

    if (openIncidents > 0) {
        items.push({
            id: "descuadres",
            tone: "crit",
            tag: "Urgente",
            title: `${openIncidents} ${openIncidents === 1 ? "descuadre de pago sin resolver" : "descuadres de pago sin resolver"}`,
            detail: "Cobros que no quedaron completos en el sistema.",
            action: { label: "Revisar", section: "resumen", anchor: "descuadres" },
        });
    }

    const toBuy = supplies.filter((supply) => supply.state === "comprar");
    if (toBuy.length > 0) {
        const shortest = toBuy.reduce<number | null>(
            (lowest, supply) => (supply.daysLeft !== null && (lowest === null || supply.daysLeft < lowest) ? supply.daysLeft : lowest),
            null
        );
        items.push({
            id: "comprar",
            tone: "warn",
            tag: "Comprar",
            title: `${toBuy.length} ${toBuy.length === 1 ? "insumo por comprar" : "insumos por comprar"}`,
            detail: `${formatNames(toBuy.map((supply) => supply.name))}${shortest !== null ? `. El que menos alcanza, ${shortest} d.` : "."}`,
            action: { label: "Ver lista", section: "inventario" },
        });
    }

    const soldOut = products.filter((product) => product.state === "agotado");
    const low = products.filter((product) => product.state === "poco");
    if (soldOut.length > 0) {
        items.push({
            id: "agotados",
            tone: "warn",
            tag: "Agotado",
            title: `${soldOut.length} ${soldOut.length === 1 ? "producto agotado" : "productos agotados"}`,
            detail: `${formatNames(soldOut.map((product) => product.name))}${low.length > 0 ? `. Con poco: ${formatNames(low.map((product) => product.name))}.` : "."}`,
            action: { label: "Ver productos", section: "inventario" },
        });
    } else if (low.length > 0) {
        items.push({
            id: "poco",
            tone: "info",
            tag: "Poco",
            title: `${low.length} ${low.length === 1 ? "producto con poco stock" : "productos con poco stock"}`,
            detail: `${formatNames(low.map((product) => product.name))}.`,
            action: { label: "Ver productos", section: "inventario" },
        });
    }

    if (credits.length > 0) {
        const total = credits.reduce((sum, credit) => sum + credit.total, 0);
        const oldest = Math.max(...credits.map((credit) => getDaysAgo(credit.creditAt ?? credit.openedAt)));
        items.push({
            id: "creditos",
            tone: "info",
            tag: "Cobrar",
            title: `${credits.length} ${credits.length === 1 ? "crédito por cobrar" : "créditos por cobrar"} · B/. ${formatMoney(total)}`,
            detail: `El más viejo es ${formatDaysAgo(oldest)}.`,
            action: { label: "Ver créditos", section: "caja" },
        });
    }

    const toCount = supplies.filter((supply) => supply.state === "contar");
    if (toCount.length > 0) {
        items.push({
            id: "contar",
            tone: "info",
            tag: "Contar",
            title: `${toCount.length} ${toCount.length === 1 ? "insumo pide un conteo" : "insumos piden un conteo"}`,
            detail: `${formatNames(toCount.map((supply) => supply.name))}. Sin un conteo reciente, lo que alcanza pierde precisión.`,
            action: { label: "Contar", section: "inventario" },
        });
    }

    return items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
};

/* ============ Requiere atención ============ */

const AttentionList = ({ items, onOpen }: { items: IAttentionItem[]; onOpen: (action: IAttentionItem["action"]) => void }) => (
    <section className="adm-card adm-attention" aria-labelledby="adm-attention-title">
        <div className="adm-card-head">
            <h2 id="adm-attention-title" className="adm-attention__title">Requiere atención</h2>
            {items.length > 0 ? <span className="adm-attention__count">{items.length}</span> : null}
        </div>

        {items.length === 0 ? (
            <div className="adm-attention__clear">
                <img src={MASCOTA_SRC} alt="" width={72} height={72} />
                <p>
                    <b>Todo en orden.</b> Sin descuadres, sin compras urgentes ni productos agotados.
                </p>
            </div>
        ) : (
            <ul className="adm-attention__list">
                {items.map((item) => (
                    <li key={item.id} className="adm-attention__item">
                        <span className={`adm-attention__tag is-${item.tone}`}>{item.tag}</span>
                        <div className="adm-attention__text">
                            <b>{item.title}</b>
                            <span>{item.detail}</span>
                        </div>
                        <button type="button" className="adm-btn adm-btn--sm" onClick={() => onOpen(item.action)}>
                            {item.action.label}
                        </button>
                    </li>
                ))}
            </ul>
        )}
    </section>
);

/* ============ Resumen ============ */

interface IAdminOverviewProps {
    token: string;
    onSessionExpired: () => void;
    refreshKey: number;
    dashboard: IDashboard | null;
    supplies: ISupplyStatus[];
    openIncidents: number;
    onOpen: (section: AdminSection, anchor?: string) => void;
}

interface IOverviewData {
    products: IProductStatus[];
    credits: ICreditTicket[];
    today: IFinanceReport;
    average: IFinanceReport;
    web: IWebReport | null;
    /** La hora de Panamá en que se cargó: su barra se pinta como "en curso". */
    hour: number;
}

/** Todo lo que el resumen pide además del tablero: productos, créditos y la venta de hoy contra el promedio. */
const fetchOverview = async (token: string, signal?: AbortSignal): Promise<IOverviewData> => {
    const today = getPanamaTodayText();
    const [productData, creditData, todayReport, averageReport, webReport] = await Promise.all([
        fetchProducts(token, signal),
        fetchAdminCredits(token, signal),
        fetchFinance(token, today, today, signal),
        fetchFinance(token, addDays(today, -AVERAGE_DAYS), addDays(today, -1), signal),
        // Si las estadísticas de la web fallan, el resumen se muestra igual sin esa cifra
        fetchWebReport(token, today, today, signal).catch(() => null),
    ]);

    return {
        products: productData.products,
        credits: creditData.credits,
        today: todayReport,
        average: averageReport,
        web: webReport,
        hour: Number(new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(11, 13)),
    };
};

export const AdminOverview = ({ token, onSessionExpired, refreshKey, dashboard, supplies, openIncidents, onOpen }: IAdminOverviewProps) => {
    const [day, setDay] = useState<IOverviewData | null>(null);
    const [error, setError] = useState("");

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                setDay(await fetchOverview(token, signal));
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar el resumen.");
            }
        },
        [token, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        // load solo cambia el estado después de esperar la respuesta: no hay render en cascada
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load(controller.signal);
        const timer = window.setInterval(() => void load(), REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [load, refreshKey]);

    const items = getAttentionItems({ openIncidents, supplies, products: day?.products ?? [], credits: day?.credits ?? [] });

    const sales = dashboard?.sales ?? null;
    const todayText = getPanamaTodayText();
    const lastWeek = sales?.days.find((entry) => entry.date === addDays(todayText, -7)) ?? null;
    const recentTotals = sales ? [...sales.days].sort((a, b) => a.date.localeCompare(b.date)).map((entry) => entry.total) : [];
    const webShare = sales && sales.today.total > 0 ? Math.round((sales.today.web / sales.today.total) * 100) : 0;
    const topToday = day?.today.topProducts?.slice(0, TOP_TODAY) ?? [];

    return (
        <>
            {error ? <p className="adm-error">{error}</p> : null}

            <AttentionList items={items} onOpen={(action) => onOpen(action.section, action.anchor)} />

            <section className="adm-band">
                <div className="adm-band__head">
                    <h2 className="script">Cómo va el día</h2>
                    <span className="adm-band__sub">Mostrador y web juntos</span>
                </div>

                <div className="adm-tiles">
                    <StatTile
                        label="Venta de hoy"
                        value={`B/. ${formatMoney(sales?.today.total ?? 0)}`}
                        delta={lastWeek ? getDelta(sales?.today.total ?? 0, lastWeek.total) : null}
                        deltaLabel="vs mismo día la semana pasada"
                        spark={recentTotals}
                        split={{ left: sales?.today.mostrador ?? 0, right: sales?.today.web ?? 0 }}
                    />
                    <StatTile
                        label="Tickets"
                        value={String(sales?.today.tickets ?? 0)}
                        delta={lastWeek ? getDelta(sales?.today.tickets ?? 0, lastWeek.tickets) : null}
                        deltaLabel="vs mismo día la semana pasada"
                        detail={`ticket promedio B/. ${formatMoney(sales?.today.averageTicket ?? 0)}`}
                    />
                    <StatTile
                        label="Parte web"
                        value={`${webShare} %`}
                        detail={`B/. ${formatMoney(sales?.today.web ?? 0)} de la web`}
                    />
                    <StatTile
                        label="Visitas a la web"
                        value={day?.web ? day.web.totals.sessions.toLocaleString("es-PA") : "—"}
                        detail={
                            day?.web
                                ? `${day.web.totals.paidOrders} ${day.web.totals.paidOrders === 1 ? "pedido pagado" : "pedidos pagados"} hoy`
                                : "sin datos de la web"
                        }
                        action={{ label: "Ver la web", onClick: () => onOpen("web") }}
                    />
                </div>

                <div className="adm-overview-grid">
                    <div className="adm-card">
                        <h3 className="script">Venta por hora</h3>
                        <p className="adm-note">Balboas de hoy por hora, contra el promedio de las últimas cuatro semanas.</p>
                        <div className="adm-legend">
                            <span><i className="is-local" />Hoy</span>
                            <span><i className="is-now" />Hora en curso</span>
                            <span><i className="is-web is-dash" />Promedio</span>
                        </div>
                        {day ? (
                            <HourChart today={day.today} average={day.average} currentHour={day.hour} label="Venta de hoy por hora contra el promedio de las últimas cuatro semanas" />
                        ) : (
                            <div className="adm-skeleton adm-skeleton--chart" aria-hidden="true" />
                        )}
                    </div>

                    <div className="adm-card">
                        <div className="adm-card-head">
                            <h3 className="script grow">Lo más vendido hoy</h3>
                            <button type="button" className="adm-link" onClick={() => onOpen("ventas")}>Ver ventas</button>
                        </div>
                        {!day ? (
                            <div className="adm-skeleton adm-skeleton--list" aria-hidden="true" />
                        ) : day.today.topProductsNote === "sin-conexion" ? (
                            <p className="adm-empty">Loyverse no respondió en esta carga: vuelve a intentar en un minuto.</p>
                        ) : topToday.length === 0 ? (
                            <p className="adm-empty">Todavía no se vende nada hoy.</p>
                        ) : (
                            <div className="adm-bars">
                                {topToday.map((product) => (
                                    <div className="adm-bar" key={product.name}>
                                        <div className="adm-bar__top">
                                            <span>{product.name}</span>
                                            <span className="adm-bar__val">{product.units}</span>
                                        </div>
                                        <div className="adm-bar__track" style={{ width: `${(product.units / (topToday[0].units || 1)) * 100}%` }}>
                                            <i className="is-local" style={{ width: `${100 - product.webShare}%` }} />
                                            <i className="is-web" style={{ width: `${product.webShare}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </>
    );
};
