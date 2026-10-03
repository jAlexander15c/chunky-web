import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import "./full-sheet.css";

/** Marca de la entrada que la hoja agrega al historial: el botón atrás del teléfono la cierra. */
const SHEET_HISTORY_KEY = "fullSheet";

/** Lo que se corre al cerrar (ej. navegar), cuando el historial ya volvió atrás. Hay una sola hoja a la vez. */
let pendingAfterClose: (() => void) | undefined;

const isSheetEntry = () => Boolean((window.history.state as Record<string, unknown> | null)?.[SHEET_HISTORY_KEY]);

interface IFullSheetProps {
    title: string;
    onClose: () => void;
    /** Recibe `close`: cierra la hoja y después corre `after` (ej. ir a la sección elegida). */
    children: (close: (after?: () => void) => void) => ReactNode;
}

/**
 * Hoja a pantalla completa para elegir una opción en el teléfono, en lugar de deslizar de lado.
 * La usan el tablero y gestión. Se cierra con ✕, con Escape o con el botón atrás del teléfono.
 */
export const FullSheet = ({ title, onClose, children }: IFullSheetProps) => {
    const closeButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        // En modo estricto el efecto corre dos veces: una sola entrada en el historial
        if (!isSheetEntry()) window.history.pushState({ ...window.history.state, [SHEET_HISTORY_KEY]: true }, "");
        const onPop = () => {
            onClose();
            const after = pendingAfterClose;
            pendingAfterClose = undefined;
            after?.();
        };
        window.addEventListener("popstate", onPop);
        // Sin scroll de la página de atrás mientras la hoja está abierta
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButton.current?.focus();
        return () => {
            window.removeEventListener("popstate", onPop);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose]);

    const close = useCallback(
        (after?: () => void) => {
            if (isSheetEntry()) {
                // Primero se saca la entrada de la hoja; lo elegido va después
                pendingAfterClose = after;
                window.history.back();
                return;
            }
            onClose();
            after?.();
        },
        [onClose]
    );

    return (
        <div
            className="fsheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onKeyDown={(event) => {
                if (event.key === "Escape") close();
            }}
        >
            <div className="fsheet__head">
                <h2>{title}</h2>
                <button ref={closeButton} type="button" className="fsheet__close" aria-label="Cerrar" onClick={() => close()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                </button>
            </div>
            <div className="fsheet__body">{children(close)}</div>
        </div>
    );
};

/** Flecha del botón que abre una hoja. */
export const SheetChevron = () => (
    <svg className="fsheet-select__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
    </svg>
);

export interface ISheetOption<T> {
    id: T;
    label: string;
    /** Número junto a la opción (cuántos hay en esa categoría, el total de una cuenta…). */
    count?: ReactNode;
}

interface ISheetSelectProps<T> {
    /** Lo que se elige: "Categoría", "Cuenta"… Va sobre el valor y como título de la hoja. */
    label: string;
    value: T;
    options: ISheetOption<T>[];
    onChange: (value: T) => void;
    /** Una acción al final de la lista, como "+ Cuenta". */
    action?: { label: string; disabled?: boolean; onSelect: () => void };
    className?: string;
}

/**
 * En el teléfono reemplaza una fila de pestañas que no cabe: un botón con lo elegido que abre
 * la lista a pantalla completa. En pantallas anchas no se ve (la fila lleva `fsheet-wide`).
 */
export const SheetSelect = <T,>({ label, value, options, onChange, action, className = "" }: ISheetSelectProps<T>) => {
    const [isOpen, setIsOpen] = useState(false);
    const closeSheet = useCallback(() => setIsOpen(false), []);
    const current = options.find((option) => option.id === value);

    return (
        <>
            <button type="button" className={`fsheet-select ${className}`} aria-haspopup="dialog" onClick={() => setIsOpen(true)}>
                <span className="fsheet-select__text">
                    <small>{label}</small>
                    <span>
                        {current?.label ?? "Elegir"}
                        {current?.count !== undefined ? <em>{current.count}</em> : null}
                    </span>
                </span>
                <SheetChevron />
            </button>

            {isOpen ? (
                <FullSheet title={label} onClose={closeSheet}>
                    {(close) => (
                        <div className="fsheet__choices">
                            {options.map((option) => (
                                <button
                                    key={String(option.id)}
                                    type="button"
                                    className="fsheet__choice"
                                    aria-current={option.id === value}
                                    onClick={() => close(() => onChange(option.id))}
                                >
                                    <span>{option.label}</span>
                                    {option.count !== undefined ? <small>{option.count}</small> : null}
                                </button>
                            ))}
                            {action ? (
                                <button
                                    type="button"
                                    className="fsheet__choice is-action"
                                    disabled={action.disabled}
                                    onClick={() => close(action.onSelect)}
                                >
                                    {action.label}
                                </button>
                            ) : null}
                        </div>
                    )}
                </FullSheet>
            ) : null}
        </>
    );
};
