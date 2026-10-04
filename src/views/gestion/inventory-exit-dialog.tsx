import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ModifierPicker } from "@/components";
import { HttpError, getItemModifiers, useCategories, useModifiers } from "@/helpers";
import type { ICartModifier } from "@/helpers";
import type { IItem } from "@/interfaces";
import { INVENTORY_EXIT_LABELS, fetchInventoryExitCatalog, fetchInventoryExits, prepareInventoryExitRequest, registerInventoryExit } from "@/helpers/inventory-exits";
import type { IInventoryExit, IInventoryExitRequest, InventoryExitReason } from "@/helpers/inventory-exits";

interface IExitDraftLine { key: string; variantId: string; name: string; quantity: number; modifiers: ICartModifier[] }
interface IInventoryExitDialogProps {
    token: string;
    onClose: () => void;
    onSessionExpired: () => void;
    /** Desde la tarjeta de un producto: ya viene elegido. */
    initialVariantId?: string;
}
const REASON_ICONS: Record<InventoryExitReason, ReactNode> = {
    pruebas: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />,
    marketing: <><rect x="3" y="6" width="18" height="14" rx="3" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" /></>,
    pedidos_externos: <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M9 17h6l-2-7H9M13 10h3l2 7M5 10h4" /></>,
};
const formatDate = (date: string) => new Date(date).toLocaleString("es-PA", { dateStyle: "short", timeStyle: "short" });

