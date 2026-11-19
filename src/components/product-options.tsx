import { useEffect, useState } from "react";
import { Drawer, Portal, useBreakpointValue } from "@chakra-ui/react";
import { PiMinusBold, PiPlusBold, PiXBold } from "react-icons/pi";

import "./matcha-options.css";

import { AnimatedPrice } from "./animated-price";
import { ModifierPicker } from "./modifier-picker";
import { Stamp } from "./stamp";
import { useCart } from "./use-cart";

import { formatCartModifiers, formatModifierOptions, formatPrice, getAvailableQuantity, getItemCartQuantity, getItemPrice, getLineMax, getModifiersPrice, getStockNote, getItemModifiers, isMatchaLatteName, loadMatchaFont, sortMatchaModifiers, useModifiers } from "@/helpers";
import type { ICartModifier, IModifier } from "@/helpers";
import type { IItem } from "@/interfaces";

const MAX_QUANTITY = 9;

interface IProductOptionsProps {
    /** null cuando la hoja esta cerrada. */
    item: IItem | null;
    modifiers: IModifier[];
    onClose: () => void;
}

/** Una rama dibujada a línea: la de la izquierda del título y, espejada por CSS, la de la derecha. */
export const MatchaBranch = ({ side }: { side: "left" | "right" }) => (
    <svg className={`mx-branch mx-branch--${side}`} viewBox="0 0 112 70" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" aria-hidden="true">
        <path d="M4 52 C30 40 58 30 108 14" />
        <path d="M26 44 c-6-10-2-20 8-24 c2 10-2 18-8 24z" fill="currentColor" fillOpacity=".14" />
        <path d="M46 36 c2-12 12-18 22-16 c-4 10-12 16-22 16z" fill="currentColor" fillOpacity=".14" />
        <path d="M66 29 c-2-10 4-18 14-20 c0 10-6 16-14 20z" fill="currentColor" fillOpacity=".14" />
        {side === "left" && <path d="M38 40 c4 8 14 12 22 10 c-6-8-14-11-22-10z" fill="currentColor" fillOpacity=".14" />}
        <circle cx="88" cy="20" r="6" fill="currentColor" fillOpacity=".1" />
        <circle cx="88" cy="20" r="2" />
        {side === "left" && <circle cx="16" cy="54" r="3" />}
    </svg>
);

/** Encabezado de la hoja del Matcha Latte: volver, ramas a los lados del título y una línea de bienvenida. */
const MatchaHead = ({ name }: { name: string }) => (
    <header className="mx-head">
        <div className="mx-bar">
            <Drawer.CloseTrigger asChild>
                <button type="button" className="mx-bar__back" aria-label="Cerrar las opciones">← Menú</button>
            </Drawer.CloseTrigger>
            <span>Bebidas</span>
        </div>
        <div className="mx-title">
            <MatchaBranch side="left" />
            <MatchaBranch side="right" />
            <Drawer.Title asChild>
                <h2>{name}</h2>
            </Drawer.Title>
            <p>Arma tu matcha a tu manera</p>
        </div>
    </header>
);

