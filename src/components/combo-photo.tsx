import { useState } from "react";

import "./combo-sheet.css";

import mascota from "@/assets/logos/mascota.png";
import { getComboImageUrl } from "@/helpers";
import type { IPublicCombo } from "@/helpers";

/** La foto de un combo (la suya o la del primer producto); si no carga, un fondo de marca con la mascota. */
export const ComboPhoto = ({ combo, className = "" }: { combo: Pick<IPublicCombo, "id" | "imageVersion">; className?: string }) => {
    const [hasFailed, setHasFailed] = useState(false);

    return (
        <div className={`combo-photo ${className}`}>
            {hasFailed ? (
                <img className="combo-photo__mascot" src={mascota} alt="" />
            ) : (
                <img src={getComboImageUrl(combo)} alt="" loading="lazy" onError={() => setHasFailed(true)} />
            )}
        </div>
    );
};
