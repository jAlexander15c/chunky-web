import { useState } from "react";

import { AdminHomeSlides } from "./admin-home-slides";
import { AdminQuoteGallery } from "./admin-quote-gallery";

type SiteTab = "inicio" | "cotizador";

/** /admin › Recursos › Web: el carrusel del inicio y la galería del cotizador. */
export const AdminSite = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [tab, setTab] = useState<SiteTab>("inicio");

    return (
        <>
            <div className="adm-tabs" role="tablist" aria-label="Qué parte de la web">
                <button type="button" role="tab" className="adm-tab" aria-selected={tab === "inicio"} onClick={() => setTab("inicio")}>
                    Inicio
                </button>
                <button type="button" role="tab" className="adm-tab" aria-selected={tab === "cotizador"} onClick={() => setTab("cotizador")}>
                    Cotizador
                </button>
            </div>

            {tab === "inicio" ? (
                <AdminHomeSlides token={token} onSessionExpired={onSessionExpired} />
            ) : (
                <AdminQuoteGallery token={token} onSessionExpired={onSessionExpired} />
            )}
        </>
    );
};
