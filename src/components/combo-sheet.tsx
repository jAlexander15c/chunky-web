import { useState } from "react";
import { Drawer, Portal, useBreakpointValue } from "@chakra-ui/react";
import { PiCheckBold, PiXBold } from "react-icons/pi";

import "./combo-sheet.css";

import { AnimatedPrice } from "./animated-price";
import { ComboPhoto } from "./combo-photo";
import { ModifierPicker } from "./modifier-picker";
import { useCart } from "./use-cart";

import {
    formatComboUntil,
    formatPrice,
    getAvailableQuantity,
    getComboPricing,
    getItemModifiers,
    hasItemAvailableForSale,
    useComboItems,
    useModifiers,
} from "@/helpers";
import type { ICartModifier, IComboChoice, IComboSlot, IPublicCombo } from "@/helpers";
import type { IItem } from "@/interfaces";

/** Sin venta en la tienda o sin unidades en el lote: se ve tachado y no se elige. */
const isItemSoldOut = (item: IItem) => !hasItemAvailableForSale(item) || getAvailableQuantity(item) === 0;

interface ISlotPickerProps {
    slot: IComboSlot;
    items: Map<string, IItem>;
    isLoading: boolean;
    choice: IComboChoice | null;
    onChange: (choice: IComboChoice) => void;
}

/** Un hueco: chips con sus productos y, debajo, las opciones del elegido. */
const SlotPicker = ({ slot, items, isLoading, choice, onChange }: ISlotPickerProps) => {
    const slotItems = slot.itemIds.map((id) => items.get(id)).filter((item): item is IItem => Boolean(item));
    const globalModifiers = useModifiers();
    const chosenIds = (choice?.modifiers ?? []).map((entry) => entry.modifierOptionId);
    const contextualModifiers = useModifiers({ variantId: choice?.item.variants?.[0]?.variant_id, optionIds: chosenIds });
    const modifiers = choice ? getItemModifiers(choice.item, contextualModifiers.length ? contextualModifiers : globalModifiers, chosenIds) : [];

    const chooseItem = (item: IItem) => {
        if (choice?.item.id !== item.id) onChange({ item, modifiers: [] });
    };

    return (
        <fieldset className="opts__group combo-slot">
            <legend className="opts__legend">
                {slot.label}
                <span>{slot.itemIds.length > 1 ? "elige 1" : "incluido"}</span>
            </legend>
            {slotItems.length === 0 ? (
                <p className="combo-slot__empty">{isLoading ? "Cargando…" : "Hoy no hay productos para este hueco."}</p>
            ) : (
                <div className="opts__chips" role="radiogroup" aria-label={slot.label}>
                    {slotItems.map((item) => {
                        const isChecked = choice?.item.id === item.id;
                        const isSoldOut = isItemSoldOut(item);
                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="radio"
                                aria-checked={isChecked}
                                disabled={isSoldOut}
                                className={`opt-chip ${isChecked ? "opt-chip--on" : ""} ${isSoldOut ? "opt-chip--sold" : ""}`}
                                onClick={() => chooseItem(item)}
                            >
                                {isChecked && <PiCheckBold aria-hidden />}
                                {isSoldOut ? <s>{item.item_name}</s> : item.item_name}
                                {isSoldOut && <span className="opt-chip__sold">Agotado</span>}
                            </button>
                        );
                    })}
                </div>
            )}
            {choice && modifiers.length > 0 && (
                <div className="combo-slot__mods">
                    <ModifierPicker
                        modifiers={modifiers}
                        chosen={choice.modifiers}
                        onChange={(next: ICartModifier[]) => onChange({ item: choice.item, modifiers: next })}
                    />
                </div>
            )}
        </fieldset>
    );
};