const ProductOptionsForm = ({ item, modifiers, onClose, isMatcha = false }: { item: IItem; modifiers: IModifier[]; onClose: () => void; isMatcha?: boolean }) => {
    const { lines, addItem, setIsOpen } = useCart();
    const [chosen, setChosen] = useState<ICartModifier[]>([]);
    const contextualModifiers = useModifiers({ variantId: item.variants?.[0]?.variant_id, optionIds: chosen.map((entry) => entry.modifierOptionId) });
    const [quantity, setQuantity] = useState(1);
    // Por lotes: lo que ya está en el carrito sale del mismo stock
    const room = getLineMax(lines, item, "");
    const max = Math.min(MAX_QUANTITY, room);
    const note = getStockNote(getAvailableQuantity(item), getItemCartQuantity(lines, item) + quantity);

    const unitPrice = getItemPrice(item) + getModifiersPrice(chosen);

    const addToCart = () => {
        for (let count = 0; count < Math.min(quantity, max); count++) addItem(item, undefined, chosen);
        onClose();
        setIsOpen(true);
    };

    if (isMatcha) {
        // Los grupos en el orden del menú de matcha; el resumen sigue ese mismo orden, no el de los toques
        const matchaModifiers = sortMatchaModifiers(getItemModifiers(item, contextualModifiers.length ? contextualModifiers : modifiers, chosen.map((entry) => entry.modifierOptionId)));
        const orderedChosen = matchaModifiers.flatMap((modifier) => chosen.filter((entry) => entry.modifierId === modifier.id));

        return (
            <>
                <div className="mx-rule" />
                <div className="mx-base">
                    <span>Precio base</span>
                    <strong>{formatPrice(getItemPrice(item))}</strong>
                </div>
                <div className="mx-rule" />

                <ModifierPicker theme="matcha" modifiers={matchaModifiers} chosen={chosen} onChange={setChosen} />

                <div className="mx-foot">
                    <p className="mx-summary" aria-live="polite">{orderedChosen.length ? formatModifierOptions(orderedChosen, " · ") : `${item.item_name} solo`}</p>
                    <button type="button" className="mx-add" onClick={addToCart} disabled={max <= 0}>
                        Agregar al carrito <strong>{formatPrice(unitPrice)}</strong>
                    </button>
                    {note && <p className="mx-hint" role="status">{note}</p>}
                </div>
            </>
        );
    }

    return (
        <>
            <div className="opts__intro">
                {item.image_url && <Stamp src={item.image_url} alt={item.item_name} size="sm" rotate={-4} className="opts__thumb" />}
                <div>
                    <p className="opts__lede">Personaliza tu pedido. Todo es opcional.</p>
                    <span className="opts__price">{formatPrice(getItemPrice(item))}</span>
                </div>
            </div>

            <ModifierPicker modifiers={getItemModifiers(item, contextualModifiers.length ? contextualModifiers : modifiers, chosen.map((entry) => entry.modifierOptionId))} chosen={chosen} onChange={setChosen} />

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
                        onClick={() => setQuantity((current) => Math.min(max, current + 1))}
                        disabled={quantity >= max}
                        aria-label="Agregar otro"
                    >
                        <PiPlusBold aria-hidden />
                    </button>
                </div>
                <button type="button" className="button button--primary opts__add" onClick={addToCart} disabled={max <= 0}>
                    Agregar · <AnimatedPrice value={unitPrice * quantity} live={false} />
                </button>
            </div>
            {note && <p className="opts__hint stepper__note" role="status">{note}</p>}
        </>
    );
};

/** Hoja para elegir los modificadores de un producto antes de agregarlo al carrito. */
export const ProductOptions = ({ item, modifiers, onClose }: IProductOptionsProps) => {
    const isSheet = useBreakpointValue({ base: true, md: false }) ?? true;
    // Al cerrar, item pasa a null mientras la hoja se desliza: se recuerda el último para no cambiar de estilo a medio cierre
    const [lastItem, setLastItem] = useState(item);
    if (item && item !== lastItem) setLastItem(item);
    const shownItem = item ?? lastItem;
    const isMatcha = isMatchaLatteName(shownItem?.item_name ?? "");

    useEffect(() => {
        if (isMatcha && item) loadMatchaFont();
    }, [isMatcha, item]);

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
                        className={`carrito opts${isMatcha ? " opts--matcha" : ""}`}
                        bg={isMatcha ? "#f4f0e4" : "#fffef6"}
                        color={isMatcha ? "#26331f" : "#26305c"}
                        boxShadow="none"
                        roundedTop={isSheet ? "24px" : "0"}
                        maxW={isSheet ? "100vw" : "470px"}
                        h={isSheet ? "auto" : "100dvh"}
                        maxH={isSheet ? "88dvh" : "100dvh"}
                    >
                        {isMatcha ? (
                            <MatchaHead name={shownItem?.item_name ?? ""} />
                        ) : (
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
                        )}

                        <Drawer.Body className={`carrito__body opts__body${isMatcha ? " mx-body" : ""}`}>
                            {item && <ProductOptionsForm item={item} modifiers={modifiers} onClose={onClose} isMatcha={isMatcha} />}
                        </Drawer.Body>
                    </Drawer.Content>
                </Drawer.Positioner>
            </Portal>
        </Drawer.Root>
    );
};
