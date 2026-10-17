import "./promos.css";
import "./combo-sheet.css";
import { useEffect } from "react";
import { Drawer, Portal, useBreakpointValue } from "@chakra-ui/react";
import { Link } from "react-router";
import { PiXBold } from "react-icons/pi";

import { AnimatedPrice } from "./animated-price";
import { CartCheckout } from "./cart-checkout";
import { ComboPhoto } from "./combo-photo";
import { useCart } from "./use-cart";
import { usePastaBuilder } from "./use-pasta-builder";
import { Mascot } from "./mascot";
import { QuantityStepper } from "./quantity-stepper";
import { Stamp } from "./stamp";

import { COMBO_LIMITS, formatCartLineDetails, formatPrice, getAvailableQuantity, getPromoLabel, getItemCartQuantity, getLineMax, getStockNote, isPastaOnlyNow, useCombos, useSettings } from "@/helpers";
import type { ICartLine, IPublicSettings } from "@/helpers";

/**
 * Lineas que ya no se venden hoy. Con solo pasta y bebidas quedan la pasta (lleva opciones) y las bebidas;
 * con el resto del menu se vende todo; los demas dias no hay pasta. Si aun no se sabe cual es la
 * categoria de bebidas no se quita nada.
 */
const getUnavailableLines = (lines: ICartLine[], settings: IPublicSettings) => {
    if (!settings.pastaMode) return lines.filter((line) => line.options);
    if (!isPastaOnlyNow(settings)) return [];
    if (!settings.beveragesCategoryId) return [];
    // Los combos no se quitan por el modo del día: su horario lo manda el API
    return lines.filter((line) => !line.combo && !line.options && line.item.category_id !== settings.beveragesCategoryId);
};

