import type { ReactNode } from "react";

/** Las secciones del tablero. El id es el que va en la dirección: /admin?s=inventario. */
export type AdminSection = "resumen" | "ventas" | "web" | "clientes" | "inventario" | "menu" | "caja" | "local" | "colaboradores" | "acceso";

export interface IAdminSectionInfo {
    id: AdminSection;
    label: string;
    /** La línea bajo el título de la sección. */
    subtitle: string;
    /** De dónde salen los datos: nuestra base o Loyverse. */
    source?: "Postgres" | "Loyverse" | "Loyverse + Postgres";
    icon: ReactNode;
}

interface IAdminSectionGroup {
    label: string;
    sections: IAdminSectionInfo[];
}

/** Analítica para mirar cómo va el negocio; Recursos para mover lo que se vende y se cobra; Ajustes para lo que casi no cambia. */
export const ADMIN_GROUPS: IAdminSectionGroup[] = [
    {
        label: "Analítica",
        sections: [
            {
                id: "resumen",
                label: "Resumen",
                subtitle: "Lo que necesita atención y cómo va el día.",
                source: "Loyverse + Postgres",
                icon: (
                    <>
                        <path d="M3 11l9-7 9 7" />
                        <path d="M5 10v10h14V10M10 20v-6h4v6" />
                    </>
                ),
            },
            {
                id: "ventas",
                label: "Ventas",
                subtitle: "Mostrador y web, cómo pagan, salidas de efectivo y cuándo se vende.",
                source: "Postgres",
                icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
            },
            {
                // Embudo de compra, cotizador y clics de la web pública
                id: "web",
                label: "Web",
                subtitle: "Qué hace la gente antes de pagar o de cotizar. Sesiones son pestañas distintas.",
                source: "Postgres",
                icon: <path d="M4 4l7 17 2.5-7.5L21 11z" />,
            },
            {
                // Quién compra en la web y en el local
                id: "clientes",
                label: "Clientes",
                subtitle: "Quién compra en la web y en el local. Se registran en la web con su permiso.",
                source: "Postgres",
                icon: (
                    <>
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                    </>
                ),
            },
        ],
    },
    {
        label: "Recursos",
        sections: [
            {
                id: "inventario",
                label: "Inventario",
                subtitle: "Qué comprar, cuánto alcanza y cuándo se contó.",
                source: "Postgres",
                icon: (
                    <>
                        <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
                        <path d="M3 7l9 4 9-4M12 11v10" />
                    </>
                ),
            },
            {
                id: "menu",
                label: "Menú",
                subtitle: "Lo que crees aquí aparece en la web y en el POS de Loyverse.",
                source: "Loyverse",
                icon: (
                    <>
                        <path d="M5 3h11l3 3v15H5z" />
                        <path d="M9 9h6M9 13h6M9 17h4" />
                    </>
                ),
            },
            {
                id: "caja",
                label: "Caja",
                subtitle: "Turno en curso, mesas, créditos y fondo aparte.",
                icon: (
                    <>
                        <rect x="2" y="7" width="20" height="13" rx="2" />
                        <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M2 12h20" />
                    </>
                ),
            },
        ],
    },
    {
        label: "Ajustes",
        sections: [
            {
                id: "local",
                label: "Local",
                subtitle: "Horario, delivery, pago con tarjeta y modo pasta.",
                icon: (
                    <>
                        <path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9" />
                        <path d="M9 20v-6h6v6" />
                    </>
                ),
            },
            {
                id: "colaboradores",
                label: "Colaboradores",
                subtitle: "Entran con su PIN o Face ID y ven solo lo que su rol permite. Admin abre este tablero.",
                source: "Postgres",
                icon: (
                    <>
                        <circle cx="9" cy="8" r="3.5" />
                        <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3.2 3.2 0 0 1 0 6M22 20c0-2.8-1.6-4.7-4-5.6" />
                    </>
                ),
            },
            {
                // Face ID, PIN propio y avisos de insumos de quien tiene el tablero abierto
                id: "acceso",
                label: "Mi acceso",
                subtitle: "Tu PIN, tus equipos con Face ID y los avisos de insumos en este teléfono.",
                icon: (
                    <>
                        <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
                        <path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1.1 3.6 1.1 5 0" />
                    </>
                ),
            },
        ],
    },
];

export const ADMIN_SECTIONS = ADMIN_GROUPS.flatMap((group) => group.sections);

/** Lee la sección de la dirección. "tablero" era el nombre viejo del resumen. */
export const getSectionFromParam = (value: string | null): AdminSection => {
    if (value === "tablero") return "resumen";
    return ADMIN_SECTIONS.find((section) => section.id === value)?.id ?? "resumen";
};
