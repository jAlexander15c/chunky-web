import { PiMinusBold, PiPlusBold, PiTrashBold } from "react-icons/pi";

import { MAX_LINE_QUANTITY } from "@/helpers";

interface IQuantityStepperProps {
    quantity: number;
    itemName: string;
    onChange: (quantity: number) => void;
    size?: "sm" | "md";
    /** Tope de esta línea: el stock de un producto por lotes o el máximo por línea. */
    max?: number;
    /** Aviso de stock bajo el contador ("Solo quedan 3"). */
    note?: string | null;
}

export const QuantityStepper = ({ quantity, itemName, onChange, size = "md", max = MAX_LINE_QUANTITY, note }: IQuantityStepperProps) => {
    const isAtMax = quantity >= max;
    const stepper = (
        <div className={`stepper stepper--${size}`} role="group" aria-label={`Cantidad de ${itemName}`}>
            <button
                type="button"
                className="stepper__button"
                onClick={() => onChange(quantity - 1)}
                aria-label={quantity === 1 ? `Quitar ${itemName}` : `Quitar uno de ${itemName}`}
            >
                {quantity === 1 ? <PiTrashBold aria-hidden /> : <PiMinusBold aria-hidden />}
            </button>
            <span className="stepper__value" aria-live="polite">{quantity}</span>
            <button
                type="button"
                className="stepper__button"
                onClick={() => onChange(quantity + 1)}
                disabled={isAtMax}
                aria-label={isAtMax ? `Máximo ${max} de ${itemName}` : `Agregar otro ${itemName}`}
            >
                <PiPlusBold aria-hidden />
            </button>
        </div>
    );

    if (!note) return stepper;

    return (
        <div className="stepper-wrap">
            {stepper}
            <span className="stepper__note" role="status">{note}</span>
        </div>
    );
};
