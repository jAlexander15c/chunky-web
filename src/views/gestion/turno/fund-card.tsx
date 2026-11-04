import { FUND_MOVEMENT_LABEL, formatCash, formatDayClock } from "@/helpers";
import type { IFund, ManualFundMovementType } from "@/helpers";

/** Cuántos movimientos del fondo aparte se ven en caja; el historial completo está en /admin. */
const FUND_MOVEMENTS_SHOWN = 8;

interface IFundCardProps {
    fund: IFund;
    onMove: (type: ManualFundMovementType) => void;
}

/** El efectivo que no está en el cajón: da el fondo inicial al abrir y recibe lo contado al cerrar. */
export const FundCard = ({ fund, onMove }: IFundCardProps) => (
    <section className="ges-card">
        <div className="ges-fund__head">
            <h2>Fondo aparte</h2>
            <div className="ges-fund__bal">
                <span>Hay ahora</span>
                <b>{formatCash(fund.balance)}</b>
            </div>
        </div>
        <p className="ges-field__hint">
            El efectivo que no está en el cajón. De aquí sale el fondo inicial al abrir y aquí vuelve lo contado al cerrar.
        </p>

        <div className="ges-rows">
            {fund.movements.length === 0 ? (
                <p className="ges-empty">Ningún movimiento todavía. Registra un ajuste con lo que hay hoy.</p>
            ) : (
                fund.movements.slice(0, FUND_MOVEMENTS_SHOWN).map((one) => (
                    <div className="ges-r" key={one.id}>
                        <span>
                            <span className={`ges-tag${one.shiftId ? " is-shift" : ""}`}>{FUND_MOVEMENT_LABEL[one.type]}</span>
                            {one.reason} <em>{one.actorName} · {formatDayClock(one.createdAt)}</em>
                        </span>
                        <b className={one.amount > 0 ? "is-in" : undefined}>
                            {one.amount > 0 ? "+" : "−"}{formatCash(Math.abs(one.amount))}
                        </b>
                    </div>
                ))
            )}
        </div>

        <div className="ges-fund__acts">
            <button type="button" className="ges-btn" onClick={() => onMove("entrada")}>Entrada</button>
            <button type="button" className="ges-btn" onClick={() => onMove("salida")}>Salida</button>
            <button type="button" className="ges-btn" onClick={() => onMove("ajuste")}>Ajuste</button>
        </div>
    </section>
);
