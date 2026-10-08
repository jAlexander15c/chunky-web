import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, ReactNode } from "react";
import { Link } from "react-router";
import { useReducedMotion } from "motion/react";
import { PiArrowRightBold, PiCaretLeftBold, PiCaretRightBold, PiPauseFill, PiPlayFill } from "react-icons/pi";

import { Mascot } from "./mascot";
import { usePastaBuilder } from "./use-pasta-builder";
import { Stamp } from "./stamp";
import {
    HOME_SLIDE_THEMES,
    getCategoryByName,
    getCategoryImageUrl,
    getHomeSlideImageUrl,
    getOrderingStatusLabel,
    getSlideLink,
    isAcceptingOrders,
    isSlideVisible,
    trackEvent,
    useCategories,
    useHomeSlides,
    useSettings,
} from "@/helpers";
import type { IHomeSlide } from "@/helpers";

import "./home-carousel.css";

/** Cada cuánto pasa sola a la lámina siguiente. */
const AUTOPLAY_MS = 6000;
/** Después de tocar el carrusel con el dedo no avanza solo durante este rato. */
const TOUCH_HOLD_MS = 10000;

/**
 * La portada de siempre. Sola es la sección del inicio; dentro del carrusel es su primera lámina
 * (un div, para no repetir la región).
 */
const HeroSlide = ({ inCarousel = false }: { inCarousel?: boolean }) => {
    const { categories } = useCategories();
    const { settings } = useSettings();
    const { open: openPastaBuilder } = usePastaBuilder();
    const isOpen = isAcceptingOrders(settings);
    // Los dias de pasta el resto del menu no se vende: no se ofrecen sus accesos
    const isPastaDay = settings.pastaMode;
    const cookiesPhoto = getCategoryImageUrl(getCategoryByName(categories, "galletas"));
    const savoryPhoto = getCategoryImageUrl(getCategoryByName(categories, "salados"));
    const drinksPhoto = getCategoryImageUrl(getCategoryByName(categories, "bebidas"));
    const Wrapper = inCarousel ? "div" : "section";

    return (
        <Wrapper className="hero">
            <div className="hero__copy">
                {isPastaDay && <span className="today-chip"><i aria-hidden />Hoy: día de pasta</span>}
                <h1 className="hero__title">
                    <span className="hero__title-block">De New York a Kioto,</span>
                    <span className="script hero__title-script">con escala en Italia.</span>
                </h1>
                <p className="hero__sub">
                    {isPastaDay
                        ? "Hoy armas tu pasta: eliges la pasta, la salsa y la proteína. También hay bebidas, y todo llega a tu puerta."
                        : "Galletas estilo New York, focaccias con pesto y matcha, nuestra bebida estrella. Arma tu pedido y paga con Yappy."}
                </p>
                <div className="hero__actions">
                    {isPastaDay && settings.pasta ? (
                        <>
                            <button type="button" className="button button--primary button--lg" onClick={openPastaBuilder}>
                                Arma tu pasta <PiArrowRightBold aria-hidden />
                            </button>
                            <Link to="/menu" className="text-link">Ver el menú de hoy</Link>
                        </>
                    ) : (
                        <Link to="/menu" className="button button--primary button--lg">
                            Ver el menú <PiArrowRightBold aria-hidden />
                        </Link>
                    )}
                    <span className="hero__status">{getOrderingStatusLabel(settings, isOpen)}</span>
                </div>
            </div>

            <div className="hero__stage" aria-hidden>
                <div className="hero__disc" />
                <div className="hero__ring" />
                <Stamp src={cookiesPhoto} alt="" caption="New York" code="galletas" rotate={-9} className="hero__stamp hero__stamp--ny stamp-lift--cloud" imagePosition="45% 45%" loading="eager" />
                <Stamp src={savoryPhoto} alt="" caption="Italia" code="salados" rotate={7} className="hero__stamp hero__stamp--it stamp-lift--cloud" imagePosition="85% 20%" loading="eager" />
                <Stamp src={drinksPhoto} alt="" caption="Japón" code="matcha" rotate={6} className="hero__stamp hero__stamp--jp stamp-lift--cloud" imagePosition="28% 55%" loading="eager" />
                <Mascot bob className="hero__mascot" loading="eager" />
            </div>
        </Wrapper>
    );
};

