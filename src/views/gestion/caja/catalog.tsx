import { SheetSelect } from "@/components";
import { formatCash, formatComboUntil, getComboSlotsText, getItemPrice, hasItemModifiers } from "@/helpers";
import type { IPublicCombo, useModifiers } from "@/helpers";
import type { IItem } from "@/interfaces";
import { formatComboFrom, getItemInitials } from "./helpers";

interface ICatalogProps {
    categories: { id: string; name: string }[];
    currentCategory: string | undefined;
    error: string;
    hasShift: boolean;
    isCombosTab: boolean;
    combos: IPublicCombo[];
    visibleItems: IItem[];
    modifiers: ReturnType<typeof useModifiers>;
    onCategoryChange: (id: string) => void;
    onPickCombo: (combo: IPublicCombo) => void;
    onAddItem: (item: IItem) => void;
}

/** Categorías y productos que se tocan para agregarlos a la cuenta. */
export const Catalog = ({
    categories,
    currentCategory,
    error,
    hasShift,
    isCombosTab,
    combos,
    visibleItems,
    modifiers,
    onCategoryChange,
    onPickCombo,
    onAddItem,
}: ICatalogProps) => (
        <div className="ges-account__menu">
            {currentCategory ? (
                <SheetSelect<string>
                    label="Categoría"
                    className="ges-select"
                    value={currentCategory}
                    options={categories.map((category) => ({ id: category.id, label: category.name }))}
                    onChange={onCategoryChange}
                />
            ) : null}

            <div className="ges-tabs fsheet-wide" role="group" aria-label="Categorías">
                {categories.map((category) => (
                    <button
                        key={category.id}
                        type="button"
                        className="ges-tab"
                        aria-selected={currentCategory === category.id}
                        onClick={() => onCategoryChange(category.id)}
                    >
                        {category.name}
                    </button>
                ))}
            </div>

            {error ? <p className="ges-error" role="alert">{error}</p> : null}
            {!hasShift ? (
                <p className="ges-warning">
                    No hay turno abierto: no se pueden agregar productos ni cobrar. Ábrelo en Turno.
                </p>
            ) : null}

            <div className="ges-grid">
                {isCombosTab ? combos.map((combo) => (
                    <button
                        key={combo.id}
                        type="button"
                        className="ges-prod"
                        disabled={!hasShift}
                        onClick={() => onPickCombo(combo)}
                    >
                        <span className="ges-prod__img ges-prod__img--none ges-prod__img--combo" aria-hidden="true">
                            {getItemInitials(combo.name)}
                        </span>
                        <span className="ges-prod__txt">
                            <b>{combo.name}</b>
                            <em>{getComboSlotsText(combo.slots)}</em>
                            <span>{formatComboFrom(combo)} · {formatComboUntil(combo.timeTo).toLowerCase()}</span>
                        </span>
                    </button>
                )) : visibleItems.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className="ges-prod"
                        disabled={!hasShift}
                        onClick={() => onAddItem(item)}
                    >
                        {item.image_url ? (
                            <img className="ges-prod__img" src={item.image_url} alt="" loading="lazy" />
                        ) : (
                            <span className="ges-prod__img ges-prod__img--none" aria-hidden="true">
                                {getItemInitials(item.item_name)}
                            </span>
                        )}
                        <span className="ges-prod__txt">
                            <b>{item.item_name}</b>
                            {hasItemModifiers(item, modifiers) ? <em>Con opciones</em> : null}
                            <span>{formatCash(getItemPrice(item))}</span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
);
