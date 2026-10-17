import "./combo-sheet.css";

import { ComboPhoto } from "./combo-photo";
import { useComboSheet } from "./use-combo-sheet";

import { formatComboUntil, formatPrice, getComboSlotsText, useCombos } from "@/helpers";

/**
 * Franja "Combos de ahora" del inicio. No aparece si no hay combos a la venta: a la hora de cierre
 * se esconde sola, sin recargar.
 */
export const ComboStrip = () => {
    const { combos } = useCombos();
    const { openCombo, comboSheet } = useComboSheet();

    if (combos.length === 0) return <>{comboSheet}</>;

    return (
        <section className="section combo-strip" aria-labelledby="combo-strip-title">
            <div className="section__inner">
                <div className="combo-strip__head">
                    <h2 id="combo-strip-title" className="section__title">
                        Combos de <span className="script section__script">ahora</span>
                    </h2>
                    <span className="combo-strip__live">A la venta</span>
                </div>
                {comboSheet}
                <ul className="combo-strip__list">
                    {combos.map((combo) => (
                        <li key={combo.id}>
                            <button type="button" className="combo-card" onClick={() => openCombo(combo)} aria-label={`Elegir el combo ${combo.name}`}>
                                <ComboPhoto combo={combo} />
                                <span className="combo-card__body">
                                    <span className="combo-card__name">{combo.name}</span>
                                    <span className="combo-card__what">{getComboSlotsText(combo.slots)}</span>
                                    <span className="combo-card__price">
                                        <b>{formatPrice(combo.price)}</b>
                                        {combo.regularPrice !== null && combo.regularPrice > combo.price && <del>antes {formatPrice(combo.regularPrice)}</del>}
                                    </span>
                                    <span className="combo-card__until">{formatComboUntil(combo.timeTo)}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
};
