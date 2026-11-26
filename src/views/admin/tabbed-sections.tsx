import type { ReactNode } from "react";

import { AdminCollaborators } from "../admin-collaborators";
import { AdminCombos } from "../admin-combos";
import { AdminFinance } from "../admin-finance";
import { AdminHours } from "../admin-hours";
import { AdminMenu } from "../admin-menu";
import { AdminPromos } from "../admin-promos";
import { AdminShifts } from "../admin-shifts";
import { CardPaymentsPanel } from "./card-payments-panel";
import { ClientUpdateNoticePanel } from "./client-update-notice-panel";
import { PedidosYaPanel } from "./pedidosya-panel";
import { SALES_TABS, useSalesTab } from "./sales-tab";
import { SectionTabs } from "./section-tabs";
import { useSectionTab } from "./use-section-tab";
import type { ISectionTab } from "./use-section-tab";
import { TablesPanel } from "./tables-panel";

interface ISessionProps {
    token: string;
    onSessionExpired: () => void;
}

/* ============ Ventas | Cierres ============ */

interface ISalesSectionProps extends ISessionProps {
    refreshKey: number;
    from: string;
    to: string;
}

export const SalesSection = ({ token, onSessionExpired, refreshKey, from, to }: ISalesSectionProps) => {
    const [tab, changeTab] = useSalesTab();

    return (
        <>
            <SectionTabs label="Qué mirar de las ventas" tabs={SALES_TABS} value={tab} onChange={changeTab} />
            {tab === "ventas" ? (
                <AdminFinance token={token} onSessionExpired={onSessionExpired} refreshKey={refreshKey} from={from} to={to} />
            ) : (
                <AdminShifts token={token} onSessionExpired={onSessionExpired} />
            )}
        </>
    );
};

/* ============ Menú: Productos | Promos | Combos ============ */

type MenuTab = "productos" | "promos" | "combos";

const MENU_TABS: ISectionTab<MenuTab>[] = [
    { id: "productos", label: "Productos" },
    { id: "promos", label: "Promos" },
    { id: "combos", label: "Combos" },
];

export const MenuSection = ({ token, onSessionExpired }: ISessionProps) => {
    const [tab, changeTab] = useSectionTab(MENU_TABS);

    return (
        <>
            <SectionTabs label="Qué parte del menú" tabs={MENU_TABS} value={tab} onChange={changeTab} />
            {tab === "productos" ? <AdminMenu token={token} onSessionExpired={onSessionExpired} /> : null}
            {tab === "promos" ? <AdminPromos token={token} onSessionExpired={onSessionExpired} /> : null}
            {tab === "combos" ? <AdminCombos token={token} onSessionExpired={onSessionExpired} /> : null}
        </>
    );
};

/* ============ Ajustes: Local | Equipo | PedidosYa ============ */

type SettingsTab = "local" | "equipo" | "pedidosya";

const SETTINGS_TABS: ISectionTab<SettingsTab>[] = [
    { id: "local", label: "Local" },
    { id: "equipo", label: "Equipo" },
    { id: "pedidosya", label: "PedidosYa" },
];

export const SettingsSection = ({ token, onSessionExpired }: ISessionProps) => {
    const [tab, changeTab] = useSectionTab(SETTINGS_TABS);

    const views: Record<SettingsTab, () => ReactNode> = {
        // Horario a la izquierda y los demás ajustes a la derecha en pantallas anchas.
        // Delivery, modo pasta y abierto/cerrado de hoy viven en el Resumen
        local: () => (
            <div className="adm-local">
                <AdminHours token={token} onSessionExpired={onSessionExpired} />
                <div className="adm-local__switches">
                    <TablesPanel token={token} onSessionExpired={onSessionExpired} />
                    <CardPaymentsPanel token={token} onSessionExpired={onSessionExpired} />
                    <ClientUpdateNoticePanel token={token} onSessionExpired={onSessionExpired} />
                </div>
            </div>
        ),
        equipo: () => <AdminCollaborators token={token} onSessionExpired={onSessionExpired} />,
        pedidosya: () => <PedidosYaPanel token={token} onSessionExpired={onSessionExpired} />,
    };

    return (
        <>
            <SectionTabs label="Qué ajustar" tabs={SETTINGS_TABS} value={tab} onChange={changeTab} />
            {views[tab]()}
        </>
    );
};
