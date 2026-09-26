import { useState } from "react";

import { QuotesIncome, QuotesPanel } from "@/components";

type PasteleriaTab = "cotizaciones" | "ingresos";

const TABS: { id: PasteleriaTab; label: string }[] = [
    { id: "cotizaciones", label: "Cotizaciones" },
    { id: "ingresos", label: "Ingresos" },
];

interface IGestionPasteleriaProps {
    token: string;
    onSessionExpired: () => void;
}

/** Lo de la pastelera en una sola sección: las cotizaciones y lo que dejan. */
export const GestionPasteleria = ({ token, onSessionExpired }: IGestionPasteleriaProps) => {
    const [tab, setTab] = useState<PasteleriaTab>("cotizaciones");

    return (
        <>
            <div className="ges-tabs" role="tablist" aria-label="Pastelería">
                {TABS.map((one) => (
                    <button
                        key={one.id}
                        type="button"
                        role="tab"
                        className="ges-tab"
                        aria-selected={tab === one.id}
                        onClick={() => setTab(one.id)}
                    >
                        {one.label}
                    </button>
                ))}
            </div>

            <div className="ges-quotes" role="tabpanel">
                {tab === "cotizaciones" ? (
                    <QuotesPanel token={token} onSessionExpired={onSessionExpired} />
                ) : (
                    <QuotesIncome token={token} onSessionExpired={onSessionExpired} />
                )}
            </div>
        </>
    );
};
