import { useMemo } from "react";

import { formatHour, formatMoney } from "@/helpers";
import type { IFinanceReport } from "@/helpers";

/* ============ Venta por hora ============ */

const HOUR_CHART = { width: 640, height: 220, left: 40, right: 8, top: 12, bottom: 26 };

/** Etiqueta corta del eje: "8a", "12p", "2p". */
const formatHourTick = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;

interface IHourChartProps {
    /** El día que se muestra en barras: un reporte de un solo día. */
    today: IFinanceReport;
    /** Si viene, su promedio por día abierto va como línea punteada. */
    average?: IFinanceReport | null;
    /** La barra de esta hora se pinta como "en curso". */
    currentHour?: number | null;
    label?: string;
}

/** Balboas por hora de un día en barras y, si hay con qué, una línea punteada con el promedio de otros días. */
export const HourChart = ({ today, average = null, currentHour = null, label = "Venta por hora" }: IHourChartProps) => {
    const chart = useMemo(() => {
        const openDays = average ? average.weekdays.reduce((sum, entry) => sum + entry.openDays, 0) : 0;
        const averageByHour = average ? average.hours.map((entry) => (openDays > 0 ? entry.total / openDays : 0)) : [];

        // Las horas en que se vende algo, ese día o en promedio: el local no abre de madrugada
        const active = Array.from({ length: 24 }, (_, hour) => hour).filter(
            (hour) => (average?.hours[hour]?.tickets ?? 0) > 0 || (today.hours[hour]?.tickets ?? 0) > 0
        );
        const first = active.length ? Math.min(...active) : 8;
        const last = active.length ? Math.max(...active) : 20;
        const hours = Array.from({ length: last - first + 1 }, (_, index) => first + index);

        const highest = Math.max(20, ...hours.map((hour) => Math.max(today.hours[hour]?.total ?? 0, averageByHour[hour] ?? 0)));
        const step = Math.max(10, Math.ceil(highest / 4 / 10) * 10);
        const top = step * 4;

        const plotWidth = HOUR_CHART.width - HOUR_CHART.left - HOUR_CHART.right;
        const plotHeight = HOUR_CHART.height - HOUR_CHART.top - HOUR_CHART.bottom;
        const slot = plotWidth / hours.length;
        const getY = (value: number) => HOUR_CHART.top + (1 - Math.max(0, value) / top) * plotHeight;
        const getCenter = (index: number) => HOUR_CHART.left + slot * index + slot / 2;

        return {
            bars: hours
                .map((hour, index) => {
                    const value = today.hours[hour]?.total ?? 0;
                    return { hour, x: getCenter(index) - slot * 0.3, y: getY(value), height: getY(0) - getY(value), value };
                })
                .filter((bar) => bar.height > 0),
            barWidth: slot * 0.6,
            line: hours.map((hour, index) => `${index ? "L" : "M"}${getCenter(index).toFixed(1)},${getY(averageByHour[hour] ?? 0).toFixed(1)}`).join(" "),
            hasAverage: openDays > 0,
            gridLines: Array.from({ length: 5 }, (_, index) => ({ value: index * step, y: getY(index * step) })),
            labels: hours.map((hour, index) => ({ hour, x: getCenter(index) })).filter((_, index) => hours.length <= 12 || index % 2 === 0),
        };
    }, [today, average]);

    return (
        <svg
            className="adm-chart"
            viewBox={`0 0 ${HOUR_CHART.width} ${HOUR_CHART.height}`}
            role="img"
            aria-label={label}
        >
            {chart.gridLines.map((line) => (
                <g key={line.value}>
                    <line x1={HOUR_CHART.left} y1={line.y} x2={HOUR_CHART.width - HOUR_CHART.right} y2={line.y} className="adm-chart__grid" />
                    <text x={HOUR_CHART.left - 8} y={line.y + 4} textAnchor="end" className="adm-chart__axis">{line.value}</text>
                </g>
            ))}

            {chart.bars.map((bar) => (
                <rect
                    key={bar.hour}
                    x={bar.x}
                    y={bar.y}
                    width={chart.barWidth}
                    height={bar.height}
                    rx={3}
                    className={`adm-chart__bar ${bar.hour === currentHour ? "is-now" : "is-local"}`}
                >
                    <title>{`${formatHour(bar.hour)} · B/. ${formatMoney(bar.value)}`}</title>
                </rect>
            ))}

            {chart.hasAverage ? <path d={chart.line} className="adm-chart__line is-web adm-chart__line--dash" /> : null}

            {chart.labels.map((entry) => (
                <text key={entry.hour} x={entry.x} y={HOUR_CHART.height - 8} textAnchor="middle" className="adm-chart__axis">
                    {formatHourTick(entry.hour)}
                </text>
            ))}
        </svg>
    );
};
