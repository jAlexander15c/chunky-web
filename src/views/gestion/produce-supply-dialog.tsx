import { useEffect, useRef, useState } from "react";

import { FullSheet } from "@/components";
import { HttpError, formatQuantity } from "@/helpers";
import type { ISupplyStatus } from "@/helpers";
import { getBatchShortcuts, getIntermediateUnitLabel, parsePositiveAmount } from "@/helpers/elaborados";
import { fetchSupplyRecipe, previewSupplyProduction, produceSupply } from "@/helpers/inventory";
import type { ISupplyProduction, ISupplyProductionPreview, ISupplyRecipe } from "@/helpers/inventory";

const PREVIEW_DELAY_MS = 300;

const quantity = (value: string) => formatQuantity(Number(value));

interface IProduceSupplyDialogProps {
    token: string;
    /** Los elaborados entre los que se elige si no viene uno. */
    elaborados: ISupplyStatus[];
    supply?: ISupplyStatus;
    onSaved: () => Promise<void> | void;
    onClose: () => void;
}

/** "Preparé": primero cuál elaborado, si no viene uno; después la tanda. */
export const ProduceSupplyDialog = ({ token, elaborados, supply: initialSupply, onSaved, onClose }: IProduceSupplyDialogProps) => {
    const [supply, setSupply] = useState<ISupplyStatus | undefined>(initialSupply);
    const [search, setSearch] = useState("");

    if (supply) return <ProduceSupplySheet token={token} supply={supply} onSaved={onSaved} onClose={onClose} />;

    const matches = elaborados.filter((entry) => entry.name.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")));
    return (
        <FullSheet title="¿Qué preparaste?" onClose={onClose}>
            {() => (
                <div className="ges-pick">
                    <input
                        className="ges-search"
                        type="search"
                        placeholder="Buscar elaborado"
                        aria-label="Buscar elaborado"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className="fsheet__choices">
                        {elaborados.length === 0 ? (
                            <p className="ges-empty">Todavía no hay elaborados. Créalos en Recetas → Elaborados.</p>
                        ) : matches.length === 0 ? (
                            <p className="ges-empty">Ningún elaborado coincide.</p>
                        ) : null}
                        {matches.map((entry) => (
                            <button key={entry.id} type="button" className="fsheet__choice" onClick={() => setSupply(entry)}>
                                <span>{entry.name}</span>
                                <small>
                                    {formatQuantity(entry.stock)} {getIntermediateUnitLabel(entry.unit)}
                                </small>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </FullSheet>
    );
};

interface IProduceSupplySheetProps {
    token: string;
    supply: ISupplyStatus;
    onSaved: () => Promise<void> | void;
    onClose: () => void;
}

/** Cuánto se preparó, lo que gasta de cada primo y, si salió distinto, lo que salió. */
const ProduceSupplySheet = ({ token, supply, onSaved, onClose }: IProduceSupplySheetProps) => {
    const [recipe, setRecipe] = useState<ISupplyRecipe | null>(null);
    const [prepared, setPrepared] = useState("");
    const [isDifferent, setIsDifferent] = useState(false);
    const [actual, setActual] = useState("");
    // La vista previa recuerda para qué cantidad se calculó: si cambió, ya no se muestra
    const [previewFor, setPreviewFor] = useState<{ amount: number; data: ISupplyProductionPreview } | null>(null);
    const [result, setResult] = useState<ISupplyProduction | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    // Un toque doble no registra dos tandas; cambiar las cantidades es otra tanda
    const requestId = useRef(crypto.randomUUID());

    useEffect(() => {
        const controller = new AbortController();
        fetchSupplyRecipe(token, supply.id, "gestion", controller.signal)
            .then(({ recipe: loaded }) => {
                setRecipe(loaded);
                setPrepared(loaded.yieldQuantity ? formatQuantity(Number(loaded.yieldQuantity)) : "");
            })
            .catch((requestError) => {
                if (!controller.signal.aborted)
                    setError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar la receta.");
            });
        return () => controller.abort();
    }, [token, supply.id]);

    const preparedAmount = parsePositiveAmount(prepared);
    const canPreview = Boolean(recipe?.yieldQuantity && recipe.ingredients.length);

    useEffect(() => {
        if (!canPreview || preparedAmount === null) return;
        let isCurrent = true;
        const timer = window.setTimeout(() => {
            previewSupplyProduction(token, supply.id, String(preparedAmount), "gestion")
                .then((data) => {
                    if (isCurrent) setPreviewFor({ amount: preparedAmount, data });
                })
                .catch((requestError) => {
                    if (isCurrent)
                        setError(requestError instanceof HttpError ? requestError.message : "No pudimos calcular lo que gasta.");
                });
        }, PREVIEW_DELAY_MS);
        return () => {
            isCurrent = false;
            window.clearTimeout(timer);
        };
    }, [token, supply.id, canPreview, preparedAmount]);

    const preview = previewFor && previewFor.amount === preparedAmount ? previewFor.data : null;

    const changeAmounts = (next: { prepared?: string; actual?: string }) => {
        if (next.prepared !== undefined) setPrepared(next.prepared.replace(",", "."));
        if (next.actual !== undefined) setActual(next.actual.replace(",", "."));
        requestId.current = crypto.randomUUID();
        setError("");
    };

    const unitLabel = getIntermediateUnitLabel(supply.unit);
    const actualAmount = isDifferent ? parsePositiveAmount(actual) : preparedAmount;
    const shortfalls = preview?.ingredients.filter((entry) => !entry.sufficient) ?? [];

    return (
        <FullSheet title={`Preparé · ${supply.name}`} onClose={onClose}>
            {(close) =>
                result ? (
                    <div className="ges-rec-sheet">
                        <p className="ges-rec-state">
                            Listo: entraron {quantity(result.quantity)} {unitLabel} de {supply.name}.
                        </p>
                        {result.shortfalls.length ? (
                            <p className="ges-prep-warn">
                                Quedó como faltante:{" "}
                                {result.shortfalls.map((entry) => `${quantity(entry.missing)} ${entry.unit} de ${entry.name}`).join(", ")}.
                                Se avisó a los admins.
                            </p>
                        ) : null}
                        <div className="ges-rec-acts">
                            <button type="button" className="ges-btn ges-btn--solid" onClick={() => close()}>
                                Listo
                            </button>
                        </div>
                    </div>
                ) : (
                    <form
                        className="ges-rec-sheet"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (preparedAmount === null) return setError("Escribe cuánto preparaste.");
                            if (actualAmount === null) return setError("Escribe cuánto salió.");
                            setBusy(true);
                            void produceSupply(
                                token,
                                supply.id,
                                {
                                    prepared: String(preparedAmount),
                                    actual: isDifferent ? String(actualAmount) : null,
                                    requestId: requestId.current,
                                },
                                "gestion"
                            )
                                .then(async (data) => {
                                    await onSaved();
                                    if (data.shortfalls.length) setResult(data);
                                    else close();
                                })
                                .catch((requestError) =>
                                    setError(requestError instanceof HttpError ? requestError.message : "No pudimos registrar la tanda.")
                                )
                                .finally(() => setBusy(false));
                        }}
                    >
                        {!recipe ? (
                            error ? null : <p className="ges-empty">Cargando…</p>
                        ) : !recipe.yieldQuantity || recipe.ingredients.length === 0 ? (
                            <p className="ges-empty">Este elaborado no tiene receta. Ponla en Recetas → Elaborados.</p>
                        ) : (
                            <>
                                <label className="ges-field">
                                    <span>¿Cuánto preparaste? ({unitLabel})</span>
                                    <input
                                        inputMode="decimal"
                                        value={prepared}
                                        onChange={(event) => changeAmounts({ prepared: event.target.value })}
                                    />
                                </label>
                                <div className="ges-prep-shortcuts" aria-label="Tandas de la receta">
                                    {getBatchShortcuts(recipe.yieldQuantity, supply.unit).map((shortcut) => (
                                        <button
                                            key={shortcut.batches}
                                            type="button"
                                            className="ges-tab"
                                            aria-pressed={preparedAmount === Number(shortcut.value)}
                                            onClick={() => changeAmounts({ prepared: shortcut.value })}
                                        >
                                            {shortcut.label}
                                        </button>
                                    ))}
                                </div>

                                {isDifferent ? (
                                    <label className="ges-field">
                                        <span>Salió de verdad ({unitLabel})</span>
                                        <input
                                            inputMode="decimal"
                                            value={actual}
                                            autoFocus
                                            onChange={(event) => changeAmounts({ actual: event.target.value })}
                                        />
                                    </label>
                                ) : (
                                    <button
                                        type="button"
                                        className="ges-link"
                                        onClick={() => {
                                            setIsDifferent(true);
                                            changeAmounts({ actual: prepared });
                                        }}
                                    >
                                        Salió distinto ›
                                    </button>
                                )}
                                <p className="ropt-hint">
                                    {recipe.shelfLifeDays ? `Este lote vence en ${recipe.shelfLifeDays} días.` : "Este elaborado no vence."}
                                </p>

                                <h3 className="ges-avail-group__title">Se va a gastar</h3>
                                {preview ? (
                                    <ul className="ges-rec-ings">
                                        {preview.ingredients.map((entry) => (
                                            <li key={entry.inventoryItemId} className={`ges-prep-line${entry.sufficient ? "" : " is-short"}`}>
                                                <b>{entry.name}</b>
                                                <span className="ges-prep-line__qty">
                                                    {quantity(entry.needed)} {entry.unit}
                                                </span>
                                                <small>
                                                    Quedan {quantity(entry.available)} {entry.unit}
                                                    {entry.sufficient ? "" : ` · faltan ${quantity(entry.missing)} ${entry.unit}`}
                                                </small>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="ropt-hint">{preparedAmount === null ? "Escribe cuánto preparaste." : "Calculando…"}</p>
                                )}
                                {shortfalls.length ? (
                                    <p className="ges-prep-warn">
                                        Según el sistema no alcanza {shortfalls.map((entry) => entry.name).join(", ")}. Se descuenta lo que hay, el
                                        resto queda como faltante y les llega un aviso a los admins.
                                    </p>
                                ) : null}
                            </>
                        )}

                        {error ? (
                            <p className="ges-error" role="alert">
                                {error}
                            </p>
                        ) : null}
                        {recipe?.yieldQuantity && recipe.ingredients.length ? (
                            <div className="ges-rec-acts">
                                <button type="submit" className="ges-btn ges-btn--solid" disabled={busy || actualAmount === null}>
                                    {busy ? "Registrando…" : `Registrar ${actualAmount === null ? "" : `${formatQuantity(actualAmount)} ${unitLabel}`}`}
                                </button>
                            </div>
                        ) : null}
                    </form>
                )
            }
        </FullSheet>
    );
};
