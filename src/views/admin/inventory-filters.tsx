import { COVERAGE_FULL_DAYS, getCoverageTone } from "./inventory-helpers";

/** Cuántos días alcanza el insumo, en número y en barra. Sin dos conteos no hay consumo y no se inventa un número. */
export const CoverageBar = ({ daysLeft }: { daysLeft: number | null }) => {
    if (daysLeft === null) return <span className="adm-nodata">falta un 2.º conteo</span>;

    return (
        <span className={`adm-cover is-${getCoverageTone(daysLeft)}`}>
            <span className="adm-cover__track" aria-hidden="true">
                <i style={{ width: `${Math.min(100, Math.max(4, (daysLeft / COVERAGE_FULL_DAYS) * 100))}%` }} />
            </span>
            <b>{daysLeft} d</b>
        </span>
    );
};

/* ============ Piezas de filtro ============ */

interface IFilterChipsProps<T extends string> {
    label: string;
    options: { id: T; label: string; count?: number }[];
    value: T;
    onChange: (value: T) => void;
}

export const FilterChips = <T extends string>({ label, options, value, onChange }: IFilterChipsProps<T>) => (
    <div className="adm-filter" role="group" aria-label={label}>
        <span className="adm-filter__label">{label}</span>
        {options.map((option) => (
            <button
                key={option.id}
                type="button"
                className="adm-chip"
                aria-pressed={value === option.id}
                onClick={() => onChange(option.id)}
            >
                {option.label}
                {option.count !== undefined ? <span className="adm-chip__count">{option.count}</span> : null}
            </button>
        ))}
    </div>
);

export const SearchInput = ({ id, label, value, onChange, placeholder }: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}) => (
    <>
        <label htmlFor={id} className="adm-sr-only">{label}</label>
        <input
            id={id}
            className="adm-search"
            type="search"
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(event) => onChange(event.target.value)}
        />
    </>
);
