import { useState } from "react";

import { PastryIngredients, PastryRecipes, QuotesIncome, QuotesPanel, SheetSelect } from "@/components";

type PasteleriaTab = "cotizaciones" | "ingresos" | "ingredientes" | "recetas";

const TABS: { id: PasteleriaTab; label: string }[] = [
    { id: "cotizaciones", label: "Cotizaciones" },
    { id: "ingresos", label: "Ingresos" },
    { id: "ingredientes", label: "Ingredientes" },
    { id: "recetas", label: "Recetas" },
];

interface IGestionPasteleriaProps {
    token: string;
    onSessionExpired: () => void;
}

/** Lo de la pastelera en una sola sección: las cotizaciones, lo que dejan y las recetas que las alimentan. */
export const GestionPasteleria = ({ token, onSessionExpired }: IGestionPasteleriaProps) => {
    const [tab, setTab] = useState<PasteleriaTab>("cotizaciones");

    return (
        <>
            {/* En el teléfono cuatro pestañas no caben: se eligen en una hoja */}
            <SheetSelect<PasteleriaTab>
                label="Repostería"
                className="ges-select"
                value={tab}
                options={TABS}
                onChange={setTab}
            />

            <div className="ges-tabs fsheet-wide" role="tablist" aria-label="Repostería">
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
                ) : tab === "ingresos" ? (
                    <QuotesIncome token={token} onSessionExpired={onSessionExpired} />
                ) : tab === "ingredientes" ? (
                    <PastryIngredients token={token} onSessionExpired={onSessionExpired} />
                ) : (
                    <PastryRecipes token={token} onSessionExpired={onSessionExpired} />
                )}
            </div>
        </>
    );
};
