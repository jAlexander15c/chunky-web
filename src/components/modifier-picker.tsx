import { PiCheckBold, PiMinusBold, PiPlusBold } from "react-icons/pi";

import { capitalizeFirst, formatPrice, isOptionAvailable, isRepeatableModifier, isSingleOptionModifier, MAX_MODIFIER_REPEAT, setRepeatedOption, toCartModifier } from "@/helpers";
import type { ICartModifier, IModifier, IModifierOption } from "@/helpers";

interface IModifierPickerProps {
    modifiers: IModifier[];
    chosen: ICartModifier[];
    onChange: (next: ICartModifier[]) => void;
    /** El equipo ve por qué no está (apagada o sin insumo); el cliente solo ve "Agotado". */
    showSoldOutReason?: boolean;
    /** Cada grupo pide una opcion (la pasta en la Caja); quien lo usa no deja agregar sin ellas. */
    isEveryGroupRequired?: boolean;
    /** "matcha": la hoja del Matcha Latte (papel crema, filas con el precio a la derecha). Sin él, el estilo de siempre. */
    theme?: "matcha";
}

const getSoldOutLabel = (option: IModifierOption, showReason: boolean) =>
    showReason && option.isManuallyDisabled ? "Apagado manualmente" : showReason && option.isOutOfStock ? "Sin insumo" : "Agotado";

const getExtraLabel = (option: IModifierOption) => (option.price > 0 ? `+${formatPrice(option.price)}` : "");

/** En la hoja de matcha el precio siempre se lee: lo que no cuesta dice "Incluida". */
const getMatchaPriceLabel = (option: IModifierOption) => (option.price > 0 ? `+${formatPrice(option.price)}` : "Incluida");

/**
 * Modificadores de Loyverse: todos opcionales. Uno con una sola opcion se muestra como casilla;
 * con varias, se elige una (tocar la elegida la quita). Loyverse no distingue obligatorios.
 * Las opciones agotadas se ven, tachadas y con "Agotado", pero no se pueden elegir.
 * Los repetibles (Endulzante) eligen una opción y la cuentan con − / + hasta MAX_MODIFIER_REPEAT.
 */
