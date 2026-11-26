/**
 * Un solo login para el equipo: el tablero se abre con la misma sesión de /gestion
 * (x-gestion-token). La llave de recuperación (ADMIN_PIN) sigue con su sesión aparte
 * (x-admin-token). El tablero avisa aquí con qué sesión se abrió.
 *
 * Vive aparte y sin imports para que admin, combos o inventario lo usen sin ciclos.
 */
let unifiedAdminToken: string | null = null;

/** La sesión de /gestion que tiene abierto el tablero, o null si es la llave de recuperación. */
export const setUnifiedAdminToken = (token: string | null) => {
    unifiedAdminToken = token;
};

export const getAdminAuthHeaders = (token: string): Record<string, string> =>
    token === unifiedAdminToken ? { "x-gestion-token": token } : { "x-admin-token": token };
