import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { formatPrice } from "@/helpers";

interface IAnimatedPriceProps {
    value: number;
    className?: string;
    /** Dentro de un botón no se anuncia: el botón ya dice el monto y un aviso ahí se repite. */
    live?: boolean;
}

/** El total cambia por pasos de linea, como una caja registradora. */
export const AnimatedPrice = ({ value, className, live = true }: IAnimatedPriceProps) => {
    const reduceMotion = useReducedMotion();
    const label = formatPrice(value);

    return (
        <span className={`animated-price ${className ?? ""}`} aria-live={live ? "polite" : undefined}>
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                    key={label}
                    className="animated-price__value"
                    initial={reduceMotion ? { opacity: 0 } : { transform: "translateY(100%)", opacity: 0 }}
                    animate={{ transform: "translateY(0%)", opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { transform: "translateY(-100%)", opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                >
                    {label}
                </motion.span>
            </AnimatePresence>
        </span>
    );
};