interface IPromoSlideProps {
    slide: Pick<IHomeSlide, "title" | "script" | "tag" | "text" | "buttonLabel" | "theme">;
    /** Foto ya resuelta (la del API o una recién elegida en el tablero). Sin foto la estampilla lleva a la mascota. */
    photoUrl: string | null;
    /** Versión chica para la vista previa del tablero. */
    compact?: boolean;
    /** El botón de verdad (enlace o botón). Sin él se dibuja uno de adorno. */
    action?: ReactNode;
}

/** Una lámina de promo. La usan el carrusel del inicio y la vista previa del tablero. */
export const PromoSlide = ({ slide, photoUrl, compact = false, action }: IPromoSlideProps) => {
    const theme = HOME_SLIDE_THEMES.find((entry) => entry.id === slide.theme) ?? HOME_SLIDE_THEMES[0];

    return (
        <div className={`promo promo--${theme.id}${compact ? " promo--compact" : ""}`}>
            <div className={compact ? "promo__inner" : "promo__inner hero"}>
                <div className="promo__copy">
                    {slide.tag ? <span className="promo__tag">{slide.tag}</span> : null}
                    <h2 className="hero__title">
                        <span className="hero__title-block">{slide.title}</span>
                        <span className="script hero__title-script">{slide.script}</span>
                    </h2>
                    <p className="promo__text">{slide.text}</p>
                    {action ?? (
                        <span className="button button--primary promo__button">
                            {slide.buttonLabel} <PiArrowRightBold aria-hidden />
                        </span>
                    )}
                </div>

                <div className="promo__stage" aria-hidden>
                    <div className="promo__disc" />
                    <div className="promo__ring" />
                    <Stamp
                        src={photoUrl}
                        alt=""
                        caption={theme.captionLeft}
                        code={theme.captionRight}
                        rotate={-4}
                        className="promo__stamp"
                    />
                    {theme.id === "jp" ? <span className="promo__seal" lang="ja">抹茶</span> : null}
                    <Mascot className="promo__mascot" />
                </div>
            </div>
        </div>
    );
};

interface ICarouselProps {
    slides: IHomeSlide[];
}

