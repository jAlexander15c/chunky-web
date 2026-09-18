import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

import mascota from "@/assets/logos/mascota.png";

interface IStampProps {
    src?: string | null;
    alt: string;
    /** Texto impreso en el margen inferior de la estampilla. */
    caption?: string;
    /** Codigo corto a la derecha del margen (NY, IT, JP). */
    code?: string;
    /** Inclinacion final en grados. */
    rotate?: number;
    size?: "sm" | "md";
    /** Si se asienta con animacion al entrar en pantalla. */
    settle?: boolean;
    imageHeight?: number | string;
    imagePosition?: string;
    loading?: "lazy" | "eager";
    className?: string;
    style?: CSSProperties;
    children?: ReactNode;
}

/** Foto enmarcada como estampilla de correo, con borde perforado. */
export const Stamp = ({
    src,
    alt,
    caption,
    code,
    rotate = 0,
    size = "md",
    settle = false,
    imageHeight,
    imagePosition,
    loading = "lazy",
    className,
    style,
    children,
}: IStampProps) => {
    const reduceMotion = useReducedMotion();
    const finalTransform = `rotate(${rotate}deg)`;
    const shouldSettle = settle && !reduceMotion;

    return (
        <motion.div
            className={`stamp-lift ${className ?? ""}`}
            style={{ ...style, transform: finalTransform }}
            initial={shouldSettle ? { opacity: 0, transform: `translateY(18px) rotate(${rotate + 5}deg) scale(0.96)` } : false}
            whileInView={shouldSettle ? { opacity: 1, transform: `translateY(0px) ${finalTransform} scale(1)` } : undefined}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        >
            <div className={`stamp stamp--${size}`}>
                {src ? (
                    <img
                        className="stamp__image"
                        src={src}
                        alt={alt}
                        loading={loading}
                        style={{ height: imageHeight, objectPosition: imagePosition }}
                    />
                ) : (
                    <div className="stamp__fallback" style={{ height: imageHeight }} role="img" aria-label={alt}>
                        <img src={mascota} alt="" loading="lazy" />
                    </div>
                )}
                {(caption || code) && (
                    <div className="stamp__caption">
                        <span>{caption}</span>
                        {code && <span>{code}</span>}
                    </div>
                )}
                {children}
            </div>
        </motion.div>
    );
};
