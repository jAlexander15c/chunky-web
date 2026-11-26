import type { ReactNode } from "react";

/** Las secciones del tablero. El id es el que va en la dirección: /admin?s=inventario. */
export type AdminSection = "resumen" | "ventas" | "web" | "clientes" | "inventario" | "menu" | "pagina" | "ajustes";

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

/** Analítica para mirar cómo va el negocio; Recursos para lo que se vende, lo que se compra y lo que casi no cambia. */
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
                subtitle: "Mostrador y web, cómo pagan, salidas de efectivo, cuándo se vende y los cierres de caja.",
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
                // Productos, promos y combos: pestañas de la misma sección
                id: "menu",
                label: "Menú",
                subtitle: "Lo que creas aquí aparece en la web y en el POS de Loyverse.",
                source: "Loyverse + Postgres",
                icon: (
                    <>
                        <path d="M5 3h11l3 3v15H5z" />
                        <path d="M9 9h6M9 13h6M9 17h4" />
                    </>
                ),
            },
            {
                // Carrusel del inicio y galería del cotizador (antes "Web" con el id inicio)
                id: "pagina",
                label: "Página",
                subtitle: "Lo que ve la gente en la página: el carrusel del inicio y la galería del cotizador.",
                source: "Postgres",
                icon: (
                    <>
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="M3 15l5-4 4 3 3-2 6 4M8.5 9.5h.01" />
                    </>
                ),
            },
            {
                // Local (horario, mesas, pagos), Equipo y PedidosYa: lo que casi no cambia
                id: "ajustes",
                label: "Ajustes",
                subtitle: "Horario, mesas, pago con tarjeta, equipo y PedidosYa.",
                icon: (
                    <>
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
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

/** A dónde va un enlace ?s= de antes de reunir las secciones: la sección nueva y su pestaña. */
const LEGACY_SECTIONS: Record<string, { section: AdminSection; tab?: string }> = {
    caja: { section: "ventas", tab: "cierres" },
    promos: { section: "menu", tab: "promos" },
    combos: { section: "menu", tab: "combos" },
    inicio: { section: "pagina" },
    local: { section: "ajustes", tab: "local" },
    colaboradores: { section: "ajustes", tab: "equipo" },
    pedidosya: { section: "ajustes", tab: "pedidosya" },
};

/** El destino de un ?s= viejo, o null si es de ahora. "acceso" lo resuelve quien sabe si hay sesión unificada. */
export const getLegacySectionTarget = (value: string | null) => (value ? (LEGACY_SECTIONS[value] ?? null) : null);

/** Las secciones del tablero con su enlace, para el menú de Gestión. */
export const getAdminSectionHref = (id: AdminSection) => (id === "resumen" ? "/admin" : `/admin?s=${id}`);

/** Qué secciones usan el período del encabezado (en Ventas, solo la pestaña de ventas). */
export const PERIOD_SECTIONS: AdminSection[] = ["ventas", "web", "inventario"];

export interface IAdminOperationLink {
    id: string;
    label: string;
    subtitle: string;
    /** Siempre una sección de Gestión (/gestion?s=...). */
    href: string;
    icon: ReactNode;
}

/** Con la sesión unificada, el tablero también lleva a la operación del día. Mismos nombres que en Gestión. */
export const ADMIN_OPERATION_LINKS: IAdminOperationLink[] = [
    {
        id: "caja",
        label: "Caja",
        subtitle: "Toma las mesas, envía a cocina y cobra",
        href: "/gestion?s=caja",
        icon: (
            <>
                <rect x="2" y="7" width="20" height="13" rx="2" />
                <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M2 12h20" />
            </>
        ),
    },
    {
        id: "cocina",
        label: "Cocina",
        subtitle: "Pedidos de la web: acéptalos y márcalos listos",
        href: "/gestion?s=cocina",
        icon: (
            <>
                <path d="M6 13.9A4 4 0 0 1 7 6a5 5 0 0 1 10 0 4 4 0 0 1 1 7.9V20H6z" />
                <path d="M6 17h12" />
            </>
        ),
    },
    {
        id: "delivery",
        label: "Delivery",
        subtitle: "Pedidos por WhatsApp y a domicilio",
        href: "/gestion?s=delivery",
        icon: (
            <>
                <circle cx="6" cy="17" r="3" />
                <circle cx="18" cy="17" r="3" />
                <path d="M9 17h6l-2-7H9M13 10h3l2 7M5 10h4" />
            </>
        ),
    },
    {
        id: "inventario",
        label: "Inventario",
        subtitle: "Compras, conteos, mermas y disponibilidad",
        href: "/gestion?s=inventario",
        icon: (
            <>
                <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
                <path d="M3 7l9 4 9-4M12 11v10" />
            </>
        ),
    },
];
