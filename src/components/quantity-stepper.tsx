import { PiMinusBold, PiPlusBold, PiTrashBold } from "react-icons/pi";

interface IQuantityStepperProps {
    quantity: number;
    itemName: string;
    onChange: (quantity: number) => void;
    size?: "sm" | "md";
}

export const QuantityStepper = ({ quantity, itemName, onChange, size = "md" }: IQuantityStepperProps) => {
    return (
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
                aria-label={`Agregar otro ${itemName}`}
            >
                <PiPlusBold aria-hidden />
            </button>
        </div>
    );
};
