import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Marca de la entrada que la hoja agrega al historial: el botón atrás del teléfono la cierra. */
const SHEET_HISTORY_KEY = "admSheet";

/** Lo que se corre al cerrar (ej. navegar), cuando el historial ya volvió atrás. Hay una sola hoja a la vez. */
let pendingAfterClose: (() => void) | undefined;

const isSheetEntry = () => Boolean((window.history.state as Record<string, unknown> | null)?.[SHEET_HISTORY_KEY]);

interface IAdminSheetProps {
    title: string;
    onClose: () => void;
    /** Recibe `close`: cierra la hoja y después corre `after` (ej. navegar a la sección elegida). */
    children: (close: (after?: () => void) => void) => ReactNode;
}

/**
 * Hoja a pantalla completa para elegir una opción en el teléfono, en lugar de deslizar de lado.
 * Se cierra con ✕, con Escape o con el botón atrás del teléfono.
 */
export const AdminSheet = ({ title, onClose, children }: IAdminSheetProps) => {
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
                // Primero se saca la entrada de la hoja; la navegación elegida va después
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
            className="adm-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onKeyDown={(event) => {
                if (event.key === "Escape") close();
            }}
        >
            <div className="adm-sheet__head">
                <h2>{title}</h2>
                <button ref={closeButton} type="button" className="adm-sheet__close" aria-label="Cerrar" onClick={() => close()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                </button>
            </div>
            <div className="adm-sheet__body">{children(close)}</div>
        </div>
    );
};

/** Flecha del botón que abre una hoja. */
export const SheetChevron = () => (
    <svg className="adm-sheet-trigger__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
    </svg>
);
