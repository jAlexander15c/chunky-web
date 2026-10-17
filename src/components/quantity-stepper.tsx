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
    /** Sin `min`, en 1 el botón quita la línea (carrito). Con `min`, el contador no baja de ahí. */
    min?: number;
}

export const QuantityStepper = ({ quantity, itemName, onChange, size = "md", max = MAX_LINE_QUANTITY, note, min }: IQuantityStepperProps) => {
    const isAtMax = quantity >= max;
    const isAtMin = min !== undefined && quantity <= min;
    const canRemove = min === undefined && quantity === 1;
    const stepper = (
        <div className={`stepper stepper--${size}`} role="group" aria-label={`Cantidad de ${itemName}`}>
            <button
                type="button"
                className="stepper__button"
                onClick={() => onChange(quantity - 1)}
                disabled={isAtMin}
                aria-label={canRemove ? `Quitar ${itemName}` : isAtMin ? `Mínimo ${min} de ${itemName}` : `Quitar uno de ${itemName}`}
            >
                {canRemove ? <PiTrashBold aria-hidden /> : <PiMinusBold aria-hidden />}
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
