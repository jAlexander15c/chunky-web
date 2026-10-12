import { useRef, useState } from "react";

import { HttpError, formatQuantity } from "@/helpers";
import { discardExpiredLots, extendExpiredLots } from "@/helpers/inventory";
import { EXTEND_DAY_OPTIONS, getExpiredAgoLabel, getExtendedUntilLabel, groupExpiredLots } from "@/helpers/product-waste";
import type { ExtendDays, IExpiredLot } from "@/helpers/product-waste";

interface IExpiredLotsDialogProps {
    token: string;
    /** Los lotes que se ven en el aviso: esos mismos son los que se botan o se guardan. */
    lots: IExpiredLot[];
    onDiscarded: () => Promise<void>;
    onSessionExpired: () => void;
    onClose: () => void;
}

const getUnitsLabel = (units: number) => `${formatQuantity(units)} ${units === 1 ? "unidad" : "unidades"}`;

/** Por producto se elige botar o que sigue bueno (con 1 a 3 días más). Nada se bota solo. */
export const ExpiredLotsDialog = ({ token, lots, onDiscarded, onSessionExpired, onClose }: IExpiredLotsDialogProps) => {
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [skipped, setSkipped] = useState<number | null>(null);
    // Por producto: null es botar; un número, los días que sigue bueno. Arranca todo en botar, como antes.
    const [keepDays, setKeepDays] = useState<Record<string, ExtendDays | null>>({});
    // Un reintento tras perder la respuesta no bota ni extiende dos veces
    const discardId = useRef(crypto.randomUUID());
    const extendId = useRef(crypto.randomUUID());
    const groups = groupExpiredLots(lots);
    const isKept = (variantId: string) => (keepDays[variantId] ?? null) !== null;
    const discardUnits = groups.reduce((sum, group) => sum + (isKept(group.variantId) ? 0 : group.quantity), 0);
    const keepUnits = groups.reduce((sum, group) => sum + (isKept(group.variantId) ? group.quantity : 0), 0);

    const getSubmitLabel = () => {
        if (isSending) return "Guardando…";
        if (keepUnits === 0) return `Botar ${getUnitsLabel(discardUnits)}`;
        if (discardUnits === 0) return `Guardar ${getUnitsLabel(keepUnits)}`;
        return `Botar ${formatQuantity(discardUnits)} · Guardar ${formatQuantity(keepUnits)}`;
    };

    const submit = async () => {
        setIsSending(true);
        setError("");
        const toKeep = lots.flatMap((lot) => {
            const days = keepDays[lot.variantId] ?? null;
            return days === null ? [] : [{ batchId: lot.batchId, days }];
        });
        const toDiscard = lots.filter((lot) => !isKept(lot.variantId)).map((lot) => lot.batchId);
        try {
            let skippedCount = 0;
            if (toKeep.length > 0) skippedCount += (await extendExpiredLots(token, toKeep, extendId.current)).skipped.length;
            if (toDiscard.length > 0) skippedCount += (await discardExpiredLots(token, toDiscard, discardId.current)).skipped.length;
            await onDiscarded();
            if (skippedCount > 0) {
                setSkipped(skippedCount);
                setIsSending(false);
                return;
            }
            onClose();
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(requestError instanceof HttpError ? requestError.message : "No pudimos guardar los cambios. Puedes reintentar.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Revisar vencidos">
            <div className="ges-modal__panel">
                <h3 className="script">Revisar vencidos</h3>

                {skipped !== null ? (
                    <p className="ges-note" role="status">
                        Listo. {skipped === 1 ? "1 lote ya no estaba" : `${skipped} lotes ya no estaban`} pendiente (alguien lo revisó o cambió), así que se dejó como estaba.
                    </p>
                ) : (
                    <>
                        <p className="ges-note">
                            Elige qué se bota y qué sigue bueno. Lo que se bota queda como merma por vencimiento y no se deshace; lo que sigue bueno vuelve a venderse con la fecha nueva.
                        </p>
                        <ul className="ges-expired__choices" aria-label="Lotes vencidos">
                            {groups.map((group) => {
                                const days = keepDays[group.variantId] ?? null;
                                const setDays = (value: ExtendDays | null) => setKeepDays((current) => ({ ...current, [group.variantId]: value }));
                                return (
                                    <li key={group.variantId} className="ges-expired__choice">
                                        <div className="ges-expired__head">
                                            <span>
                                                <b>{formatQuantity(group.quantity)}</b> {group.name}
                                            </span>
                                            <small>{getExpiredAgoLabel(group.expirationDate)}</small>
                                        </div>
                                        <div className="ges-seg ges-expired__seg" role="group" aria-label={`Qué hacer con ${group.name}`}>
                                            <button type="button" aria-pressed={days === null} className="is-discard" disabled={isSending} onClick={() => setDays(null)}>
                                                Botar
                                            </button>
                                            <button type="button" aria-pressed={days !== null} className="is-keep" disabled={isSending} onClick={() => setDays(days ?? 1)}>
                                                Sigue bueno
                                            </button>
                                        </div>
                                        {days !== null ? (
                                            <div className="ges-expired__days" role="group" aria-label={`Cuánto más dura ${group.name}`}>
                                                <span>Dura</span>
                                                {EXTEND_DAY_OPTIONS.map((option) => (
                                                    <button key={option} type="button" aria-pressed={days === option} disabled={isSending} onClick={() => setDays(option)}>
                                                        +{option} {option === 1 ? "día" : "días"}
                                                    </button>
                                                ))}
                                                <small>{getExtendedUntilLabel(days)}</small>
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}

                {error ? <p className="ges-error" role="alert">{error}</p> : null}

                {skipped !== null ? (
                    <div className="ges-modal__acts ges-modal__acts--one">
                        <button type="button" className="ges-btn ges-btn--solid" onClick={onClose}>
                            Cerrar
                        </button>
                    </div>
                ) : (
                    <div className="ges-modal__acts">
                        <button type="button" className="ges-btn" disabled={isSending} onClick={onClose}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className={keepUnits === 0 ? "ges-btn ges-btn--danger" : "ges-btn ges-btn--solid"}
                            disabled={isSending}
                            onClick={() => void submit()}
                        >
                            {getSubmitLabel()}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
