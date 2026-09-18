import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";

import { AnimatedPrice } from "./animated-price";
import { useCart } from "./use-cart";

/** Pastilla flotante "Ver pedido" que aparece en cuanto hay algo en la comanda. */
export const CartButton = () => {
    const { count, total, isOpen, setIsOpen } = useCart();
    const reduceMotion = useReducedMotion();
    const [scope, animate] = useAnimate();
    const previousCount = useRef(count);

    // Pequeño golpe de confirmacion cada vez que se agrega algo.
    useEffect(() => {
        if (count > previousCount.current && scope.current && !reduceMotion) {
            animate(scope.current, { transform: ["scale(0.96)", "scale(1)"] }, { duration: 0.2, ease: [0.23, 1, 0.32, 1] });
        }
        previousCount.current = count;
    }, [count, animate, scope, reduceMotion]);

    return (
        <AnimatePresence>
            {count > 0 && !isOpen && (
                <motion.div
                    className="cart-button-wrap"
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: "translateY(120%)" }}
                    animate={{ opacity: 1, transform: "translateY(0%)" }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: "translateY(120%)" }}
                    transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                >
                    <button ref={scope} type="button" className="cart-button" onClick={() => setIsOpen(true)}>
                        <span className="cart-button__label">Ver pedido</span>
                        <span className="cart-button__meta">
                            <AnimatedPrice value={total} />
                            <span className="cart-button__count" aria-label={`${count} productos`}>{count}</span>
                        </span>
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
