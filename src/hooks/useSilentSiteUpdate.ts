import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

import { useCart, usePastaBuilder } from "@/components";
import { reloadApp, useAppUpdate } from "@/helpers";

// Tras tanto tiempo en otra pestana, recargar al volver se siente como abrir el sitio de nuevo
const LONG_HIDDEN_MS = 30 * 60 * 1000;

/** El pedido en curso se sigue en vivo y el cotizador guarda lo elegido solo en memoria. */
const isReloadSafePath = (pathname: string) => !pathname.startsWith("/pedido/") && pathname !== "/cotizador";

/**
 * Sitio publico: al haber una version nueva se recarga sin avisar, solo en momentos que se sienten
 * como navegacion normal (cambio de pagina o volver tras mucho rato). Nunca con carrito o armador abiertos.
 */
export const useSilentSiteUpdate = () => {
    const isUpdateAvailable = useAppUpdate();
    const { pathname } = useLocation();
    const { isOpen: isCartOpen } = useCart();
    const { isOpen: isPastaBuilderOpen } = usePastaBuilder();
    const lastPathRef = useRef(pathname);

    const canReload = isUpdateAvailable && !isCartOpen && !isPastaBuilderOpen;

    // Cambio de pagina: la URL ya es la nueva, recargar la trae con el build nuevo
    useEffect(() => {
        if (lastPathRef.current === pathname) return;
        lastPathRef.current = pathname;
        if (canReload && !pathname.startsWith("/pedido/")) reloadApp();
    }, [pathname, canReload]);

    useEffect(() => {
        if (!canReload) return;
        let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;

        const reloadAfterLongHide = () => {
            if (document.visibilityState === "hidden") {
                hiddenAt = Date.now();
                return;
            }
            if (hiddenAt && Date.now() - hiddenAt >= LONG_HIDDEN_MS && isReloadSafePath(window.location.pathname)) reloadApp();
        };

        document.addEventListener("visibilitychange", reloadAfterLongHide);
        return () => document.removeEventListener("visibilitychange", reloadAfterLongHide);
    }, [canReload]);
};
