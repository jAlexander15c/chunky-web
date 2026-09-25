import { useNavigate } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { PiArrowRightBold, PiWhatsappLogoBold } from "react-icons/pi";

import { Stamp } from "./stamp";
import { usePastaBuilder } from "./use-pasta-builder";

import {
    formatPrice,
    getCategoryPresentation,
    getOrderingStatusLabel,
    getWhatsAppUrl,
    isAcceptingOrders,
    isSpecialCategory,
    shouldDisplayCategory,
    useCategories,
    useSettings,
    useSpecialCategories,
    trackEvent,
} from "@/helpers";

const MenuBoardSkeleton = () => (
    <div className="board__rows" aria-busy="true" aria-label="Cargando el menú">
        {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="board__row board__row--skeleton">
                <span className="board__skeleton-line" style={{ width: `${48 + (index % 3) * 12}%` }} />
                <span className="board__skeleton-line board__skeleton-line--thin" />
            </div>
        ))}
    </div>
);

export const MenuBoard = () => {
    const navigate = useNavigate();
    const reduceMotion = useReducedMotion();
    const { categories, loading: isLoadingCategories, error } = useCategories();
    const { settings, isReady: isSettingsReady } = useSettings();
    const { open: openPastaBuilder } = usePastaBuilder();
    const isOpen = isAcceptingOrders(settings);

    // Hasta saber si hoy es dia de pasta no se pinta el tablero: mostraria un menu que cambia
    const loading = isLoadingCategories || !isSettingsReady;
    const pasta = settings.pastaMode ? settings.pasta : null;
    // Las especiales van primero y resaltadas; el menu fijo sigue debajo, como siempre
    const specials = useSpecialCategories();
    const visibleCategories = [
        ...specials.map((special) => special.category),
        ...categories.filter((category) => !isSpecialCategory(category) && shouldDisplayCategory(category, settings)),
    ];
    const getSpecial = (categoryId: string) => specials.find((special) => special.category.id === categoryId);

    return (
        <div className="board">
            <div className="board__head">
                <span className="board__title">Menu</span>
                <span className="board__status">{getOrderingStatusLabel(settings, isOpen)}</span>
            </div>

            {settings.pastaMode && (
                <p className="board__today">Hoy: día de pasta · solo pasta y bebidas, con entrega a domicilio</p>
            )}

            {loading && <MenuBoardSkeleton />}

            {!loading && error && (
                <div className="board__message">
                    <p>No pudimos cargar el tablero. Intenta de nuevo en un momento o pídenos directo.</p>
                    <a className="board__message-link" href={getWhatsAppUrl()} target="_blank" rel="noreferrer" onClick={() => trackEvent("whatsapp_click", "menu")}>
                        <PiWhatsappLogoBold aria-hidden /> Escríbenos por WhatsApp
                    </a>
                </div>
            )}

            {!loading && !error && visibleCategories.length === 0 && !pasta && (
                <div className="board__message">
                    <p>El tablero está vacío por ahora. Vuelve pronto.</p>
                </div>
            )}

            {!loading && !error && (visibleCategories.length > 0 || pasta) && (
                <ul className="board__rows">
                    {pasta && (
                        <li className="board__slot">
                            <button type="button" className="board__row board__row--pasta" onClick={openPastaBuilder}>
                                <span className="board__text">
                                    <span className="board__name">
                                        {pasta.itemName}
                                        <span className="board__tag">{formatPrice(pasta.price)}</span>
                                    </span>
                                    <span className="board__desc">Elige la pasta, la salsa y la proteína</span>
                                </span>
                                <span className="board__go" aria-hidden>
                                    <PiArrowRightBold />
                                </span>
                            </button>
                        </li>
                    )}
                    {visibleCategories.map((category, index) => {
                        const presentation = getCategoryPresentation(category);
                        const special = getSpecial(category.id);
                        const isComingSoon = Boolean(special?.isComingSoon);
                        // Linea punteada entre la ultima especial y el menu fijo
                        const isLastSpecial = Boolean(special) && index === specials.length - 1 && visibleCategories.length > specials.length;
                        const rowVariants = {
                            hidden: { opacity: 0, transform: "translateY(70%)" },
                            visible: { opacity: 1, transform: "translateY(0%)" },
                        };
                        const rowTransition = { duration: 0.3, delay: index * 0.05, ease: [0.34, 1.56, 0.64, 1] as const };
                        const rowContent = (
                            <>
                                {special && (
                                    <Stamp src={special.photo} alt="" size="sm" rotate={-5} className="board__thumb" />
                                )}
                                <span className="board__text">
                                    <span className="board__name">
                                        {category.name}
                                        {special && (
                                            <span className={`board__badge${isComingSoon ? " board__badge--soon" : ""}`}>
                                                {isComingSoon ? "Muy pronto" : "★ Especial"}
                                            </span>
                                        )}
                                        {presentation.schedule && <span className="board__tag">{presentation.schedule}</span>}
                                    </span>
                                    <span className="board__desc">
                                        {isComingSoon
                                            ? "Llega pronto a la barra"
                                            : special?.fromPrice != null
                                                ? `${presentation.description} · desde ${formatPrice(special.fromPrice)}`
                                                : presentation.description}
                                    </span>
                                </span>
                                <span className="board__go" aria-hidden>
                                    {isComingSoon ? null : <PiArrowRightBold />}
                                </span>
                            </>
                        );
                        const rowClassName = `board__row${special ? " board__row--special" : ""}${isComingSoon ? " board__row--soon" : ""}`;

                        return (
                            // El disparo lo observa el <li> (siempre completo): la fila desplazada queda
                            // recortada por el overflow del slot y nunca alcanzaria el umbral por si sola.
                            <motion.li
                                key={category.id}
                                className={`board__slot${isLastSpecial ? " board__slot--last-special" : ""}`}
                                initial={reduceMotion ? false : "hidden"}
                                whileInView="visible"
                                viewport={{ once: true, amount: 0.5 }}
                            >
                                {isComingSoon ? (
                                    // Sin productos a la venta: se anuncia, pero no lleva a ningun lado
                                    <motion.div className={rowClassName} aria-disabled="true" variants={rowVariants} transition={rowTransition}>
                                        {rowContent}
                                    </motion.div>
                                ) : (
                                    <motion.button
                                        type="button"
                                        className={rowClassName}
                                        onClick={() => navigate(`/items?categoryId=${category.id}`, { state: { categoryName: category.name } })}
                                        variants={rowVariants}
                                        transition={rowTransition}
                                    >
                                        {rowContent}
                                    </motion.button>
                                )}
                            </motion.li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
