import { useMemo } from "react";
import { formatDayLabel, formatShortDate } from "@/helpers";
import type { IWebPoint } from "@/helpers";

/* ============ Gráfico de visitas ============ */

// Más angosto que el de finanzas: comparte fila con el embudo y el texto no debe achicarse tanto
const VISITS_CHART = { width: 520, height: 240, left: 34, right: 30, top: 12, bottom: 28 };
const CHART_LABELS = 5;

/** Sesiones y carritos en línea, pedidos pagados en barras. Los tres son conteos: mismo eje. */
export const VisitsChart = ({ points, granularity }: { points: IWebPoint[]; granularity: "day" | "week" }) => {
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
