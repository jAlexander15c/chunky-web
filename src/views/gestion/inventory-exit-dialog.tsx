import { useCallback, useEffect, useRef, useState } from "react";
import { ModifierPicker } from "@/components";
import { HttpError, getItemModifiers, useCategories, useModifiers } from "@/helpers";
import type { ICartModifier } from "@/helpers";
import type { IItem } from "@/interfaces";
import { INVENTORY_EXIT_LABELS, fetchInventoryExitCatalog, fetchInventoryExits, prepareInventoryExitRequest, registerInventoryExit } from "@/helpers/inventory-exits";
import type { IInventoryExit, IInventoryExitRequest, InventoryExitReason } from "@/helpers/inventory-exits";

interface IExitDraftLine { key: string; variantId: string; name: string; quantity: number; modifiers: ICartModifier[] }
interface IInventoryExitDialogProps { token: string; onClose: () => void; onSessionExpired: () => void }
const formatDate = (date: string) => new Date(date).toLocaleString("es-PA", { dateStyle: "short", timeStyle: "short" });

export const InventoryExitDialog = ({ token, onClose, onSessionExpired }: IInventoryExitDialogProps) => {
    const [reason, setReason] = useState<InventoryExitReason>("pruebas");
    const [note, setNote] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [variantId, setVariantId] = useState("");
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
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label="Registrar salida">
            <div className="ges-modal__panel">
                <h3 className="script">Registrar salida</h3>
                <p className="ges-note">Descuenta los productos y sus opciones del inventario. Sin cobro.</p>
                {registered ? <div className="ges-note" role="status"><b>Salida #{registered.id} registrada</b><br />{registered.actorName} · {formatDate(registered.createdAt)}</div> : null}
                <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "0.7rem", minWidth: 0 }}>
                    <label className="ges-field"><span>Motivo</span><select value={reason} disabled={reviewing} onChange={(event) => setReason(event.target.value as InventoryExitReason)}>{Object.entries(INVENTORY_EXIT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    {reason === "pedidos_externos" ? <p className="ges-note">Usa este motivo para pedidos cuyo inventario no se haya descontado en Caja, web o Loyverse.</p> : null}
                    <label className="ges-field"><span>Nota o referencia del pedido (opcional)</span><input value={note} maxLength={500} disabled={reviewing} onChange={(event) => setNote(event.target.value)} placeholder="Ej. pedido Instagram de Ana" /></label>
                    {!reviewing ? <>
                        <label className="ges-field"><span>Categoría</span><select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setVariantId(""); setChosen([]); }}><option value="">Todos los productos</option><option value="__none__">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                        <label className="ges-field"><span>Producto / variante</span><select value={variantId} onChange={(event) => { setVariantId(event.target.value); setChosen([]); }}><option value="">{isLoading ? "Cargando productos…" : "Elige un producto"}</option>{items.flatMap((item) => item.variants.filter((variant) => variant.variant_id && !variant.deleted_at).map((variant) => { const label = [variant.option1_value, variant.option2_value, variant.option3_value].filter(Boolean).join(" / "); return <option key={variant.variant_id} value={variant.variant_id}>{item.item_name}{label ? ` · ${label}` : ""}</option>; }))}</select></label>
                        {catalogError ? <p className="ges-error" role="alert">No pudimos cargar los productos. {catalogError}</p> : null}
                        <label className="ges-field"><span>Cantidad</span><input type="number" min={1} max={1000} step={1} inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
                        {!validQuantity ? <p className="ges-error">Usa una cantidad entera de 1 a 1000.</p> : null}
                        <ModifierPicker modifiers={itemModifiers} chosen={chosen} onChange={setChosen} />
                        <button type="button" className="ges-btn" disabled={!selectedItem || !validQuantity || lines.length >= 50} onClick={addLine}>Agregar a la salida</button>
                        {lines.length >= 50 ? <p className="ges-note">Máximo 50 líneas por salida.</p> : null}
                    </> : <p className="ges-note">Revisa los productos, las cantidades y el motivo antes de confirmar.</p>}
                    {lines.length ? <div className="ges-rows" aria-label="Productos de la salida">{lines.map((line) => <div className="ges-r" key={line.key}><span><b>{line.quantity} × {line.name}</b>{line.modifiers.length ? <><br /><em>{line.modifiers.map((one) => `${one.name}: ${one.option}`).join(", ")}</em></> : null}</span>{!reviewing ? <button type="button" className="ges-btn ges-btn--sm" onClick={() => setLines((current) => current.filter((one) => one.key !== line.key))}>Quitar</button> : null}</div>)}</div> : null}
                </fieldset>
                {error ? <p className="ges-error" role="alert">{error}</p> : null}
                <div className="ges-modal__acts"><button type="button" className="ges-btn" disabled={pending} onClick={() => reviewing ? setReviewing(false) : onClose()}>{reviewing ? "Editar" : "Cerrar"}</button><button type="button" className="ges-btn ges-btn--solid" disabled={pending || !lines.length} onClick={() => reviewing ? void submit() : setReviewing(true)}>{pending ? "Registrando…" : reviewing ? "Confirmar salida" : "Revisar salida"}</button></div>
                <details open><summary>Salidas recientes</summary><div className="ges-rows" style={{ marginTop: "0.7rem" }}>{loadingHistory ? <p className="ges-empty">Cargando salidas…</p> : null}{historyError ? <><p className="ges-error" role="alert">{historyError}</p><button type="button" className="ges-btn" disabled={pending} onClick={() => void loadHistory()}>Reintentar historial</button></> : null}{!loadingHistory && !historyError && !history.length ? <p className="ges-empty">Todavía no hay salidas registradas.</p> : null}{history.map((exit) => <div className="ges-note" key={exit.id}><b>#{exit.id} · {INVENTORY_EXIT_LABELS[exit.reason]}</b><br />{exit.actorName} · {formatDate(exit.createdAt)}{exit.note ? <p>{exit.note}</p> : null}<ul>{exit.lines.map((line, index) => <li key={index}>{line.quantity} × {line.name}{line.modifiers.length ? ` · ${line.modifiers.map((one) => one.option).join(", ")}` : ""}</li>)}</ul></div>)}</div></details>
            </div>
        </div>
    );
};