export const ModifierPicker = ({ modifiers, chosen, onChange, showSoldOutReason = false, isEveryGroupRequired = false, theme }: IModifierPickerProps) => {
    const isMatcha = theme === "matcha";

    const getChosenOptionId = (modifierId: string) =>
        chosen.find((entry) => entry.modifierId === modifierId)?.modifierOptionId;

    const getRepeatCount = (modifier: IModifier, option: IModifierOption) =>
        chosen.filter((entry) => entry.modifierId === modifier.id && entry.modifierOptionId === option.id).length;

    const toggleOption = (modifier: IModifier, option: IModifierOption) => {
        const withoutModifier = chosen.filter((entry) => entry.modifierId !== modifier.id);
        const wasChosen = getChosenOptionId(modifier.id) === option.id;
        onChange(wasChosen ? withoutModifier : [...withoutModifier, toCartModifier(modifier, option)]);
    };

    /** La opción queda N veces (N entradas idénticas); elegir otra opción del mismo modificador reemplaza las anteriores. */
    const setRepeatCount = (modifier: IModifier, option: IModifierOption, count: number) =>
        onChange(setRepeatedOption(chosen, modifier, option, count));

    return (
        <>
            {modifiers.map((modifier) => {
                const chosenOptionId = getChosenOptionId(modifier.id);

                if (isRepeatableModifier(modifier)) {
                    return (
                        <fieldset key={modifier.id} className={isMatcha ? "mx-group" : "opts__group"}>
                            <legend className={isMatcha ? "mx-group__title" : "opts__legend"}>
                                {isMatcha ? capitalizeFirst(modifier.name.trim()) : modifier.name}
                                {isMatcha ? <small>{`hasta ${MAX_MODIFIER_REPEAT}`}</small> : <span>{`hasta ${MAX_MODIFIER_REPEAT}`}</span>}
                            </legend>
                            <div className={isMatcha ? "mx-sweets" : "modifier-counts"}>
                                {modifier.options.map((option) => {
                                    const count = getRepeatCount(modifier, option);
                                    const isSoldOut = !isOptionAvailable(option);
                                    const canAdd = count < MAX_MODIFIER_REPEAT && !(isSoldOut && count === 0);
                                    const priceLabel = isMatcha ? getMatchaPriceLabel(option) : getExtraLabel(option);
                                    return (
                                        <div key={option.id} className={isMatcha ? "mx-sweet" : `modifier-count ${count > 0 ? "modifier-count--on" : ""}`}>
                                            <span className={isMatcha ? "mx-sweet__name" : "modifier-count__name"}>
                                                {isSoldOut ? <s>{option.name}</s> : option.name}
                                                {isSoldOut ? (
                                                    <small>{getSoldOutLabel(option, showSoldOutReason)}</small>
                                                ) : (
                                                    priceLabel && <small>{option.price > 0 ? `${priceLabel} cada una` : priceLabel}</small>
                                                )}
                                            </span>
                                            <div className={isMatcha ? "mx-step" : "stepper stepper--sm"} role="group" aria-label={`Cantidad de ${option.name}`}>
                                                <button
                                                    type="button"
                                                    className={isMatcha ? "mx-step__button" : "stepper__button"}
                                                    onClick={() => setRepeatCount(modifier, option, count - 1)}
                                                    disabled={count === 0}
                                                    aria-label={`Quitar ${option.name}`}
                                                >
                                                    <PiMinusBold aria-hidden />
                                                </button>
                                                <span className={isMatcha ? "mx-step__value" : "stepper__value"} aria-live="polite">{count}</span>
                                                <button
                                                    type="button"
                                                    className={isMatcha ? "mx-step__button" : "stepper__button"}
                                                    onClick={() => setRepeatCount(modifier, option, count + 1)}
                                                    disabled={!canAdd}
                                                    aria-label={`Agregar ${option.name}`}
                                                >
                                                    <PiPlusBold aria-hidden />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </fieldset>
                    );
                }

                if (isSingleOptionModifier(modifier)) {
                    const option = modifier.options[0];
                    const isChecked = chosenOptionId === option.id;
                    const isSoldOut = !isOptionAvailable(option);

                    if (isMatcha) {
                        return (
                            <div key={modifier.id} className="mx-group mx-group--check">
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={isChecked}
                                    disabled={!isChecked && isSoldOut}
                                    className="mx-row"
                                    onClick={() => toggleOption(modifier, option)}
                                >
                                    <span className="mx-row__name">
                                        <span className="mx-dot mx-dot--box" aria-hidden>{isChecked && <PiCheckBold />}</span>
                                        <span className="mx-row__script">{isSoldOut ? <s>{option.name}</s> : option.name}</span>
                                    </span>
                                    <span className="mx-row__price">{isSoldOut ? getSoldOutLabel(option, showSoldOutReason) : getMatchaPriceLabel(option)}</span>
                                </button>
                            </div>
                        );
                    }

                    return (
                        <label key={modifier.id} className={`modifier-check ${isChecked ? "modifier-check--on" : ""}`}>
                            <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!isChecked && isSoldOut}
                                onChange={() => toggleOption(modifier, option)}
                            />
                            <span className="modifier-check__box" aria-hidden>
                                <PiCheckBold />
                            </span>
                            <span className="modifier-check__name">{modifier.name} {option.name}</span>
                            {isSoldOut ? <span className="modifier-check__price">{getSoldOutLabel(option, showSoldOutReason)}</span> : option.price > 0 && <span className="modifier-check__price">{getExtraLabel(option)}</span>}
                        </label>
                    );
                }

                if (isMatcha) {
                    return (
                        <div key={modifier.id} className="mx-group">
                            <h3 className="mx-group__title">
                                {capitalizeFirst(modifier.name.trim())}
                                <small>elige una</small>
                            </h3>
                            <div className="mx-rows" role="radiogroup" aria-label={modifier.name}>
                                {modifier.options.map((option) => {
                                    const isChecked = chosenOptionId === option.id;
                                    const isSoldOut = !isOptionAvailable(option);
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={isChecked}
                                            disabled={!isChecked && isSoldOut}
                                            className="mx-row"
                                            onClick={() => toggleOption(modifier, option)}
                                        >
                                            <span className="mx-row__name">
                                                <span className="mx-dot" aria-hidden />
                                                {isSoldOut ? <s>{option.name}</s> : option.name}
                                            </span>
                                            <span className="mx-row__price">{isSoldOut ? getSoldOutLabel(option, showSoldOutReason) : getMatchaPriceLabel(option)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                }

                return (
                    <fieldset key={modifier.id} className="opts__group">
                        <legend className="opts__legend">
                            {modifier.name}
                            <span>{isEveryGroupRequired ? "elige una" : "elige una, opcional"}</span>
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
                                        aria-disabled={(!isChecked && isSoldOut) || undefined}
                                        disabled={!isChecked && isSoldOut}
                                        className={`opt-chip ${isChecked ? "opt-chip--on" : ""} ${isSoldOut ? "opt-chip--sold" : ""}`}
                                        onClick={() => toggleOption(modifier, option)}
                                    >
                                        {isChecked && <PiCheckBold aria-hidden />}
                                        {isSoldOut ? <s>{option.name}</s> : option.name}
                                        {isSoldOut ? (
                                            <span className="opt-chip__sold">{getSoldOutLabel(option, showSoldOutReason)}</span>
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