export const InventoryExitDialog = ({ token, onClose, onSessionExpired, initialVariantId = "" }: IInventoryExitDialogProps) => {
    const [reason, setReason] = useState<InventoryExitReason>("pruebas");
    const [note, setNote] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [variantId, setVariantId] = useState(initialVariantId);
    const [quantity, setQuantity] = useState("1");
    const [chosen, setChosen] = useState<ICartModifier[]>([]);
    const [lines, setLines] = useState<IExitDraftLine[]>([]);
    const [reviewing, setReviewing] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [historyError, setHistoryError] = useState("");
    const [history, setHistory] = useState<IInventoryExit[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [registered, setRegistered] = useState<IInventoryExit | null>(null);
    const lastRequest = useRef<IInventoryExitRequest | null>(null);
    const { categories } = useCategories({ live: true });

    const [catalogItems, setCatalogItems] = useState<IItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [catalogError, setCatalogError] = useState("");
    const items = categoryId ? catalogItems.filter((item) => categoryId === "__none__" ? !item.category_id : item.category_id === categoryId) : catalogItems;
    const loadCatalog = useCallback(async (signal?: AbortSignal) => {
        setCatalogError("");
        try {
            const data = await fetchInventoryExitCatalog(token, signal);
            if (!signal?.aborted) setCatalogItems(data.items);
        } catch (requestError) {
            if (signal?.aborted) return;
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setCatalogError(requestError instanceof HttpError ? requestError.message : "No pudimos cargar los productos.");
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, [token, onSessionExpired]);
    useEffect(() => {
        const controller = new AbortController();
        void loadCatalog(controller.signal);
        const refresh = () => { void loadCatalog(controller.signal); };
        window.addEventListener("focus", refresh);
        return () => { controller.abort(); window.removeEventListener("focus", refresh); };
    }, [loadCatalog]);
    const modifiers = useModifiers({ live: true, variantId: variantId || undefined, optionIds: chosen.map((entry) => entry.modifierOptionId) });
    const selectedItem = items.find((item) => item.variants.some((variant) => variant.variant_id === variantId));
    const itemModifiers = selectedItem ? getItemModifiers(selectedItem, modifiers, chosen.map((entry) => entry.modifierOptionId)) : [];
    const quantityValue = Number(quantity);
    const validQuantity = Number.isInteger(quantityValue) && quantityValue >= 1 && quantityValue <= 1000;

    const loadHistory = useCallback(async (signal?: AbortSignal) => {
        setLoadingHistory(true);
        setHistoryError("");
        try {
            const data = await fetchInventoryExits(token, signal);
            if (!signal?.aborted) setHistory(data.exits);
        } catch (requestError) {
            if (signal?.aborted) return;
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setHistoryError("No pudimos cargar las salidas recientes.");
        } finally {
            if (!signal?.aborted) setLoadingHistory(false);
        }
    }, [token, onSessionExpired]);
    useEffect(() => {
        const controller = new AbortController();
        void loadHistory(controller.signal);
        return () => controller.abort();
    }, [loadHistory]);

    const addLine = () => {
        if (!selectedItem || !validQuantity || lines.length >= 50) return;
        const variant = selectedItem.variants.find((one) => one.variant_id === variantId);
        const variantLabel = [variant?.option1_value, variant?.option2_value, variant?.option3_value].filter(Boolean).join(" / ");
        setLines((current) => [...current, { key: crypto.randomUUID(), variantId, name: selectedItem.item_name + (variantLabel ? ` · ${variantLabel}` : ""), quantity: quantityValue, modifiers: chosen }]);
        setChosen([]);
        setVariantId("");
        setQuantity("1");
        setError("");
        setRegistered(null);
    };
    // Bajar de 1 quita la línea
    const changeLineQuantity = (key: string, delta: number) => {
        setLines((current) => current.flatMap((one) => one.key !== key ? [one] : one.quantity + delta < 1 ? [] : [{ ...one, quantity: Math.min(1000, one.quantity + delta) }]));
        setRegistered(null);
    };
    const unitCount = lines.reduce((total, line) => total + line.quantity, 0);
    const submit = async () => {
        if (pending || !lines.length) return;
        const request = prepareInventoryExitRequest({ reason, note: note.trim() || null, lines: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity, modifierOptionIds: line.modifiers.map((one) => one.modifierOptionId) })) }, lastRequest.current);
        lastRequest.current = request;
        setPending(true);
        setError("");
        try {
            const data = await registerInventoryExit(token, request);
            setRegistered(data.exit);
            setLines([]);
            setNote("");
            setReviewing(false);
            lastRequest.current = null;
            setHistory((current) => [data.exit, ...current.filter((one) => one.id !== data.exit.id)]);
            await Promise.all([loadHistory(), loadCatalog()]);
        } catch (requestError) {
            if (requestError instanceof HttpError && requestError.status === 401) onSessionExpired();
            else setError(requestError instanceof HttpError ? requestError.message : "No pudimos registrar la salida. Puedes reintentar.");
        } finally { setPending(false); }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Salida sin venta">
            <div className="ges-modal__panel">
                <h3 className="script">Salida sin venta</h3>
                <p className="ges-note">Descuenta inventario. No es venta ni cobro.</p>
                {registered ? <div className="ges-note" role="status"><b>Salida #{registered.id} registrada</b><br />{registered.actorName} · {formatDate(registered.createdAt)}</div> : null}
                <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "0.7rem", minWidth: 0 }}>
                    <div className="ges-field" role="group" aria-label="¿Para qué?">
                        <span>¿Para qué?</span>
                        <div className="ges-exit-reasons">
                            {(Object.keys(INVENTORY_EXIT_LABELS) as InventoryExitReason[]).map((value) => (
                                <button key={value} type="button" className="ges-exit-reason" aria-pressed={reason === value} disabled={reviewing} onClick={() => setReason(value)}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{REASON_ICONS[value]}</svg>
                                    {INVENTORY_EXIT_LABELS[value]}
                                </button>
                            ))}
                        </div>
                    </div>
                    {reason === "pedidos_externos" ? <p className="ges-warning">PedidosYa: úsalo solo si ese pedido no pasó ya por Caja, la web o Loyverse; si no, se descuenta dos veces.</p> : null}
                    <label className="ges-field"><span>Nota (opcional)</span><input value={note} maxLength={500} disabled={reviewing} onChange={(event) => setNote(event.target.value)} placeholder={reason === "pedidos_externos" ? "Ej. número del pedido" : reason === "marketing" ? "Ej. video para Instagram" : "Ej. receta nueva"} /></label>
                    {!reviewing ? <>
                        <label className="ges-field"><span>Categoría</span><select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setVariantId(""); setChosen([]); }}><option value="">Todos los productos</option><option value="__none__">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                        <label className="ges-field"><span>Producto / variante</span><select value={variantId} onChange={(event) => { setVariantId(event.target.value); setChosen([]); }}><option value="">{isLoading ? "Cargando productos…" : "Elige un producto"}</option>{items.flatMap((item) => item.variants.filter((variant) => variant.variant_id && !variant.deleted_at).map((variant) => { const label = [variant.option1_value, variant.option2_value, variant.option3_value].filter(Boolean).join(" / "); return <option key={variant.variant_id} value={variant.variant_id}>{item.item_name}{label ? ` · ${label}` : ""}</option>; }))}</select></label>
                        {catalogError ? <p className="ges-error" role="alert">No pudimos cargar los productos. {catalogError}</p> : null}
                        <label className="ges-field"><span>Cantidad</span><input type="number" min={1} max={1000} step={1} inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
                        {!validQuantity ? <p className="ges-error">Usa una cantidad entera de 1 a 1000.</p> : null}
                        <ModifierPicker modifiers={itemModifiers} chosen={chosen} onChange={setChosen} showSoldOutReason />
                        <button type="button" className="ges-btn" disabled={!selectedItem || !validQuantity || lines.length >= 50} onClick={addLine}>Agregar a la salida</button>
                        {lines.length >= 50 ? <p className="ges-note">Máximo 50 líneas por salida.</p> : null}
                    </> : <p className="ges-note">Revisa los productos, las cantidades y el motivo antes de confirmar.</p>}
                    {lines.length ? <div className="ges-rows" aria-label="Productos de la salida">{lines.map((line) => <div className="ges-r" key={line.key}><span><b>{reviewing ? `${line.quantity} × ` : ""}{line.name}</b>{line.modifiers.length ? <><br /><em>{line.modifiers.map((one) => `${one.name}: ${one.option}`).join(", ")}</em></> : null}</span>{!reviewing ? <span className="ges-stepper"><button type="button" className="ges-btn ges-btn--sm" aria-label={line.quantity > 1 ? `Uno menos de ${line.name}` : `Quitar ${line.name}`} onClick={() => changeLineQuantity(line.key, -1)}>−</button><b>{line.quantity}</b><button type="button" className="ges-btn ges-btn--sm" aria-label={`Uno más de ${line.name}`} disabled={line.quantity >= 1000} onClick={() => changeLineQuantity(line.key, 1)}>+</button></span> : null}</div>)}</div> : null}
                </fieldset>
                {error ? <p className="ges-error" role="alert">{error}</p> : null}
                <div className="ges-modal__acts"><button type="button" className="ges-btn" disabled={pending} onClick={() => reviewing ? setReviewing(false) : onClose()}>{reviewing ? "Editar" : "Cerrar"}</button><button type="button" className="ges-btn ges-btn--solid" disabled={pending || !lines.length} onClick={() => reviewing ? void submit() : setReviewing(true)}>{pending ? "Registrando…" : reviewing ? "Confirmar salida" : lines.length ? `Revisar salida · ${unitCount} ${unitCount === 1 ? "producto" : "productos"}` : "Revisar salida"}</button></div>
                <details open><summary>Salidas recientes</summary><div className="ges-rows" style={{ marginTop: "0.7rem" }}>{loadingHistory ? <p className="ges-empty">Cargando salidas…</p> : null}{historyError ? <><p className="ges-error" role="alert">{historyError}</p><button type="button" className="ges-btn" disabled={pending} onClick={() => void loadHistory()}>Reintentar historial</button></> : null}{!loadingHistory && !historyError && !history.length ? <p className="ges-empty">Todavía no hay salidas registradas.</p> : null}{history.map((exit) => <div className="ges-note" key={exit.id}><b>#{exit.id} · {INVENTORY_EXIT_LABELS[exit.reason]}</b><br />{exit.actorName} · {formatDate(exit.createdAt)}{exit.note ? <p>{exit.note}</p> : null}<ul>{exit.lines.map((line, index) => <li key={index}>{line.quantity} × {line.name}{line.modifiers.length ? ` · ${line.modifiers.map((one) => one.option).join(", ")}` : ""}</li>)}</ul></div>)}</div></details>
            </div>
        </div>
    );
};
