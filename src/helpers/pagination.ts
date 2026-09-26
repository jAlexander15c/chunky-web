/** Los elementos de una pagina (empieza en 1). */
export const getPageSlice = <T>(items: T[], page: number, pageSize: number) =>
    items.slice((page - 1) * pageSize, page * pageSize);

/** Si un filtro o una carga deja menos páginas, la actual no puede quedar fuera. */
export const getSafePage = (page: number, total: number, pageSize: number) =>
    Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
