interface IGestionPagerProps {
    /** Empieza en 1. */
    page: number;
    pageCount: number;
    onChange: (page: number) => void;
}

/** Anterior / siguiente con botones grandes: se usa con el dedo en el teléfono. */
export const GestionPager = ({ page, pageCount, onChange }: IGestionPagerProps) => {
    if (pageCount <= 1) return null;

    return (
        <nav className="ges-pager" aria-label="Páginas">
            <button
                type="button"
                className="ges-btn ges-btn--sm"
                disabled={page <= 1}
                onClick={() => onChange(page - 1)}
            >
                ‹ Anterior
            </button>
            <span>
                {page} de {pageCount}
            </span>
            <button
                type="button"
                className="ges-btn ges-btn--sm"
                disabled={page >= pageCount}
                onClick={() => onChange(page + 1)}
            >
                Siguiente ›
            </button>
        </nav>
    );
};
