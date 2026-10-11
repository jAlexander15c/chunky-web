import { useCallback, useEffect, useState } from "react";

import { fetchCatalog } from "@/helpers";
import type { ICatalog } from "@/helpers";

/**
 * El catálogo publicado de Repostería (GET /quotes/catalog): lo usan el cotizador de la web y el
 * registro manual. `reload` vuelve a mostrar el esqueleto (Reintentar); `refresh` lo actualiza
 * sin mover la pantalla (cuando el precio cambió mientras el cliente armaba).
 */
export const useCatalog = () => {
    const [catalog, setCatalog] = useState<ICatalog | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async (signal?: AbortSignal) => {
        try {
            const data = await fetchCatalog(signal);
            setCatalog(data);
            setError("");
        } catch {
            if (signal?.aborted) return;
            setError("No pudimos cargar el menú de postres. Revisa tu conexión.");
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const reload = useCallback(() => {
        setIsLoading(true);
        return load();
    }, [load]);

    return { catalog, isLoading, error, reload, refresh: load };
};