const ComboForm = ({ combo, onClose }: { combo: IPublicCombo; onClose: () => void }) => {
    const { addCombo, setIsOpen } = useCart();
    const { items, isLoading } = useComboItems(true);
    const [picked, setPicked] = useState<(IComboChoice | null)[]>(() => combo.slots.map(() => null));

    // Un hueco con un solo producto va fijo: no hay nada que elegir
    const choices = combo.slots.map((slot, index) => {
        if (picked[index]) return picked[index];
        const onlyItem = slot.itemIds.length === 1 ? items.get(slot.itemIds[0]) : undefined;
        return onlyItem && !isItemSoldOut(onlyItem) ? { item: onlyItem, modifiers: [] } : null;
    });
    const hasStock = (slot: IComboSlot) => slot.itemIds.some((id) => {
        const item = items.get(id);
        return Boolean(item) && !isItemSoldOut(item as IItem);
    });
    const missing = combo.slots.filter((slot, index) => !choices[index] && hasStock(slot));
    const soldOut = isLoading ? [] : combo.slots.filter((slot) => !hasStock(slot));
    const isComplete = !isLoading && choices.every(Boolean);
    const pricing = getComboPricing(combo, choices, items);
    const hasDiscount = combo.discountPercent > 0 && pricing.regular > pricing.total;

    const addToCart = () => {
        if (!isComplete) return;
        addCombo(combo, choices as IComboChoice[]);
        onClose();
        setIsOpen(true);
    };

    return (
        <>
            <div className="opts__intro">
                <div className="combo-sheet__thumb">
                    <ComboPhoto combo={combo} className="combo-photo--sheet" />
                    {combo.discountPercent > 0 && <span className="combo-sheet__seal">−{combo.discountPercent} %</span>}
                </div>
                <div>
                    <p className="opts__lede">Combo · {formatComboUntil(combo.timeTo).toLowerCase()}</p>
                    <span className="combo-sheet__price">
                        {pricing.isFrom && <small>Desde</small>}
                        <b>{formatPrice(pricing.total)}</b>
                        {hasDiscount && <del>{pricing.isFrom ? "desde " : ""}{formatPrice(pricing.regular)}</del>}
                    </span>
                </div>
            </div>
            {combo.description && <p className="combo-sheet__description">{combo.description}</p>}

            {combo.slots.map((slot, index) => (
                <SlotPicker
                    key={`${index}-${slot.label}`}
                    slot={slot}
                    items={items}
                    isLoading={isLoading}
                    choice={choices[index]}
                    onChange={(choice) => setPicked((current) => current.map((entry, position) => position === index ? choice : entry))}
                />
            ))}

            {missing.length > 0 && <p className="combo-missing" role="status">Falta elegir: {missing.map((slot) => slot.label).join(", ")}</p>}
            {soldOut.length > 0 && <p className="combo-missing" role="status">Por ahora no hay disponibles: {soldOut.map((slot) => slot.label).join(", ")}</p>}

            <div className="opts__buy">
                <button type="button" className="button button--primary opts__add" onClick={addToCart} disabled={!isComplete}>
                    Agregar · <AnimatedPrice value={pricing.unit} live={false} />
                </button>
            </div>
            {pricing.extras > 0 && (
                <p className="opts__hint combo-sheet__extra" role="status">
                    {formatPrice(pricing.total)} del combo + {formatPrice(pricing.extras)} de extras.
                </p>
            )}
        </>
    );
};

/** Hoja para armar un combo: un producto por hueco, con sus opciones; el precio sigue lo que se elige. */
export const ComboSheet = ({ combo, onClose }: { combo: IPublicCombo | null; onClose: () => void }) => {
    const isSheet = useBreakpointValue({ base: true, md: false }) ?? true;

    return (
        <Drawer.Root
            open={Boolean(combo)}
            onOpenChange={(event) => { if (!event.open) onClose(); }}
            placement={isSheet ? "bottom" : "end"}
            size={isSheet ? "full" : "sm"}
            lazyMount
            unmountOnExit
        >
            <Portal>
                <Drawer.Backdrop bg="rgba(38, 48, 92, 0.45)" />
                <Drawer.Positioner>
                    <Drawer.Content
                        className="carrito opts combo-sheet"
                        bg="#fffef6"
                        color="#26305c"
                        boxShadow="none"
                        roundedTop={isSheet ? "24px" : "0"}
                        maxW={isSheet ? "100vw" : "470px"}
                        h={isSheet ? "auto" : "100dvh"}
                        maxH={isSheet ? "88dvh" : "100dvh"}
                    >
                        <header className="carrito__head">
                            <span className="carrito__grip" aria-hidden />
                            <Drawer.Title asChild>
                                <h2 className="carrito__title carrito__title--plain">{combo?.name}</h2>
                            </Drawer.Title>
                            <Drawer.CloseTrigger asChild>
                                <button type="button" className="icon-button carrito__close" aria-label="Cerrar el combo">
                                    <PiXBold aria-hidden />
                                </button>
                            </Drawer.CloseTrigger>
                        </header>

                        <Drawer.Body className="carrito__body opts__body">
                            {combo && <ComboForm key={combo.id} combo={combo} onClose={onClose} />}
                        </Drawer.Body>
                    </Drawer.Content>
                </Drawer.Positioner>
            </Portal>
        </Drawer.Root>
    );
};
