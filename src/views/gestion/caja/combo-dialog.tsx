import { useState } from "react";

import { ModifierPicker } from "@/components";
import {
    formatCash,
    formatComboUntil,
    getComboPricing,
    getItemModifiers,
    hasItemAvailableForSale,
    useComboItems,
    useModifiers,
} from "@/helpers";
import type { IComboChoice, IComboSlot, IPublicCombo } from "@/helpers";
import type { IItem } from "@/interfaces";
import { LINE_NOTE_MAX, formatComboFrom } from "./helpers";

interface IComboSlotPickerProps {
    slot: IComboSlot;
    items: Map<string, IItem>;
    choice: IComboChoice | null;
    onChange: (choice: IComboChoice) => void;
}

/** Un hueco del combo: los productos que entran y, debajo, las opciones del elegido. */
const ComboSlotPicker = ({ slot, items, choice, onChange }: IComboSlotPickerProps) => {
    const chosenIds = (choice?.modifiers ?? []).map((entry) => entry.modifierOptionId);
    const modifiers = useModifiers({ live: true, variantId: choice?.item.variants?.[0]?.variant_id, optionIds: chosenIds });
    const slotItems = slot.itemIds.map((id) => items.get(id)).filter((item): item is IItem => Boolean(item));
    const itemModifiers = choice ? getItemModifiers(choice.item, modifiers, chosenIds) : [];

    return (
        <fieldset className="ges-combo-slot">
            <legend>{slot.label}</legend>
            <div className="ges-combo-chips">
                {slotItems.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className="ges-combo-chip"
                        aria-pressed={choice?.item.id === item.id}
                        disabled={!hasItemAvailableForSale(item)}
                        onClick={() => {
                            if (choice?.item.id !== item.id) onChange({ item, modifiers: [] });
                        }}
                    >
                        {item.item_name}
                    </button>
                ))}
            </div>
            {choice && itemModifiers.length > 0 ? (
                <ModifierPicker
                    modifiers={itemModifiers}
                    chosen={choice.modifiers}
                    onChange={(chosen) => onChange({ item: choice.item, modifiers: chosen })}
                    showSoldOutReason
                />
            ) : null}
        </fieldset>
    );
};

interface IComboDialogProps {
    combo: IPublicCombo;
    onAdd: (choices: IComboChoice[], note: string | null) => Promise<void>;
    onClose: () => void;
}

export const ComboDialog = ({ combo, onAdd, onClose }: IComboDialogProps) => {
    const { items, isLoading } = useComboItems(true);
    const [picked, setPicked] = useState<(IComboChoice | null)[]>(() => combo.slots.map(() => null));
    const [note, setNote] = useState("");
    const [isSending, setIsSending] = useState(false);

    // Un hueco con un solo producto ya viene elegido, si se puede vender
    const choices = combo.slots.map((slot, index) => {
        if (picked[index]) return picked[index];
        const onlyItem = slot.itemIds.length === 1 ? items.get(slot.itemIds[0]) : undefined;
        return onlyItem && hasItemAvailableForSale(onlyItem) ? { item: onlyItem, modifiers: [] } : null;
    });
    const missing = combo.slots.filter((_, index) => !choices[index]);
    const ready = choices.filter((choice): choice is IComboChoice => Boolean(choice));
    const pricing = getComboPricing(combo, choices, items);

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Combo ${combo.name}`}>
            <div className="ges-modal__panel">
                <h3 className="script">{combo.name}</h3>
                <p className="ges-combo-sub">{formatComboFrom(combo)} · {formatComboUntil(combo.timeTo).toLowerCase()}</p>
                {isLoading ? <p className="ges-note">Cargando los productos…</p> : null}
                {combo.slots.map((slot, index) => (
                    <ComboSlotPicker
                        key={index}
                        slot={slot}
                        items={items}
                        choice={choices[index]}
                        onChange={(choice) => setPicked((current) => current.map((entry, at) => (at === index ? choice : entry)))}
                    />
                ))}
                <label className="ges-field">
                    <span>Nota para cocina</span>
                    <input
                        id="caja-combo-nota"
                        type="text"
                        maxLength={LINE_NOTE_MAX}
                        autoComplete="off"
                        value={note}
                        placeholder="Opcional"
                        onChange={(event) => setNote(event.target.value)}
                    />
                </label>
                {!isLoading && missing.length > 0 ? (
                    <p className="ges-note">Falta elegir: {missing.map((slot) => slot.label).join(", ")}</p>
                ) : null}
                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button
                        type="button"
                        className="ges-btn ges-btn--solid"
                        disabled={isSending || isLoading || missing.length > 0}
                        onClick={async () => {
                            setIsSending(true);
                            await onAdd(ready, note.trim() || null);
                        }}
                    >
                        Agregar · {formatCash(pricing.unit)}
                    </button>
                </div>
            </div>
        </div>
    );
};
