import { useState } from "react";
import type { FormEvent } from "react";

import { HttpError, changeSupplyUnit, formatQuantity, getPlural, roundQuantity } from "@/helpers";
import type { ISupplyStatus } from "@/helpers";

interface ISupplyUnitDialogProps {
    token: string;
    supply: ISupplyStatus;
    onSaved: () => Promise<void>;
    onClose: () => void;
}

/**
 * Pasa un insumo de "u" a ml o g. Lo que había (stock, mínimo, recetas e historial) se multiplica,
 * y la unidad vieja queda como presentación: se sigue contando "3 cartones y 400 ml".
 */
export const SupplyUnitDialog = ({ token, supply, onSaved, onClose }: ISupplyUnitDialogProps) => {
    const [unit, setUnit] = useState("ml");
    const [perUnit, setPerUnit] = useState("");
    const [presentation, setPresentation] = useState(supply.purchaseUnit ?? "");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const size = Number(perUnit.replace(",", "."));
    const isValid = Number.isFinite(size) && size > 0;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!isValid) return setError(`Escribe cuánto trae cada ${presentation || "unidad"}.`);
        if (!presentation.trim()) return setError("Escribe cómo se llama cada unidad, por ejemplo cartón.");
        setIsSending(true);
        setError("");
        try {
            await changeSupplyUnit(token, supply.id, { unit, perUnit: String(roundQuantity(size)), presentation: presentation.trim() });
            await onSaved();
            onClose();
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo cambiar la unidad.");
            setIsSending(false);
        }
    };

    const name = presentation.trim() || "unidad";

    return (
        <div className="adm-modal" role="dialog" aria-modal="true" aria-label={`Cambiar la unidad de ${supply.name}`}>
            <form className="adm-modal__panel" onSubmit={submit}>
                <h3 className="script">Cambiar a ml o g</h3>
                <p className="adm-modal__hint">
                    {supply.name} se mide en {supply.unit}, y una receta no puede pedirle ml ni g. Dinos cuánto trae cada
                    una: el stock, el mínimo, las recetas y el historial se convierten, y se sigue contando en {getPlural(name)}.
                </p>
                <div className="adm-form">
                    <label className="adm-form__row adm-form__row--full">
                        <span>Cada {supply.unit} es un…</span>
                        <input
                            className="adm-form__input"
                            value={presentation}
                            placeholder="cartón"
                            onChange={(event) => setPresentation(event.target.value)}
                        />
                    </label>
                    <label className="adm-form__row">
                        <span>Y trae</span>
                        <input
                            className="adm-form__input"
                            inputMode="decimal"
                            autoFocus
                            value={perUnit}
                            placeholder="946"
                            onChange={(event) => setPerUnit(event.target.value)}
                        />
                    </label>
                    <label className="adm-form__row">
                        <span>Unidad</span>
                        <select className="adm-form__input" value={unit} onChange={(event) => setUnit(event.target.value)}>
                            <option value="ml">mililitros (ml)</option>
                            <option value="g">gramos (g)</option>
                        </select>
                    </label>
                </div>
                {isValid ? (
                    <p className="adm-note">
                        Hoy hay {formatQuantity(supply.stock)} {supply.unit}: quedarán {formatQuantity(roundQuantity(supply.stock * size))} {unit}.
                        El mínimo pasa a {formatQuantity(roundQuantity(supply.minStock * size))} {unit}.
                    </p>
                ) : null}
                {error ? (
                    <p className="adm-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <div className="adm-modal__actions">
                    <button type="button" className="adm-btn" disabled={isSending} onClick={onClose}>
                        Cancelar
                    </button>
                    <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending}>
                        {isSending ? "Cambiando…" : "Cambiar unidad"}
                    </button>
                </div>
            </form>
        </div>
    );
};
