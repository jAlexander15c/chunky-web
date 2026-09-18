import { useNavigate } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { PiArrowRightBold, PiWhatsappLogoBold } from "react-icons/pi";

import {
    getCategoryPresentation,
    getOpeningStatusLabel,
    getWhatsAppUrl,
    isWithinOperatingHours,
    shouldDisplayCategory,
    useCategories,
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
    const { categories, loading, error } = useCategories();
    const isOpen = isWithinOperatingHours();

    const visibleCategories = categories.filter((category) => shouldDisplayCategory(category));

    return (
        <div className="board">
            <div className="board__head">
                <span className="board__title">Menu</span>
                <span className="board__status">{getOpeningStatusLabel(isOpen)}</span>
            </div>

            {loading && <MenuBoardSkeleton />}

            {!loading && error && (
                <div className="board__message">
                    <p>No pudimos cargar el tablero. Intenta de nuevo en un momento o pídenos directo.</p>
                    <a className="board__message-link" href={getWhatsAppUrl()} target="_blank" rel="noreferrer">
                        <PiWhatsappLogoBold aria-hidden /> Escríbenos por WhatsApp
                    </a>
                </div>
            )}

            {!loading && !error && visibleCategories.length === 0 && (
                <div className="board__message">
                    <p>El tablero está vacío por ahora. Vuelve pronto.</p>
                </div>
            )}

            {!loading && !error && visibleCategories.length > 0 && (
                <ul className="board__rows">
                    {visibleCategories.map((category, index) => {
                        const presentation = getCategoryPresentation(category.color);

                        return (
                            <li key={category.id} className="board__slot">
                                <motion.button
                                    type="button"
                                    className="board__row"
                                    onClick={() => navigate(`/items?categoryId=${category.id}`, { state: { categoryName: category.name } })}
                                    initial={reduceMotion ? false : { opacity: 0, transform: "translateY(70%)" }}
                                    whileInView={{ opacity: 1, transform: "translateY(0%)" }}
                                    viewport={{ once: true, amount: 0.6 }}
                                    transition={{ duration: 0.3, delay: index * 0.05, ease: [0.34, 1.56, 0.64, 1] }}
                                >
                                    <span className="board__text">
                                        <span className="board__name">
                                            {category.name}
                                            {presentation.schedule && <span className="board__tag">{presentation.schedule}</span>}
                                        </span>
                                        <span className="board__desc">{presentation.description}</span>
                                    </span>
                                    <span className="board__go" aria-hidden>
                                        <PiArrowRightBold />
                                    </span>
                                </motion.button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
