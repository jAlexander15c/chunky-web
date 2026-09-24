import { useEffect, useState } from "react";

import { formatQuantity } from "@/helpers";
import type { ISupplyStatus } from "@/helpers";

/** Cuántas tarjetas se ven antes de "Ver los que faltan": lo más urgente cabe sin scrollear. */
const VISIBLE_WIDE = 6;
const VISIBLE_NARROW = 4;
const NARROW_QUERY = "(max-width: 720px)";

type Urgency = "hoy" | "pronto" | "sin-conteo";

const URGENCY_ORDER: Urgency[] = ["hoy", "pronto", "sin-conteo"];

/** Agotado o no llega a mañana es "hoy"; sin dos conteos no sabemos cuánto dura. */
const getUrgency = (supply: ISupplyStatus): Urgency => {
    if (supply.stock <= 0 || (supply.daysLeft !== null && supply.daysLeft < 1)) return "hoy";
    if (supply.dailyUse === null) return "sin-conteo";
    return "pronto";
};

const getUrgencyTag = (supply: ISupplyStatus, urgency: Urgency) => {
    if (urgency === "hoy") return supply.stock <= 0 ? "Agotado" : "Se acaba hoy";
    if (urgency === "sin-conteo") return "Sin conteo";
    if (supply.daysLeft === null) return "Bajo el mínimo";
    return supply.daysLeft === 1 ? "1 día" : `${formatQuantity(supply.daysLeft)} días`;
};

/** Lo que queda frente al mínimo, para la barra. */
const getStockPercent = (supply: ISupplyStatus) =>
    supply.minStock > 0 ? Math.max(0, Math.min(100, (supply.stock / supply.minStock) * 100)) : 0;

const getSortedByUrgency = (supplies: ISupplyStatus[]) =>
    [...supplies].sort(
        (a, b) =>
            URGENCY_ORDER.indexOf(getUrgency(a)) - URGENCY_ORDER.indexOf(getUrgency(b)) ||
            (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) ||
            getStockPercent(a) - getStockPercent(b)
    );

const useIsNarrow = () => {
    const [isNarrow, setIsNarrow] = useState(() => window.matchMedia?.(NARROW_QUERY).matches ?? false);

    useEffect(() => {
        const query = window.matchMedia?.(NARROW_QUERY);
        if (!query) return;
        const update = () => setIsNarrow(query.matches);
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    return isNarrow;
};

const BuyNowCard = ({ supply }: { supply: ISupplyStatus }) => {
    const urgency = getUrgency(supply);

    return (
        <article className={`adm-urgent__card is-${urgency}`}>
            <div className="adm-urgent__top">
                <span className="adm-urgent__name">{supply.name}</span>
                <span className="adm-urgent__tag">{getUrgencyTag(supply, urgency)}</span>
            </div>
            <div className="adm-urgent__stock">
                <b>{formatQuantity(supply.stock)}</b>
                <span>{supply.unit} quedan</span>
            </div>
            <div className="adm-urgent__bar" aria-hidden="true">
                <i style={{ width: `${getStockPercent(supply)}%` }} />
            </div>
            <div className="adm-urgent__foot">
                <span>
                    mínimo {formatQuantity(supply.minStock)} {supply.unit}
                </span>
                {supply.suggestedPurchase ? (
                    <span>
                        Pedir <b>{supply.suggestedPurchase}</b>{" "}
                        {supply.purchaseUnit ? `${supply.purchaseUnit}s` : supply.unit}
                        {supply.purchaseSize ? ` de ${formatQuantity(supply.purchaseSize)} ${supply.unit}` : ""}
                    </span>
                ) : (
                    <span className="adm-urgent__hint">Cuéntalo para saber cuánto pedir</span>
                )}
            </div>
        </article>
    );
};

/** "Comprar ya": el total en grande, el desglose por urgencia y las tarjetas de lo más urgente primero. */
export const AdminBuyNow = ({ supplies }: { supplies: ISupplyStatus[] }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const isNarrow = useIsNarrow();

    const sorted = getSortedByUrgency(supplies);
    const countOf = (urgency: Urgency) => supplies.filter((supply) => getUrgency(supply) === urgency).length;
    const limit = isNarrow ? VISIBLE_NARROW : VISIBLE_WIDE;
    const visible = isExpanded ? sorted : sorted.slice(0, limit);
    const hidden = sorted.length - limit;

    return (
        <section className="adm-band adm-urgent">
            <div className="adm-band__head">
                <h2 className="script">Comprar ya</h2>
                <span className="adm-band__sub">Bajo el mínimo o se acaba en menos de 2 días</span>
                <span className="adm-src is-own">Postgres</span>
            </div>

            <div className="adm-urgent__alarm" role="status">
                <div className="adm-urgent__total">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                        <path d="M12 9v4M12 17h.01" />
                    </svg>
                    <b>{supplies.length}</b>
                    <span>
                        {supplies.length === 1 ? "insumo" : "insumos"}
                        <br />
                        por comprar
                    </span>
                </div>
                <div className="adm-urgent__split">
                    <div>
                        <b>{countOf("hoy")}</b>
                        <span>se acaban hoy</span>
                    </div>
                    <div>
                        <b>{countOf("pronto")}</b>
                        <span>por acabarse</span>
                    </div>
                    <div>
                        <b>{countOf("sin-conteo")}</b>
                        <span>sin conteo</span>
                    </div>
                </div>
            </div>

            <div className="adm-urgent__grid">
                {visible.map((supply) => (
                    <BuyNowCard key={supply.id} supply={supply} />
                ))}
            </div>

            {hidden > 0 ? (
                <button type="button" className="adm-urgent__more" onClick={() => setIsExpanded((value) => !value)}>
                    {isExpanded ? "Mostrar menos ↑" : `Ver ${hidden === 1 ? "el que falta" : `los ${hidden} que faltan`} ↓`}
                </button>
            ) : null}
        </section>
    );
};
