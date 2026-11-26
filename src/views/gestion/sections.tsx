import type { ReactNode } from "react";

import { COLLABORATOR_ROLES } from "@/helpers";
import type { CollaboratorRole } from "@/helpers";

export type Section = "caja" | "pedidos" | "inventario" | "pasteleria" | "acceso";

export interface ISectionInfo {
    id: Section;
    label: string;
    /** Se ve con cualquiera de estos roles. */
    roles: CollaboratorRole[];
    sub: string;
    icon: ReactNode;
}

export const SECTIONS: ISectionInfo[] = [
    {
        id: "caja",
        label: "Caja",
        roles: ["caja"],
        sub: "Toma las mesas, cobra, lleva el turno y los créditos",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="7" width="20" height="13" rx="2" />
                <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M2 12h20" />
            </svg>
        ),
    },
    {
        id: "pedidos",
        label: "Pedidos",
        roles: ["caja", "repartidor"],
        sub: "Pedidos de la web: confírmalos, prepáralos, llévalos o entrégalos",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 2l-2 4v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4z" />
                <path d="M4 6h16M16 10a4 4 0 0 1-8 0" />
            </svg>
        ),
    },
    {
        id: "inventario",
        label: "Inventario",
        roles: ["inventario"],
        sub: "Compras, conteos, mermas y disponibilidad",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
                <path d="M3 7l9 4 9-4M12 11v10" />
            </svg>
        ),
    },
    {
        id: "pasteleria",
        label: "Repostería",
        roles: ["pastelera"],
        sub: "Cotizaciones, ingredientes y recetas de tus postres",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 21V11h16v10M2 11h20M12 11V7" />
                <circle cx="12" cy="5" r="2" />
            </svg>
        ),
    },
    {
        // Va al final y la ve cualquiera con un rol: es de la persona, no de su trabajo
        id: "acceso",
        // Corto: en la barra de abajo del teléfono caben cinco secciones
        label: "Acceso",
        roles: COLLABORATOR_ROLES,
        sub: "Tu PIN y tus equipos con Face ID",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                <path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1.1 3.6 1.1 5 0" />
            </svg>
        ),
    },
];
