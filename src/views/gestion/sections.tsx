import type { ReactNode } from "react";

import { COLLABORATOR_ROLES } from "@/helpers";
import type { CollaboratorRole } from "@/helpers";

export type Section = "caja" | "cocina" | "delivery" | "inventario" | "pasteleria" | "acceso";

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
        id: "cocina",
        label: "Cocina",
        roles: ["caja"],
        sub: "Pedidos de la web: acéptalos, márcalos listos y entrega lo que se retira",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 13.9A4 4 0 0 1 7 6a5 5 0 0 1 10 0 4 4 0 0 1 1 7.9V20H6z" />
                <path d="M6 17h12" />
            </svg>
        ),
    },
    {
        id: "delivery",
        label: "Delivery",
        roles: ["caja", "repartidor"],
        sub: "Pedidos por WhatsApp y a domicilio: confírmalos, manda el enlace y llévalos",
        icon: (
            <svg className="ges-nav__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="6" cy="17" r="3" />
                <circle cx="18" cy="17" r="3" />
                <path d="M9 17h6l-2-7H9M13 10h3l2 7M5 10h4" />
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
