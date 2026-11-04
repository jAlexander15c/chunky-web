import { useState } from "react";

import { ModifierPicker } from "@/components";
import { getItemModifiers, useModifiers } from "@/helpers";
import type { ICartModifier } from "@/helpers";
import type { IItem } from "@/interfaces";
import { LINE_NOTE_MAX } from "./helpers";

interface IOptionsDialogProps {
    item: IItem;
    /** La pasta exige una opcion de cada grupo (pasta, salsa y proteina); lo demas es opcional. */
    isEveryGroupRequired?: boolean;
    onAdd: (modifierOptionIds: string[], note: string | null) => Promise<void>;
    onClose: () => void;
}

export const OptionsDialog = ({ item, isEveryGroupRequired = false, onAdd, onClose }: IOptionsDialogProps) => {
    const [chosen, setChosen] = useState<ICartModifier[]>([]);
    const modifiers = useModifiers({
        live: true,
        variantId: item.variants?.[0]?.variant_id,
        optionIds: chosen.map((entry) => entry.modifierOptionId),
    });
    const [note, setNote] = useState("");
    const [isSending, setIsSending] = useState(false);

    const itemModifiers = getItemModifiers(item, modifiers, chosen.map((entry) => entry.modifierOptionId));
    const missingGroups = isEveryGroupRequired
        ? itemModifiers.filter((modifier) => !chosen.some((entry) => entry.modifierId === modifier.id))
        : [];

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Opciones de ${item.item_name}`}>
            <div className="ges-modal__panel">
                <h3 className="script">{item.item_name}</h3>
                <ModifierPicker modifiers={itemModifiers} chosen={chosen} onChange={setChosen} showSoldOutReason isEveryGroupRequired={isEveryGroupRequired} />
                <label className="ges-field">
                    <span>Nota para cocina</span>
                    <input
                        id="caja-opciones-nota"
                        type="text"
                        maxLength={LINE_NOTE_MAX}
                        autoComplete="off"
                        value={note}
                        placeholder="Opcional. Ej. sin azúcar glass"
                        onChange={(event) => setNote(event.target.value)}
                    />
                </label>
                {missingGroups.length > 0 ? (
                    <p className="ges-note">Falta elegir: {missingGroups.map((modifier) => modifier.name).join(", ")}</p>
                ) : null}
                <div className="ges-modal__acts">
                    <button type="button" className="ges-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
                    <button
                        type="button"
                        className="ges-btn ges-btn--solid"
                        disabled={isSending || missingGroups.length > 0}
                        onClick={async () => {
                            setIsSending(true);
                            await onAdd(chosen.map((one) => one.modifierOptionId), note.trim() || null);
                        }}
                    >
                        Agregar
                    </button>
                </div>
            </div>
        </div>
    );
};
