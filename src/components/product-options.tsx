import { useState } from "react";
import { Drawer, Portal, useBreakpointValue } from "@chakra-ui/react";
import { PiMinusBold, PiPlusBold, PiXBold } from "react-icons/pi";

import { AnimatedPrice } from "./animated-price";
import { ModifierPicker } from "./modifier-picker";
import { Stamp } from "./stamp";
import { useCart } from "./use-cart";

import { formatCartModifiers, formatPrice, getItemPrice, getModifiersPrice } from "@/helpers";
import type { ICartModifier, IModifier } from "@/helpers";
import type { IItem } from "@/interfaces";

const MAX_QUANTITY = 9;

interface IProductOptionsProps {
    /** null cuando la hoja esta cerrada. */
    item: IItem | null;
    modifiers: IModifier[];
    onClose: () => void;
}

const ProductOptionsForm = ({ item, modifiers, onClose }: { item: IItem; modifiers: IModifier[]; onClose: () => void }) => {
    const { addItem, setIsOpen } = useCart();
    const [chosen, setChosen] = useState<ICartModifier[]>([]);
    const [quantity, setQuantity] = useState(1);

    const unitPrice = getItemPrice(item) + getModifiersPrice(chosen);

    const addToCart = () => {
        for (let count = 0; count < quantity; count++) addItem(item, undefined, chosen);
        onClose();
        setIsOpen(true);
    };

    return (
        <>
            <div className="opts__intro">
                {item.image_url && <Stamp src={item.image_url} alt={item.item_name} size="sm" rotate={-4} className="opts__thumb" />}
                <div>
                    <p className="opts__lede">Personaliza tu pedido. Todo es opcional.</p>
                    <span className="opts__price">{formatPrice(getItemPrice(item))}</span>
                </div>
            </div>

            <ModifierPicker modifiers={modifiers} chosen={chosen} onChange={setChosen} />

            {chosen.length > 0 && (
                <div className="opts__summary" aria-live="polite">
                    <b>Tu pedido</b>
                    <span>{formatCartModifiers(chosen)}</span>
                </div>
            )}

            <div className="opts__buy">
                <div className="stepper stepper--md" role="group" aria-label={`Cantidad de ${item.item_name}`}>
                    <button
                        type="button"
                        className="stepper__button"
                        onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                        disabled={quantity === 1}
                        aria-label="Quitar uno"
                    >
                        <PiMinusBold aria-hidden />
                    </button>
                    <span className="stepper__value" aria-live="polite">{quantity}</span>
                    <button
                        type="button"
                        className="stepper__button"
                        onClick={() => setQuantity((current) => Math.min(MAX_QUANTITY, current + 1))}
                        disabled={quantity === MAX_QUANTITY}
                        aria-label="Agregar otro"
                    >
                        <PiPlusBold aria-hidden />
                    </button>
                </div>
                <button type="button" className="button button--primary opts__add" onClick={addToCart}>
                    Agregar · <AnimatedPrice value={unitPrice * quantity} />
                </button>
            </div>
        </>
    );
};

/** Hoja para elegir los modificadores de un producto antes de agregarlo al carrito. */
export const ProductOptions = ({ item, modifiers, onClose }: IProductOptionsProps) => {
    const isSheet = useBreakpointValue({ base: true, md: false }) ?? true;

    return (
        <Drawer.Root
            open={Boolean(item)}
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
                        className="carrito opts"
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
                                <h2 className="carrito__title carrito__title--plain">{item?.item_name}</h2>
                            </Drawer.Title>
                            <Drawer.CloseTrigger asChild>
                                <button type="button" className="icon-button carrito__close" aria-label="Cerrar las opciones">
                                    <PiXBold aria-hidden />
                                </button>
                            </Drawer.CloseTrigger>
                        </header>

                        <Drawer.Body className="carrito__body opts__body">
                            {item && <ProductOptionsForm item={item} modifiers={modifiers} onClose={onClose} />}
                        </Drawer.Body>
                    </Drawer.Content>
                </Drawer.Positioner>
            </Portal>
        </Drawer.Root>
    );
};
