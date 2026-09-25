import { reloadApp } from "@/helpers";

import "./update-banner.css";

/** Pastilla fija abajo al centro: hay un despliegue nuevo y se puede recargar ya. No se cierra, desaparece al recargar. */
export const UpdateBanner = ({ isAboveCart = false }: { isAboveCart?: boolean }) => (
    <div className={`update-banner ${isAboveCart ? "update-banner--above-cart" : ""}`} role="status">
        <span className="update-banner__dot" aria-hidden />
        Hay una versión nueva
        <button type="button" className="update-banner__action" onClick={reloadApp}>
            Actualizar
        </button>
    </div>
);
