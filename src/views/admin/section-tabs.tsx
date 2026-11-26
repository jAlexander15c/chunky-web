import type { ISectionTab } from "./use-section-tab";

interface ISectionTabsProps<T extends string> {
    label: string;
    tabs: ISectionTab<T>[];
    value: T;
    onChange: (next: T) => void;
}

/** Pestañas de una sección del tablero. Son pocas y cortas: caben en 390 px sin deslizar. */
export const SectionTabs = <T extends string>({ label, tabs, value, onChange }: ISectionTabsProps<T>) => (
    <div className="adm-tabs" role="tablist" aria-label={label}>
        {tabs.map((one) => (
            <button key={one.id} type="button" role="tab" className="adm-tab" aria-selected={value === one.id} onClick={() => onChange(one.id)}>
                {one.label}
            </button>
        ))}
    </div>
);
