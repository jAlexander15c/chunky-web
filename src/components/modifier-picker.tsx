import { PiCheckBold } from "react-icons/pi";

import { formatPrice, isOptionAvailable, isSingleOptionModifier, toCartModifier } from "@/helpers";
import type { ICartModifier, IModifier, IModifierOption } from "@/helpers";

interface IModifierPickerProps {
    modifiers: IModifier[];
    chosen: ICartModifier[];
    onChange: (next: ICartModifier[]) => void;
}

const getExtraLabel = (option: IModifierOption) => (option.price > 0 ? `+${formatPrice(option.price)}` : "");

/**
 * Modificadores de Loyverse: todos opcionales. Uno con una sola opcion se muestra como casilla;
 * con varias, se elige una (tocar la elegida la quita). Loyverse no distingue obligatorios.
 * Las opciones agotadas se ven, tachadas y con "Agotado", pero no se pueden elegir.
 */
export const ModifierPicker = ({ modifiers, chosen, onChange }: IModifierPickerProps) => {
    const getChosenOptionId = (modifierId: string) =>
        chosen.find((entry) => entry.modifierId === modifierId)?.modifierOptionId;

    const toggleOption = (modifier: IModifier, option: IModifierOption) => {
        const withoutModifier = chosen.filter((entry) => entry.modifierId !== modifier.id);
        const wasChosen = getChosenOptionId(modifier.id) === option.id;
        onChange(wasChosen ? withoutModifier : [...withoutModifier, toCartModifier(modifier, option)]);
    };

    return (
        <>
            {modifiers.map((modifier) => {
                const chosenOptionId = getChosenOptionId(modifier.id);

                if (isSingleOptionModifier(modifier)) {
                    const option = modifier.options[0];
                    const isChecked = chosenOptionId === option.id;

                    return (
                        <label key={modifier.id} className={`modifier-check ${isChecked ? "modifier-check--on" : ""}`}>
                            <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleOption(modifier, option)}
                            />
                            <span className="modifier-check__box" aria-hidden>
                                <PiCheckBold />
                            </span>
                            <span className="modifier-check__name">{modifier.name} {option.name}</span>
                            {option.price > 0 && <span className="modifier-check__price">{getExtraLabel(option)}</span>}
                        </label>
                    );
                }

                return (
                    <fieldset key={modifier.id} className="opts__group">
                        <legend className="opts__legend">
                            {modifier.name}
                            <span>elige una, opcional</span>
                        </legend>
                        <div className="opts__chips">
                            {modifier.options.map((option) => {
                                const isChecked = chosenOptionId === option.id;
                                const isSoldOut = !isOptionAvailable(option);
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={isChecked}
                                        aria-disabled={isSoldOut || undefined}
                                        disabled={isSoldOut}
                                        className={`opt-chip ${isChecked ? "opt-chip--on" : ""} ${isSoldOut ? "opt-chip--sold" : ""}`}
                                        onClick={() => toggleOption(modifier, option)}
                                    >
                                        {isChecked && <PiCheckBold aria-hidden />}
                                        {isSoldOut ? <s>{option.name}</s> : option.name}
                                        {isSoldOut ? (
                                            <span className="opt-chip__sold">Agotado</span>
                                        ) : (
                                            option.price > 0 && <small>{getExtraLabel(option)}</small>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>
                );
            })}
        </>
    );
};
