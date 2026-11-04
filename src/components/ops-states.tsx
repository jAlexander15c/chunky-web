import type { ReactNode } from "react";

import mascota from "@/assets/logos/mascota.png";

interface IOpsEmptyProps {
    title: string;
    /** Qué hacer para que aparezca algo aquí. */
    hint?: string;
    action?: ReactNode;
}

/** Vacío de las pantallas del equipo: dice qué va aquí y cómo llenarlo. Estilos en styles/ops.css. */
export const OpsEmpty = ({ title, hint, action }: IOpsEmptyProps) => (
    <div className="ops-empty">
        <img src={mascota} alt="" />
        <div>
            <b>{title}</b>
            {hint ? <p>{hint}</p> : null}
            {action}
        </div>
    </div>
);

/** Mientras cargan los datos: barras con la forma del contenido, sin ruedita. */
export const OpsSkeleton = ({ rows = 3, label = "Cargando…" }: { rows?: number; label?: string }) => (
    <div className="ops-skel" role="status" aria-label={label}>
        {Array.from({ length: rows }, (_value, index) => (
            <span key={index} />
        ))}
    </div>
);