export const Cart = () => {
    const { lines, total, discount, comboSavings, prices, isOpen, setIsOpen, setQuantity, removeUnavailable, removedNames, cartNotice, dismissRemoved } = useCart();
    const { combos, isReady: areCombosReady } = useCombos();
    const { open: openPastaBuilder } = usePastaBuilder();
    const { settings, isReady } = useSettings();
    // Hoja inferior en movil, panel lateral desde tablet
    const isSheet = useBreakpointValue({ base: true, md: false }) ?? true;

    // El carrito puede haberse armado antes de que cambiara el modo del dia: se quita lo que ya no se vende
    useEffect(() => {
        if (!isReady) return;
        const unavailable = getUnavailableLines(lines, settings);
        if (unavailable.length === 0) return;

        removeUnavailable(unavailable);
    }, [isReady, settings, lines, removeUnavailable]);

    // El aviso se muestra mientras el carrito esta abierto y se descarta al cerrarlo
    useEffect(() => {
        if (!isOpen) dismissRemoved();
    }, [isOpen, dismissRemoved]);

    const addAnotherPasta = () => {
        setIsOpen(false);
        openPastaBuilder();
    };

    return (
        <Drawer.Root
            open={isOpen}
            onOpenChange={(event) => setIsOpen(event.open)}
            placement={isSheet ? "bottom" : "end"}
            size={isSheet ? "full" : "sm"}
        >
            <Portal>
                <Drawer.Backdrop bg="rgba(38, 48, 92, 0.45)" />
                <Drawer.Positioner>
                    <Drawer.Content
                        className="carrito"
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
                                <h2 className="carrito__title">Tu carrito</h2>
                            </Drawer.Title>
                            <Drawer.CloseTrigger asChild>
                                <button type="button" className="icon-button carrito__close" aria-label="Cerrar carrito">
                                    <PiXBold aria-hidden />
                                </button>
                            </Drawer.CloseTrigger>
                        </header>

                        <Drawer.Body className="carrito__body">
                            {removedNames.length > 0 && (
                                <div className="checkout__notice" role="status">
                                    <strong>Quitamos de tu carrito: {removedNames.join(", ")}.</strong>
                                    <span>{settings.pastaMode ? "Hoy solo vendemos pasta y bebidas." : "La pasta solo está disponible los días de pasta."}</span>
                                </div>
                            )}

                            {cartNotice && <div className="checkout__notice" role="status"><strong>{cartNotice}</strong></div>}

                            {lines.length === 0 ? (
                                <div className="carrito__empty">
                                    <Mascot className="carrito__empty-mascot" />
                                    <p>Tu carrito está vacío.</p>
                                    <Link to="/menu" className="text-link" onClick={() => setIsOpen(false)}>Ver el menú</Link>
                                </div>
                            ) : (
                                <ul className="carrito__lines">
                                    {[...lines].reverse().map((line, index) => {
                                        const liveCombo = line.combo ? combos.find((combo) => combo.id === line.combo!.comboId) : undefined;
                                        // Sin la primera consulta no se sabe: no se marca como "ya no está" lo que aún no cargó
                                        const isComboGone = Boolean(line.combo) && areCombosReady && !liveCombo;
                                        return (
                                        <li key={line.lineKey} className="carrito__line">
                                            {line.combo ? (
                                                <ComboPhoto combo={liveCombo ?? { id: line.combo.comboId, imageVersion: null }} className="carrito__thumb" />
                                            ) : (
                                            <Stamp
                                                src={line.item.image_url}
                                                alt=""
                                                size="sm"
                                                rotate={index % 2 === 0 ? -4 : 4}
                                                className="carrito__thumb"
                                            />
                                            )}
                                            <div className="carrito__info">
                                                <span className="carrito__name">{line.combo && <span className="carrito__badge">Combo</span>}{line.combo ? line.combo.name : line.item.item_name}</span>
                                                {formatCartLineDetails(line) && (
                                                    <span className="carrito__options">{formatCartLineDetails(line)}</span>
                                                )}
                                                {prices[line.lineKey]?.promo && <small className="promo-note">{getPromoLabel(prices[line.lineKey].promo!)} · {prices[line.lineKey].promo!.name}</small>}
                                                {prices[line.lineKey]?.hasOddUnit && <small className="promo-note">Agrega otra {line.item.item_name} y te sale gratis</small>}
                                                {isComboGone ? (
                                                    <>
                                                        <span className="carrito__gone" role="status">Ya no está a la venta a esta hora</span>
                                                        <button type="button" className="carrito__remove" onClick={() => setQuantity(line.lineKey, 0)}>Quitar</button>
                                                    </>
                                                ) : line.combo ? (
                                                    <QuantityStepper
                                                        size="sm"
                                                        quantity={line.quantity}
                                                        itemName={`Combo ${line.combo.name}`}
                                                        onChange={(quantity) => setQuantity(line.lineKey, quantity)}
                                                        max={COMBO_LIMITS.quantityMax}
                                                    />
                                                ) : (
                                                <QuantityStepper
                                                    size="sm"
                                                    quantity={line.quantity}
                                                    itemName={formatCartLineDetails(line) ? `${line.item.item_name} (${formatCartLineDetails(line)})` : line.item.item_name}
                                                    onChange={(quantity) => setQuantity(line.lineKey, quantity)}
                                                    max={getLineMax(lines, line.item, line.lineKey)}
                                                    note={getStockNote(getAvailableQuantity(line.item), getItemCartQuantity(lines, line.item))}
                                                />
                                                )}
                                            </div>
                                            <span className="carrito__price">{prices[line.lineKey]?.discount > 0 && <del className="promo-original">{formatPrice(prices[line.lineKey].subtotal)}</del>}{formatPrice(prices[line.lineKey]?.total ?? 0)}</span>
                                        </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {settings.pastaMode && settings.pasta && lines.length > 0 && (
                                <button type="button" className="text-link carrito__more" onClick={addAnotherPasta}>
                                    Armar otra pasta
                                </button>
                            )}

                            {/* Total, datos y pago dentro del area con scroll: en movil no tapan los productos */}
                            {lines.length > 0 && (
                                <footer className="carrito__foot carrito__foot--inline">
                                    {discount + comboSavings > 0 && <div className="comanda__row promo-note"><span>{comboSavings > 0 ? "Ahorras con combos y promos" : "Ahorras con promos"}</span><span>−{formatPrice(discount + comboSavings)}</span></div>}
                                    <div className="carrito__total">
                                        <span>Total</span>
                                        <AnimatedPrice value={total} className="carrito__total-value" />
                                    </div>
                                    <CartCheckout />
                                </footer>
                            )}
                        </Drawer.Body>
                    </Drawer.Content>
                </Drawer.Positioner>
            </Portal>
        </Drawer.Root>
    );
};
