import { useNavigate } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { PiArrowRightBold, PiWhatsappLogoBold } from "react-icons/pi";

import { usePastaBuilder } from "./use-pasta-builder";

import {
    formatPrice,
    getCategoryPresentation,
    getOrderingStatusLabel,
    getWhatsAppUrl,
    isAcceptingOrders,
    shouldDisplayCategory,
    useCategories,
    useSettings,
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
    const isOpen = isAcceptingOrders(settings.pastaMode);

    // Hasta saber si hoy es dia de pasta no se pinta el tablero: mostraria un menu que cambia
    const loading = isLoadingCategories || !isSettingsReady;
    const pasta = settings.pastaMode ? settings.pasta : null;
    const visibleCategories = categories.filter((category) => shouldDisplayCategory(category, new Date(), settings));

    return (
        <div className="board">
            <div className="board__head">
                <span className="board__title">Menu</span>
                <span className="board__status">{getOrderingStatusLabel(settings.pastaMode, isOpen)}</span>
            </div>

            {settings.pastaMode && (
                <p className="board__today">Hoy: día de pasta · solo pasta y bebidas, con entrega a domicilio</p>
            )}

            {loading && <MenuBoardSkeleton />}

            {!loading && error && (
                <div className="board__message">
                    <p>No pudimos cargar el tablero. Intenta de nuevo en un momento o pídenos directo.</p>
                    <a className="board__message-link" href={getWhatsAppUrl()} target="_blank" rel="noreferrer">
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

                        return (
                            // El disparo lo observa el <li> (siempre completo): la fila desplazada queda
                            // recortada por el overflow del slot y nunca alcanzaria el umbral por si sola.
                            <motion.li
                                key={category.id}
                                className="board__slot"
                                initial={reduceMotion ? false : "hidden"}
                                whileInView="visible"
                                viewport={{ once: true, amount: 0.5 }}
                            >
                                <motion.button
                                    type="button"
                                    className="board__row"
                                    onClick={() => navigate(`/items?categoryId=${category.id}`, { state: { categoryName: category.name } })}
                                    variants={{
                                        hidden: { opacity: 0, transform: "translateY(70%)" },
                                        visible: { opacity: 1, transform: "translateY(0%)" },
                                    }}
                                    transition={{ duration: 0.3, delay: index * 0.05, ease: [0.34, 1.56, 0.64, 1] }}
                                >
                                    <span className="board__text">
                                        <span className="board__name">
                                            {category.name}
                                            {presentation.schedule && <span className="board__tag">{presentation.schedule}</span>}
                                        </span>
                                        {presentation.description && <span className="board__desc">{presentation.description}</span>}
                                    </span>
                                    <span className="board__go" aria-hidden>
                                        <PiArrowRightBold />
                                    </span>
                                </motion.button>
                            </motion.li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
