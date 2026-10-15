import { useCallback, useEffect, useState } from "react";
import { FullSheet, SheetChevron } from "@/components/full-sheet";
import { createPromo, deletePromo, fetchAdminPromos, fetchMenu, formatPrice, HttpError, updatePromo, getPanamaToday } from "@/helpers";
import type { IMenuCategory, IMenuItem, IPromoAdmin, IPromoInput } from "@/helpers";
import { formatPromoDate, getPromoLabel } from "@/helpers/promos";
import "./admin-promos.css";
import "../components/promos.css";

const EMPTY_PROMO: IPromoInput = { name: "", kind: "two_for_one", percent: null, itemIds: [], categoryIds: [], channel: "web", startsOn: null, endsOn: null, isEnabled: true };
const getPromoInput = (promo: IPromoInput): IPromoInput => ({ name: promo.name, kind: promo.kind, percent: promo.percent, itemIds: promo.itemIds, categoryIds: promo.categoryIds, channel: promo.channel, startsOn: promo.startsOn, endsOn: promo.endsOn, isEnabled: promo.isEnabled });
const getErrorText = (error: unknown) => error instanceof Error ? error.message : "No pudimos guardar la promo. Intenta de nuevo.";

export const AdminPromos = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [promos, setPromos] = useState<IPromoAdmin[]>([]);
    const [categories, setCategories] = useState<IMenuCategory[]>([]);
    const [items, setItems] = useState<IMenuItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [editing, setEditing] = useState<IPromoAdmin | null | undefined>(undefined);
    const [draft, setDraft] = useState<IPromoInput>(EMPTY_PROMO);
    const [sheetError, setSheetError] = useState("");
    const [busy, setBusy] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [selecting, setSelecting] = useState(false);
    const showError = useCallback((requestError: unknown) => {
        if (requestError instanceof HttpError && requestError.status === 401) onSessionExpired();
        return getErrorText(requestError);
    }, [onSessionExpired]);
    const load = useCallback(async (signal?: AbortSignal) => {
        try {
            const [response, menu] = await Promise.all([fetchAdminPromos(token, signal), fetchMenu(token, signal)]);
            if (signal?.aborted) return;
            setPromos(response.promos); setCategories(menu.categories); setItems(menu.items); setError("");
        } catch (requestError) {
            if (!signal?.aborted) setError(showError(requestError));
        } finally { if (!signal?.aborted) setLoading(false); }
    }, [token, showError]);
    useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
    const closeSheet = useCallback(() => setEditing(undefined), []);
    const openEditor = (promo: IPromoAdmin | null) => {
        setEditing(promo); setDraft(promo ? getPromoInput(promo) : { ...EMPTY_PROMO, itemIds: [], categoryIds: [] });
        setSheetError(""); setConfirmDelete(false); setSelecting(false);
    };
    const save = async (close: () => void) => {
        if (busy) return;
        setBusy(true); setSheetError("");
        try {
            if (editing) await updatePromo(token, editing.id, draft); else await createPromo(token, draft);
            await load(); close();
        } catch (requestError) { setSheetError(showError(requestError)); }
        finally { setBusy(false); }
    };
    const remove = async (close: () => void) => {
        if (!editing) return;
        setBusy(true); setSheetError("");
        try { await deletePromo(token, editing.id); await load(); close(); }
        catch (requestError) { setSheetError(showError(requestError)); }
        finally { setBusy(false); }
    };
    const toggle = async (promo: IPromoAdmin) => {
        setBusyId(promo.id);
        try { await updatePromo(token, promo.id, { ...getPromoInput(promo), isEnabled: !promo.isEnabled }); await load(); }
        catch (requestError) { setError(showError(requestError)); }
        finally { setBusyId(null); }
    };
    const toggleTarget = (field: "itemIds" | "categoryIds", id: string) => setDraft((current) => ({ ...current, [field]: current[field].includes(id) ? current[field].filter((value) => value !== id) : [...current[field], id] }));
    return <section className="adm-promos">
        <button className="adm-btn adm-btn--solid" type="button" disabled={loading} onClick={() => openEditor(null)}>+ Nueva promo</button>
        {error && <p className="adm-note" role="alert">{error}</p>}
        {loading ? <p>Cargando promos…</p> : promos.length === 0 ? <p>Todavía no hay promos. Crea la primera para consentir a tus clientes.</p> : null}
        {[...promos].sort((a, b) => Number(b.isActiveNow) - Number(a.isActiveNow) || b.id - a.id).map((promo) => {
            const count = items.filter((item) => promo.itemIds.includes(item.id) || Boolean(item.categoryId && promo.categoryIds.includes(item.categoryId))).length;
            const names = categories.filter((category) => promo.categoryIds.includes(category.id)).map((category) => category.name);
            const status = promo.isActiveNow ? "Activa" : promo.isEnabled && promo.startsOn && promo.startsOn > getPanamaToday() ? "Programada" : "Apagada";
            return <article className="adm-card adm-promo" key={promo.id}>
                <div className="adm-promo__head"><span className="promo-seal">{getPromoLabel(promo)}</span><b>{promo.name}</b><span className="adm-promo__chip">{status}</span></div>
                <p>{names.length ? `Categoría ${names.join(", ")} · ` : ""}{count} productos</p>
                <p>{promo.channel === "web" ? "Solo web" : promo.channel === "caja" ? "Solo Caja" : "Web y Caja"}</p>
                <p>{status === "Programada" ? `Empieza el ${formatPromoDate(promo.startsOn!)}` : promo.endsOn ? `Hasta el ${formatPromoDate(promo.endsOn)}` : "Sin fecha de fin"}</p>
                <p>Hoy: {promo.todayUses} usos · {formatPrice(promo.todayDiscount)} descontados</p>
                <div className="adm-promo__actions"><label><input type="checkbox" role="switch" checked={promo.isEnabled} disabled={busyId === promo.id} onChange={() => void toggle(promo)} /> Activa</label><button type="button" className="adm-btn" onClick={() => openEditor(promo)}>Editar</button></div>
            </article>;
        })}
        <p className="adm-note">Si un producto entra en dos promos activas, se aplica la que más le descuenta al cliente.</p>
        {editing !== undefined && <FullSheet title={selecting ? "Aplica a" : editing ? "Editar promo" : "Nueva promo"} onClose={closeSheet}>{(close) => selecting ? <div className="adm-promo-editor">
            <p>Elige categorías completas o productos individuales.</p>
            <h3>Categorías</h3>{categories.map((category) => <label key={category.id}><input type="checkbox" checked={draft.categoryIds.includes(category.id)} onChange={() => toggleTarget("categoryIds", category.id)} /> {category.name}</label>)}
            <h3>Productos</h3>{items.map((item) => <label key={item.id}><input type="checkbox" checked={draft.itemIds.includes(item.id)} onChange={() => toggleTarget("itemIds", item.id)} /> {item.name}</label>)}
            <button className="adm-btn adm-btn--solid" type="button" onClick={() => setSelecting(false)}>Listo</button>
        </div> : <form className="adm-promo-editor" onSubmit={(event) => { event.preventDefault(); void save(close); }}>
            <label>Nombre que ve el cliente<input required maxLength={40} value={draft.name} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <fieldset disabled={busy}><legend>Tipo</legend><label><input type="radio" name="kind" checked={draft.kind === "two_for_one"} onChange={() => setDraft({ ...draft, kind: "two_for_one", percent: null })} /> 2x1</label><label><input type="radio" name="kind" checked={draft.kind === "percent"} onChange={() => setDraft({ ...draft, kind: "percent", percent: 20 })} /> % menos</label></fieldset>
            {draft.kind === "percent" && <label>Porcentaje<input type="number" min={1} max={90} step={1} required value={draft.percent ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, percent: Number(event.target.value) })} /></label>}
            <button className="fsheet-select adm-promo-select" type="button" disabled={busy} onClick={() => setSelecting(true)}><span className="fsheet-select__text"><small>Aplica a</small><span>{draft.categoryIds.length} categorías · {draft.itemIds.length} productos</span></span><SheetChevron /></button>
            <fieldset disabled={busy}><legend>Dónde</legend>{(["web", "caja", "both"] as const).map((channel) => <label key={channel}><input type="radio" name="channel" checked={draft.channel === channel} onChange={() => setDraft({ ...draft, channel })} /> {channel === "web" ? "Solo web" : channel === "caja" ? "Solo Caja" : "Web y Caja"}</label>)}</fieldset>
            <label>Desde (opcional)<input type="date" value={draft.startsOn ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, startsOn: event.target.value || null })} /></label>
            <label>Hasta (incluido, opcional)<input type="date" min={draft.startsOn ?? undefined} value={draft.endsOn ?? ""} disabled={busy} onChange={(event) => setDraft({ ...draft, endsOn: event.target.value || null })} /></label>
            <p className="adm-note">Al pasar la fecha se apaga sola.</p>
            <label><input type="checkbox" checked={draft.isEnabled} disabled={busy} onChange={(event) => setDraft({ ...draft, isEnabled: event.target.checked })} /> Activa</label>
            {sheetError && <p role="alert">{sheetError}</p>}
            <button className="adm-btn adm-btn--solid" disabled={busy || !draft.name.trim() || draft.categoryIds.length + draft.itemIds.length === 0 || draft.categoryIds.length + draft.itemIds.length > 200} type="submit">{busy ? "Guardando…" : "Guardar promo"}</button>
            {editing && (confirmDelete ? <div role="alert"><p>¿Borrar {editing.name}? Esta acción no se puede deshacer.</p><button type="button" className="adm-btn" disabled={busy} onClick={() => void remove(close)}>Sí, borrar promo</button><button type="button" className="adm-btn" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</button></div> : <button className="adm-btn" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Borrar</button>)}
        </form>}</FullSheet>}
    </section>;
};
