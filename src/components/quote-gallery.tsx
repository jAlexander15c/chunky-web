import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent } from "react";
import { useReducedMotion } from "motion/react";
import { PiCaretLeftBold, PiCaretRightBold } from "react-icons/pi";

import { getQuoteGalleryPhotoUrl, useQuoteGallery } from "@/helpers";

import "./quote-gallery.css";

const AUTOPLAY_MS = 5000;
// Tras tocar o usar una flecha, la galería no avanza sola un rato
const INTERACTION_HOLD_MS = 8000;

/**
 * Fotos de referencia junto al título del cotizador (solo foto, título y etiqueta: sin acciones).
 * Sin fotos visibles, o si todas fallan al cargar, no se pinta nada y el cotizador queda como siempre.
 */
export const QuoteGallery = () => {
    const { photos } = useQuoteGallery();
    const reduceMotion = useReducedMotion();
    const [failedIds, setFailedIds] = useState<string[]>([]);
    const [active, setActive] = useState(0);
    const isHoveredRef = useRef(false);
    const hasFocusRef = useRef(false);
    const holdUntilRef = useRef(0);

    const shown = photos.filter((photo) => !failedIds.includes(photo.id));
    const count = shown.length;
    const current = count === 0 ? 0 : Math.min(active, count - 1);

    const goTo = useCallback(
        (index: number) => {
            if (count === 0) return;
            setActive(((index % count) + count) % count);
        },
        [count]
    );

    const goToByHand = (index: number) => {
        holdUntilRef.current = Date.now() + INTERACTION_HOLD_MS;
        goTo(index);
    };

    // Con movimiento reducido nunca avanza solo
    useEffect(() => {
        if (reduceMotion || count < 2) return;
        const timer = window.setInterval(() => {
            const isHeld = isHoveredRef.current || hasFocusRef.current || document.hidden || Date.now() < holdUntilRef.current;
            if (!isHeld) setActive((index) => (Math.min(index, count - 1) + 1) % count);
        }, AUTOPLAY_MS);
        return () => window.clearInterval(timer);
    }, [count, reduceMotion]);

    const handleBlur = (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) hasFocusRef.current = false;
    };

    if (count === 0) return null;

    return (
        <section
            className="qgal"
            aria-roledescription="carrusel"
            aria-label="Ideas para tu postre"
            onMouseEnter={() => { isHoveredRef.current = true; }}
            onMouseLeave={() => { isHoveredRef.current = false; }}
            onFocus={() => { hasFocusRef.current = true; }}
            onBlur={handleBlur}
            onTouchStart={() => { holdUntilRef.current = Date.now() + INTERACTION_HOLD_MS; }}
        >
            {shown.map((photo, index) => (
                <figure key={photo.id} className={`qgal__slide${index === current ? " is-on" : ""}`} aria-hidden={index !== current}>
                    <img
                        src={getQuoteGalleryPhotoUrl(photo)}
                        alt={photo.title}
                        loading={index === 0 ? "eager" : "lazy"}
                        decoding="async"
                        onError={() => setFailedIds((ids) => [...ids, photo.id])}
                    />
                    <figcaption className="qgal__cap">
                        {photo.tag ? <small>{photo.tag}</small> : null}
                        <b>{photo.title}</b>
                    </figcaption>
                </figure>
            ))}

            {count > 1 ? (
                <>
                    <button type="button" className="qgal__arrow qgal__arrow--prev" aria-label="Foto anterior" onClick={() => goToByHand(current - 1)}>
                        <PiCaretLeftBold aria-hidden />
                    </button>
                    <button type="button" className="qgal__arrow qgal__arrow--next" aria-label="Foto siguiente" onClick={() => goToByHand(current + 1)}>
                        <PiCaretRightBold aria-hidden />
                    </button>
                    <nav className="qgal__dots" aria-label="Elegir foto">
                        {shown.map((photo, index) => (
                            <button
                                key={photo.id}
                                type="button"
                                className="qgal__dot"
                                aria-label={`Ver foto ${index + 1}`}
                                aria-current={index === current}
                                onClick={() => goToByHand(index)}
                            >
                                <span aria-hidden />
                            </button>
                        ))}
                    </nav>
                </>
            ) : null}
        </section>
    );
};
