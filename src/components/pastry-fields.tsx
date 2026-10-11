import { useState } from "react";
import type { InputHTMLAttributes } from "react";

import { parseDecimal } from "@/helpers";

interface IDecimalInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
    value: number;
    onChange: (value: number) => void;
}

/**
 * Campo de número que deja escribir "2," o "0.5" sin saltos: guarda el texto y avisa el número.
 * Si el valor cambia desde afuera (se quitó una fila, se actualizó un costo), muestra el nuevo.
 */
export const DecimalInput = ({ value, onChange, className = "pa-input", ...rest }: IDecimalInputProps) => {
    const [text, setText] = useState(value ? String(value) : "");
    const [seen, setSeen] = useState(value);

    if (value !== seen) {
        setSeen(value);
        if (parseDecimal(text) !== value) setText(value ? String(value) : "");
    }

    return (
        <input
            {...rest}
            className={className}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => {
                const next = event.target.value.replace(",", ".");
                if (!/^\d*\.?\d*$/.test(next)) return;
                setText(next);
                setSeen(parseDecimal(next));
                onChange(parseDecimal(next));
            }}
        />
    );
};
