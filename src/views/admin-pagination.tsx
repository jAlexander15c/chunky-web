interface IAdminPaginationProps {
    /** Empieza en 1. */
    page: number;
    pageSize: number;
    total: number;
    onChange: (page: number) => void;
}

/** Hasta 7 botones: la primera, la última y las vecinas de la actual; el resto se resume con "…". */
const getPageButtons = (page: number, pageCount: number): (number | "…")[] => {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

    const start = Math.max(2, Math.min(page - 1, pageCount - 4));
    const end = Math.min(pageCount - 1, Math.max(page + 1, 5));
    const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);

    return [1, ...(start > 2 ? ["…" as const] : []), ...middle, ...(end < pageCount - 1 ? ["…" as const] : []), pageCount];
};

export const AdminPagination = ({ page, pageSize, total, onChange }: IAdminPaginationProps) => {
    if (total === 0) return null;

    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(total, page * pageSize);

    return (
        <div className="adm-pager">
            <span className="adm-pager__info">
                Mostrando {first}–{last} de {total.toLocaleString("es-PA")}
            </span>
            {pageCount > 1 ? (
                <nav className="adm-pager__btns" aria-label="Páginas">
                    <button
                        type="button"
                        className="adm-pg"
                        disabled={page <= 1}
                        onClick={() => onChange(page - 1)}
                        aria-label="Página anterior"
                    >
                        ‹
                    </button>
                    {getPageButtons(page, pageCount).map((entry, index) =>
                        entry === "…" ? (
                            <span key={`hueco-${index}`} className="adm-pg adm-pg--gap" aria-hidden="true">…</span>
                        ) : (
                            <button
                                key={entry}
                                type="button"
                                className="adm-pg"
                                aria-current={entry === page ? "page" : undefined}
                                onClick={() => onChange(entry)}
                            >
                                {entry}
                            </button>
                        )
                    )}
                    <button
                        type="button"
                        className="adm-pg"
                        disabled={page >= pageCount}
                        onClick={() => onChange(page + 1)}
                        aria-label="Página siguiente"
                    >
                        ›
                    </button>
                </nav>
            ) : null}
        </div>
    );
};
