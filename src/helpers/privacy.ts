/**
 * Versión del aviso de privacidad: la fecha en que cambió su texto. Viaja con cada pedido y
 * cotización para dejar constancia de qué aviso aceptó el cliente. Si cambia el aviso, cambia esta fecha.
 */
export const PRIVACY_NOTICE_VERSION = "2026-09-25";

/** "25 de septiembre de 2026", para mostrarla en /privacidad. */
export const getPrivacyNoticeDateLabel = () =>
    new Date(`${PRIVACY_NOTICE_VERSION}T12:00:00`).toLocaleDateString("es-PA", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

/** Antes se guardaban aquí los celulares que ya aceptaron el aviso. Ya no: la casilla se marca siempre. */
const LEGACY_PRIVACY_STORAGE_KEY = "chunky-privacy-phones";

export const removeLegacyPrivacyPhones = () => {
    try {
        window.localStorage.removeItem(LEGACY_PRIVACY_STORAGE_KEY);
    } catch {
        return;
    }
};
