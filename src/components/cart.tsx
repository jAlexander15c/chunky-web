import { Drawer, Portal, useBreakpointValue } from "@chakra-ui/react";
import { Link } from "react-router";
import { PiXBold } from "react-icons/pi";

import { AnimatedPrice } from "./animated-price";
import { CartCheckout } from "./cart-checkout";
import { useCart } from "./use-cart";
import { Mascot } from "./mascot";
import { QuantityStepper } from "./quantity-stepper";
import { Stamp } from "./stamp";

import { formatPrice, getItemPrice } from "@/helpers";

export const Cart = () => {
    const { lines, total, isOpen, setIsOpen, setQuantity } = useCart();
    // Hoja inferior en movil, panel lateral desde tablet
    const isSheet = useBreakpointValue({ base: true, md: false }) ?? true;

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
                            {lines.length === 0 ? (
                                <div className="carrito__empty">
                                    <Mascot className="carrito__empty-mascot" />
                                    <p>Tu carrito está vacío.</p>
                                    <Link to="/menu" className="text-link" onClick={() => setIsOpen(false)}>Ver el menú</Link>
                                </div>
                            ) : (
                                <ul className="carrito__lines">
                                    {[...lines].reverse().map((line, index) => (
                                        <li key={line.item.id} className="carrito__line">
                                            <Stamp
                                                src={line.item.image_url}
                                                alt={line.item.item_name}
                                                size="sm"
                                                rotate={index % 2 === 0 ? -4 : 4}
                                                className="carrito__thumb"
                                            />
                                            <div className="carrito__info">
                                                <span className="carrito__name">{line.item.item_name}</span>
                                                <QuantityStepper
                                                    size="sm"
                                                    quantity={line.quantity}
                                                    itemName={line.item.item_name}
                                                    onChange={(quantity) => setQuantity(line.item.id, quantity)}
                                                />
                                            </div>
                                            <span className="carrito__price">{formatPrice(getItemPrice(line.item) * line.quantity)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {/* Total, datos y pago dentro del area con scroll: en movil no tapan los productos */}
                            {lines.length > 0 && (
                                <footer className="carrito__foot carrito__foot--inline">
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
