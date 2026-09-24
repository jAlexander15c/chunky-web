import { useCallback, useEffect, useState } from "react";

import {
    HttpError,
    changeGestionModifierAvailability,
    fetchGestionModifierAvailability,
    formatCash,
    isOptionAvailable,
} from "@/helpers";
import type { IModifier } from "@/helpers";

interface IGestionOpcionesProps {
    token: string;
    onSessionExpired: () => void;
    /** Para mostrar en la pestaña cuántas hay agotadas. */
    onSoldOutCountChange?: (count: number) => void;
}

const countSoldOut = (modifiers: IModifier[]) =>
    modifiers.reduce((sum, modifier) => sum + modifier.options.filter((option) => !isOptionAvailable(option)).length, 0);

/**
 * Opciones de modificador agotadas (ej. se acabó la leche de avena).
 * Se guardan en nuestra base: Loyverse no permite apagar una opción.
 * No se prenden solas al día siguiente.
 */
export const GestionOpciones = ({ token, onSessionExpired, onSoldOutCountChange }: IGestionOpcionesProps) => {
    const [modifiers, setModifiers] = useState<IModifier[]>([]);
    const [pendingIds, setPendingIds] = useState<string[]>([]);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const handleRequestError = useCallback(
        (requestError: unknown, fallback: string) => {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : fallback);
        },
        [onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();

        const loadModifiers = async () => {
            try {
                const data = await fetchGestionModifierAvailability(token, controller.signal);
                setModifiers([...data.modifiers].sort((a, b) => a.name.localeCompare(b.name, "es")));
                setError("");
            } catch (requestError) {
                if (controller.signal.aborted) return;
                handleRequestError(requestError, "No pudimos cargar las opciones.");
            } finally {
                setIsLoading(false);
            }
        };

        void loadModifiers();
        return () => controller.abort();
    }, [token, handleRequestError]);

    useEffect(() => {
        onSoldOutCountChange?.(countSoldOut(modifiers));
    }, [modifiers, onSoldOutCountChange]);

    const setOptionLocally = (optionId: string, isAvailable: boolean) =>
        setModifiers((current) =>
            current.map((modifier) => ({
                ...modifier,
                options: modifier.options.map((option) => (option.id === optionId ? { ...option, isAvailable } : option)),
            }))
        );

    // Se cambia en pantalla al instante y se deshace si el API no lo acepta
    const toggleOption = async (modifierName: string, optionId: string, optionName: string, isAvailable: boolean) => {
        if (pendingIds.includes(optionId)) return;

        setError("");
        setPendingIds((current) => [...current, optionId]);
        setOptionLocally(optionId, !isAvailable);

        try {
            await changeGestionModifierAvailability(token, optionId, !isAvailable);
        } catch (requestError) {
            setOptionLocally(optionId, isAvailable);
            handleRequestError(requestError, `No pudimos cambiar ${modifierName} ${optionName}. Quedó como estaba; intenta de nuevo.`);
        } finally {
            setPendingIds((current) => current.filter((id) => id !== optionId));
        }
    };

    return (
        <main className="ges-main">
            <p className="ges-avail-hint">
                Apaga una opción cuando se acabe (ej. leche de avena). En la web y en la caja se ve como “Agotado”.
                No se prende sola: vuelve a prenderla cuando haya.
            </p>

            {error ? <p className="ges-error" role="alert">{error}</p> : null}

            {isLoading ? (
                <p className="ges-empty">Cargando…</p>
            ) : modifiers.length === 0 ? (
                <p className="ges-empty">No hay modificadores en esta tienda.</p>
            ) : (
                modifiers.map((modifier) => (
                    <section key={modifier.id} className="ges-avail-group" aria-labelledby={`ges-mod-${modifier.id}`}>
                        <h3 id={`ges-mod-${modifier.id}`} className="ges-avail-group__title">{modifier.name}</h3>
                        <ul className="ges-avail-list">
                            {modifier.options.map((option) => {
                                const isAvailable = isOptionAvailable(option);
                                const isPending = pendingIds.includes(option.id);

                                return (
                                    <li key={option.id} className={`ges-avail${isAvailable ? "" : " is-off"}`}>
                                        <div className="ges-avail__body">
                                            <div className="ges-avail__name">{option.name}</div>
                                            {option.price > 0 ? (
                                                <div className="ges-avail__meta">+{formatCash(option.price)}</div>
                                            ) : null}
                                        </div>
                                        <label className={`ges-check${isPending ? " is-busy" : ""}`}>
                                            <span className="ges-check__label">{isAvailable ? "Disponible" : "Agotado"}</span>
                                            <input
                                                id={`ges-option-${option.id}`}
                                                type="checkbox"
                                                checked={isAvailable}
                                                aria-label={`${modifier.name} ${option.name} disponible`}
                                                aria-busy={isPending}
                                                disabled={isPending}
                                                onChange={() => void toggleOption(modifier.name, option.id, option.name, isAvailable)}
                                            />
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))
            )}
        </main>
    );
};
