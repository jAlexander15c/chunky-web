import { useState } from "react";
import type { FormEvent } from "react";

import { FINANCE_PERIODS, addDays, formatRange, getPanamaToday, getRangeError, getSelectionRange } from "@/helpers";
import type { FinancePeriod, PeriodSelection } from "@/helpers";

/* ============ Selector ============ */

type RangeMode = "dia" | "rango";

interface IPeriodPickerProps {
    selection: PeriodSelection;
    onChange: (next: PeriodSelection) => void;
}

/**
 * Atajos de período más "Elegir fechas", que abre debajo un panel con un día o un rango.
 * El panel va en línea y no en un modal: se ve lo que se está filtrando mientras se eligen las fechas.
 */
export const PeriodPicker = ({ selection, onChange }: IPeriodPickerProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<RangeMode>("rango");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [error, setError] = useState("");

    const today = getPanamaToday();
    const isCustom = selection.kind === "custom";

    const openPanel = () => {
        // Arranca con lo que se está viendo: es lo más fácil de ajustar
        const current = getSelectionRange(selection);
        setFrom(current.from);
        setTo(current.to);
        setMode(current.from === current.to ? "dia" : "rango");
        setError("");
        setIsOpen(true);
    };

    const choosePreset = (period: FinancePeriod) => {
        setIsOpen(false);
        onChange({ kind: "preset", period });
    };

    const apply = (event: FormEvent) => {
        event.preventDefault();
        const end = mode === "dia" ? from : to;
        const problem = getRangeError(from, end, today);
        if (problem) {
            setError(problem);
            return;
        }
        setIsOpen(false);
        onChange({ kind: "custom", from, to: end });
    };

    return (
        <>
            <div className="adm-chips" role="group" aria-label="Período">
                {FINANCE_PERIODS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        className="adm-chip"
                        aria-pressed={selection.kind === "preset" && selection.period === option.id}
                        onClick={() => choosePreset(option.id)}
                    >
                        {option.label}
                    </button>
                ))}
                <button
                    type="button"
                    className="adm-chip adm-chip--range"
                    aria-pressed={isCustom}
                    aria-expanded={isOpen}
                    aria-controls="adm-range-panel"
                    onClick={() => (isOpen ? setIsOpen(false) : openPanel())}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="16" rx="2" />
                        <path d="M3 10h18M8 3v4M16 3v4" />
                    </svg>
                    {isCustom ? formatRange(selection.from, selection.to) : "Elegir fechas"}
                </button>
            </div>

            {isOpen ? (
                <form
                    id="adm-range-panel"
                    className="adm-range"
                    onSubmit={apply}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") setIsOpen(false);
                    }}
                    noValidate
                >
                    <div className="adm-range__mode" role="radiogroup" aria-label="Qué elegir">
                        <button type="button" role="radio" aria-checked={mode === "dia"} onClick={() => setMode("dia")}>
                            Un día
                        </button>
                        <button type="button" role="radio" aria-checked={mode === "rango"} onClick={() => setMode("rango")}>
                            Rango
                        </button>
                    </div>

                    <div className="adm-range__fields">
                        <label className="adm-range__field" htmlFor="adm-range-from">
                            <span>{mode === "dia" ? "Día" : "Desde"}</span>
                            <input
                                id="adm-range-from"
                                type="date"
                                className="adm-form__input"
                                value={from}
                                max={today}
                                onChange={(event) => {
                                    setFrom(event.target.value);
                                    setError("");
                                }}
                            />
                        </label>
                        {mode === "rango" ? (
                            <label className="adm-range__field" htmlFor="adm-range-to">
                                <span>Hasta</span>
                                <input
                                    id="adm-range-to"
                                    type="date"
                                    className="adm-form__input"
                                    value={to}
                                    min={from || undefined}
                                    max={today}
                                    onChange={(event) => {
                                        setTo(event.target.value);
                                        setError("");
                                    }}
                                />
                            </label>
                        ) : null}
                    </div>

                    <div className="adm-range__shortcuts">
                        <button type="button" className="adm-link" onClick={() => { setMode("dia"); setFrom(addDays(today, -1)); setError(""); }}>
                            Ayer
                        </button>
                        <span className="adm-range__hint">Hasta un año por consulta.</span>
                    </div>

                    {error ? <p className="adm-range__error" role="alert">{error}</p> : null}

                    <div className="adm-range__actions">
                        <button type="button" className="adm-btn" onClick={() => setIsOpen(false)}>Cancelar</button>
                        <button type="submit" className="adm-btn adm-btn--solid">Ver</button>
                    </div>
                </form>
            ) : null}
        </>
    );
};
