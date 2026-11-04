
/* ============ Estampilla de cifra ============ */

interface IStatTileProps {
    label: string;
    value: string;
    detail?: string;
    isAlert?: boolean;
    split?: { left: number; right: number };
    /** Variación contra el período anterior, en %. */
    delta?: number | null;
    /** Contra qué se compara el delta. */
    deltaLabel?: string;
    /** Valores recientes, del más viejo al más nuevo, para la línea chica junto a la cifra. */
    spark?: number[];
    action?: { label: string; onClick: () => void };
}

const SPARK = { width: 76, height: 28 };

/** Tendencia de la cifra en una línea: sin ejes, solo la forma y el último punto marcado. */
const Sparkline = ({ values }: { values: number[] }) => {
    const highest = Math.max(...values);
    const lowest = Math.min(...values);
    const range = highest - lowest || 1;
    const points = values.map((value, index) => [
        2 + (index * (SPARK.width - 4)) / (values.length - 1),
        SPARK.height - 3 - ((value - lowest) / range) * (SPARK.height - 6),
    ]);
    const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const [lastX, lastY] = points[points.length - 1];

    return (
        <svg className="adm-spark" viewBox={`0 0 ${SPARK.width} ${SPARK.height}`} aria-hidden="true">
            <polygon points={`2,${SPARK.height} ${line} ${lastX.toFixed(1)},${SPARK.height}`} className="adm-spark__area" />
            <polyline points={line} className="adm-spark__line" />
            <circle cx={lastX} cy={lastY} r={2.6} className="adm-spark__dot" />
        </svg>
    );
};

export const StatTile = ({ label, value, detail, isAlert, split, delta, deltaLabel = "vs período anterior", spark, action }: IStatTileProps) => (
    <div className="stamp-lift">
        <div className="stamp adm-tile">
            <span className="adm-tile__label">{label}</span>
            <span className="adm-tile__row">
                <span className={`adm-tile__value ops-num${isAlert ? " is-alert" : ""}`}>{value}</span>
                {spark && spark.length > 1 ? <Sparkline values={spark} /> : null}
            </span>
            {delta !== undefined && delta !== null ? (
                <span className={`adm-delta ${delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat"}`}>
                    {delta > 0 ? "↑" : delta < 0 ? "↓" : "="} {Math.abs(delta)} % {deltaLabel}
                </span>
            ) : null}
            {detail ? <span className="adm-tile__detail">{detail}</span> : null}
            {split && split.left + split.right > 0 ? (
                <span className="adm-split" aria-hidden="true">
                    <i style={{ width: `${(split.left / (split.left + split.right)) * 100}%` }} className="is-local" />
                    <i style={{ width: `${(split.right / (split.left + split.right)) * 100}%` }} className="is-web" />
                </span>
            ) : null}
            {action ? (
                <button type="button" className="adm-link adm-tile__link" onClick={action.onClick}>
                    {action.label} →
                </button>
            ) : null}
        </div>
    </div>
);