/** El hero y las promos en una pista con scroll-snap, con puntos, pausa, flechas en escritorio y avance solo. */
const Carousel = ({ slides }: ICarouselProps) => {
    const { categories } = useCategories();
    const { open: openPastaBuilder } = usePastaBuilder();
    const reduceMotion = useReducedMotion();
    const count = slides.length + 1;

    const trackRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef(0);
    const activeRef = useRef(0);
    const isPausedRef = useRef(false);
    const isHoveredRef = useRef(false);
    const hasFocusRef = useRef(false);
    const holdUntilRef = useRef(0);
    const [active, setActive] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        activeRef.current = active;
    }, [active]);

    const goTo = useCallback(
        (index: number) => {
            const track = trackRef.current;
            if (!track) return;
            const next = (index + count) % count;
            setActive(next);
            track.scrollTo({ left: next * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
        },
        [count, reduceMotion]
    );

    /** El punto activo sigue al scroll: lo que se ve manda, sea que llegó por dedo, flecha o avance solo. */
    const syncActive = () => {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
            const track = trackRef.current;
            if (!track || track.clientWidth === 0) return;
            const next = Math.round(track.scrollLeft / track.clientWidth);
            setActive(Math.min(count - 1, Math.max(0, next)));
        });
    };

    useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

    // Si cambia el ancho (girar el teléfono) la lámina visible se queda en su lugar
    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        const observer = new ResizeObserver(() => {
            track.scrollTo({ left: activeRef.current * track.clientWidth, behavior: "auto" });
        });
        observer.observe(track);
        return () => observer.disconnect();
    }, []);

    // Con movimiento reducido nunca avanza solo
    useEffect(() => {
        if (reduceMotion) return;
        const timer = window.setInterval(() => {
            const isHeld =
                isPausedRef.current || isHoveredRef.current || hasFocusRef.current || document.hidden || Date.now() < holdUntilRef.current;
            if (!isHeld) goTo(activeRef.current + 1);
        }, AUTOPLAY_MS);
        return () => window.clearInterval(timer);
    }, [goTo, reduceMotion]);

    const togglePause = () => {
        isPausedRef.current = !isPausedRef.current;
        setIsPaused(isPausedRef.current);
    };

    const handleBlur = (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) hasFocusRef.current = false;
    };

    const isAutoplaying = !reduceMotion && !isPaused;

    const promoSlides = useMemo(
        () =>
            slides.map((slide) => ({
                slide,
                link: getSlideLink(slide, categories),
                photoUrl: getHomeSlideImageUrl(slide),
            })),
        [slides, categories]
    );

    return (
        <section
            className="carousel"
            aria-roledescription="carrusel"
            aria-label="Novedades de Chunky Bites"
            onMouseEnter={() => { isHoveredRef.current = true; }}
            onMouseLeave={() => { isHoveredRef.current = false; }}
            onFocus={() => { hasFocusRef.current = true; }}
            onBlur={handleBlur}
            onTouchStart={() => { holdUntilRef.current = Date.now() + TOUCH_HOLD_MS; }}
        >
            <div className="carousel__viewport">
                <div
                    ref={trackRef}
                    className="carousel__track"
                    aria-live={isAutoplaying ? "off" : "polite"}
                    onScroll={syncActive}
                >
                    <div
                        className="carousel__slide"
                        role="group"
                        aria-roledescription="lámina"
                        aria-label={`1 de ${count}`}
                        inert={active !== 0}
                    >
                        <HeroSlide inCarousel />
                    </div>

                    {promoSlides.map(({ slide, link, photoUrl }, index) => {
                        const trackClick = () => trackEvent("promo_click", slide.id, `${slide.title} ${slide.script}`);
                        const action = link ? (
                            <Link
                                to={link.to}
                                state={link.state}
                                className="button button--primary button--lg promo__button"
                                onClick={trackClick}
                            >
                                {slide.buttonLabel} <PiArrowRightBold aria-hidden />
                            </Link>
                        ) : (
                            <button
                                type="button"
                                className="button button--primary button--lg promo__button"
                                onClick={() => {
                                    trackClick();
                                    openPastaBuilder();
                                }}
                            >
                                {slide.buttonLabel} <PiArrowRightBold aria-hidden />
                            </button>
                        );

                        return (
                            <div
                                key={slide.id}
                                className="carousel__slide"
                                role="group"
                                aria-roledescription="lámina"
                                aria-label={`${index + 2} de ${count}`}
                                inert={active !== index + 1}
                            >
                                <PromoSlide slide={slide} photoUrl={photoUrl} action={action} />
                            </div>
                        );
                    })}
                </div>

                <button type="button" className="carousel__arrow carousel__arrow--prev" aria-label="Lámina anterior" onClick={() => goTo(active - 1)}>
                    <PiCaretLeftBold aria-hidden />
                </button>
                <button type="button" className="carousel__arrow carousel__arrow--next" aria-label="Lámina siguiente" onClick={() => goTo(active + 1)}>
                    <PiCaretRightBold aria-hidden />
                </button>
            </div>

            <nav className="carousel__nav" aria-label="Elegir lámina">
                {Array.from({ length: count }, (_, index) => (
                    <button
                        key={index}
                        type="button"
                        className="carousel__dot"
                        aria-label={`Ver lámina ${index + 1}`}
                        aria-current={index === active}
                        onClick={() => goTo(index)}
                    >
                        <span aria-hidden />
                    </button>
                ))}
                {reduceMotion ? null : (
                    <button
                        type="button"
                        className="carousel__pause"
                        aria-label={isPaused ? "Reanudar el carrusel" : "Pausar el carrusel"}
                        onClick={togglePause}
                    >
                        {isPaused ? <PiPlayFill aria-hidden /> : <PiPauseFill aria-hidden />}
                    </button>
                )}
            </nav>
        </section>
    );
};

/**
 * Lo primero del inicio. La lámina 1 es la portada de siempre; detrás van las promos que se arman
 * en /admin. Sin promos visibles hoy (o si el API falla) se ve solo la portada, sin controles.
 */
export const HomeCarousel = () => {
    const { slides } = useHomeSlides();
    const { settings } = useSettings();
    const visibleSlides = useMemo(() => slides.filter((slide) => isSlideVisible(slide, settings)), [slides, settings]);

    if (visibleSlides.length === 0) return <HeroSlide />;
    return <Carousel key={visibleSlides.length} slides={visibleSlides} />;
};
