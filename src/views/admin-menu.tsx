import { RecipeDialog } from "./inventory-recipe-dialog";
import { availabilityLabel, expirationLabel } from "@/helpers/inventory";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    HttpError,
    createMenuCategory,
    createMenuItem,
    createMenuModifier,
    cropMenuImage,
    deleteMenuCategory,
    deleteMenuItem,
    deleteMenuModifier,
    fetchMenu,
    formatMoney,
    getCategoryColorHex,
    isOptionAvailable,
    setMenuModifierOptionAvailability,
    updateMenuCategory,
    updateMenuItem,
    updateMenuModifier,
    uploadMenuCategoryImage,
    uploadMenuItemImage,
} from "@/helpers";
import type { CategoryColor, IMenuCategory, IMenuItem, IMenuModifierOptionInput, IModifier } from "@/helpers";
import { NO_CATEGORY_ID, getErrorMessage, getProductCountLabel, getMenuCategoryImageUrl } from "./admin/menu-helpers";
import type { INotice, MenuDialog } from "./admin/menu-helpers";
import { CategoryDialog } from "./admin/menu-category-dialog";
import { ItemDialog } from "./admin/menu-item-dialog";
import type { IItemDraft } from "./admin/menu-item-dialog";
import { ModifierDialog } from "./admin/menu-modifier-dialog";
import { OpsEmpty, OpsSkeleton } from "@/components";

/* ============ Sección ============ */

/**
 * Crear, editar y eliminar categorías y productos sin entrar a Loyverse. Todo se guarda allá,
 * así que aparece en el POS y en la web (cuando se renueva el catálogo).
 */
export const AdminMenu = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [categories, setCategories] = useState<IMenuCategory[]>([]);
    const [items, setItems] = useState<IMenuItem[]>([]);
    const [modifiers, setModifiers] = useState<IModifier[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState<INotice | null>(null);
    const [dialog, setDialog] = useState<MenuDialog | null>(null);
    const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
    // Lo creado en esta visita se marca para encontrarlo en la lista
    const [recentIds, setRecentIds] = useState<string[]>([]);
    const [pendingOptionIds, setPendingOptionIds] = useState<string[]>([]);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const menu = await fetchMenu(token, signal);
                setCategories([...menu.categories].sort((a, b) => a.name.localeCompare(b.name, "es")));
                setItems(menu.items);
                setModifiers([...menu.modifiers].sort((a, b) => a.name.localeCompare(b.name, "es")));
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(getErrorMessage(requestError, "No pudimos cargar el menú."));
            } finally {
                if (!signal?.aborted) setIsLoading(false);
            }
        },
        [token, onSessionExpired]
    );

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        const timer=window.setInterval(()=>void load(controller.signal),60000);
        return () => {controller.abort();window.clearInterval(timer);};
    }, [load]);

    const itemsByCategory = useMemo(() => {
        const groups = new Map<string, IMenuItem[]>();
        items.forEach((item) => {
            const key = item.categoryId && categories.some((category) => category.id === item.categoryId)
                ? item.categoryId
                : NO_CATEGORY_ID;
            groups.set(key, [...(groups.get(key) ?? []), item]);
        });
        groups.forEach((group) => group.sort((a, b) => a.name.localeCompare(b.name, "es")));
        return groups;
    }, [items, categories]);

    const groups = [
        ...categories,
        ...(itemsByCategory.has(NO_CATEGORY_ID) ? [{ id: NO_CATEGORY_ID, name: "Sin categoría", color: "GREY" as const }] : []),
    ];

    const getModifierUsage = (modifierId: string) => items.filter((item) => item.modifierIds.includes(modifierId)).length;

    const getCategoryName = (categoryId: string) => categories.find((category) => category.id === categoryId)?.name ?? "";

    /** Un 401 cierra la sesión; cualquier otro error vuelve al formulario para mostrarlo ahí. */
    const guardSession = (requestError: unknown): never => {
        if (requestError instanceof HttpError && requestError.status === 401) onSessionExpired();
        throw requestError;
    };

    const finish = async (text: string, tone: INotice["tone"] = "ok") => {
        setDialog(null);
        setNotice({ text, tone });
        await load();
    };

    const saveCategory = async (editing: IMenuCategory | null, name: string, color: CategoryColor, photo: File | null) => {
        const { category } = editing
            ? await updateMenuCategory(token, editing.id, name, color).catch(guardSession)
            : await createMenuCategory(token, name, color).catch(guardSession);
        if (!editing) setRecentIds((current) => [...current, category.id]);

        // La categoría ya se guardó en Loyverse: si la foto falla no se deshace, solo se avisa
        if (photo) {
            try {
                await uploadMenuCategoryImage(token, category.id, await cropMenuImage(photo));
            } catch (photoError) {
                console.error("[menu] no se pudo subir la foto de la categoría:", photoError);
                return finish(`${category.name} se guardó, pero la foto no subió. Vuelve a intentarlo desde Editar categoría.`, "warn");
            }
        }

        if (editing) return finish(`Listo: guardamos los cambios de ${category.name}.`);
        return finish(`Listo: la categoría ${category.name} ya existe. Ahora agrégale productos.`);
    };

    const removeCategory = async (category: IMenuCategory) => {
        await deleteMenuCategory(token, category.id).catch(guardSession);
        setOpenCategoryId(null);
        return finish(`Eliminamos la categoría ${category.name}.`);
    };

    const saveItem = async (editing: IMenuItem | null, draft: IItemDraft) => {
        const fields = {
            name: draft.name,
            categoryId: draft.categoryId,
            description: draft.description,
            isAvailable: draft.isAvailable,
            modifierIds: draft.modifierIds,
        };
        const { item } = editing
            ? await updateMenuItem(token, editing.id, { ...fields, price: draft.price }).catch(guardSession)
            : await createMenuItem(token, { ...fields, price: draft.price ?? 0 }).catch(guardSession);

        // El producto ya se guardó: si la foto falla no se deshace, solo se avisa
        let isPhotoMissing = false;
        if (draft.photo) {
            try {
                await uploadMenuItemImage(token, item.id, await cropMenuImage(draft.photo));
            } catch (photoError) {
                console.error("[menu] no se pudo subir la foto:", photoError);
                isPhotoMissing = true;
            }
        }

        const categoryName = getCategoryName(draft.categoryId);
        setOpenCategoryId(draft.categoryId);
        if (!editing) setRecentIds((current) => [...current, item.id]);

        if (isPhotoMissing) {
            return finish(`${item.name} se guardó en ${categoryName}, pero la foto no subió. Vuelve a intentarlo desde Editar.`, "warn");
        }
        if (editing) return finish(`Listo: guardamos los cambios de ${item.name}. En la web se ven en unos minutos.`);
        return finish(
            draft.isAvailable
                ? `Listo: ${item.name} ya está en ${categoryName}. En la web aparece en unos minutos.`
                : `Listo: ${item.name} quedó en ${categoryName}, oculto en la web.`
        );
    };

    const saveModifier = async (editing: IModifier | null, name: string, options: IMenuModifierOptionInput[]) => {
        if (editing) {
            await updateMenuModifier(token, editing.id, name, options).catch(guardSession);
            return finish(`Listo: guardamos los cambios de ${name}. En la web se ven en unos minutos.`);
        }

        await createMenuModifier(token, name, options).catch(guardSession);
        return finish(`Listo: el modificador ${name} ya existe. Márcalo en los productos que lo lleven.`);
    };

    const removeModifier = async (modifier: IModifier) => {
        await deleteMenuModifier(token, modifier.id).catch(guardSession);
        return finish(`Eliminamos el modificador ${modifier.name}.`);
    };

    const setOptionLocally = (optionId: string, isAvailable: boolean) =>
        setModifiers((current) =>
            current.map((modifier) => ({
                ...modifier,
                options: modifier.options.map((option) => (option.id === optionId ? { ...option, isAvailable } : option)),
            }))
        );

    /** Se cambia en pantalla al instante y se deshace si el API no lo acepta. */
    const toggleOptionAvailability = async (modifier: IModifier, optionId: string) => {
        const option = modifier.options.find((entry) => entry.id === optionId);
        if (!option || pendingOptionIds.includes(optionId)) return;

        const nextValue = !isOptionAvailable(option);
        setError("");
        setPendingOptionIds((current) => [...current, optionId]);
        setOptionLocally(optionId, nextValue);

        try {
            await setMenuModifierOptionAvailability(token, optionId, nextValue);
        } catch (requestError) {
            setOptionLocally(optionId, !nextValue);
            if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
            setError(getErrorMessage(requestError, `No pudimos cambiar ${modifier.name} ${option.name}. Quedó como estaba.`));
        } finally {
            setPendingOptionIds((current) => current.filter((id) => id !== optionId));
        }
    };

    const removeItem = async (item: IMenuItem) => {
        await deleteMenuItem(token, item.id).catch(guardSession);
        return finish(`Eliminamos ${item.name}. En la web desaparece en unos minutos.`);
    };

    return (
        <section className="adm-band">

            <div className="adm-menu-actions">
                <button
                    type="button"
                    className="adm-menu-action adm-menu-action--category"
                    onClick={() => setDialog({ kind: "category", editing: null })}
                >
                    <span className="adm-menu-action__plus" aria-hidden>+</span>
                    <span>
                        <b>Nueva categoría</b>
                        <em>Un grupo del menú, como Galletas o Bebidas</em>
                    </span>
                </button>
                <button
                    type="button"
                    className="adm-menu-action adm-menu-action--item"
                    onClick={() => setDialog({ kind: "item", editing: null })}
                    disabled={isLoading || categories.length === 0}
                >
                    <span className="adm-menu-action__plus" aria-hidden>+</span>
                    <span>
                        <b>Nuevo producto</b>
                        <em>{categories.length === 0 && !isLoading ? "Primero crea una categoría" : "Nombre, foto y precio, y listo"}</em>
                    </span>
                </button>
            </div>

            {notice ? (
                <div className={`adm-menu-notice is-${notice.tone}`} role="status">
                    <p>{notice.text}</p>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setNotice(null)}>Entendido</button>
                </div>
            ) : null}

            {error ? <p className="adm-error">{error}</p> : null}

            <div className="adm-card adm-menu-list">
                <div className="adm-card-head">
                    <div className="grow">
                        <h3 className="script">Lo que ya hay</h3>
                        <p className="adm-note">Toca una categoría para ver sus productos y editarlos.</p>
                    </div>
                </div>

                {isLoading ? (
                    <OpsSkeleton label="Cargando el menú…" />
                ) : groups.length === 0 ? (
                    <OpsEmpty title="Todavía no hay categorías. Crea la primera con el botón de arriba." />
                ) : (
                    <ul className="adm-menu-cats">
                        {groups.map((category) => {
                            const categoryItems = itemsByCategory.get(category.id) ?? [];
                            const isOpen = openCategoryId === category.id;
                            const isRealCategory = category.id !== NO_CATEGORY_ID;

                            return (
                                <li key={category.id} className="adm-menu-cat">
                                    <button
                                        type="button"
                                        className="adm-menu-cat__head"
                                        aria-expanded={isOpen}
                                        onClick={() => setOpenCategoryId(isOpen ? null : category.id)}
                                    >
                                        {isRealCategory && getMenuCategoryImageUrl(category) ? (
                                            <img
                                                className="adm-menu-cat__thumb"
                                                src={getMenuCategoryImageUrl(category)}
                                                alt=""
                                                loading="lazy"
                                                style={{ borderColor: getCategoryColorHex(category.color) }}
                                            />
                                        ) : (
                                            <span className="adm-menu-cat__dot" style={{ background: getCategoryColorHex(category.color) }} />
                                        )}
                                        <span className="adm-menu-cat__info">
                                            <span className="adm-menu-cat__name">{category.name}</span>
                                            {recentIds.includes(category.id) ? <span className="adm-pill is-new">Recién creada</span> : null}
                                        </span>
                                        <span className="adm-menu-cat__count">{getProductCountLabel(categoryItems.length)}</span>
                                        <svg className="adm-menu-cat__chev" viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
                                    </button>

                                    {isOpen ? (
                                        <div className="adm-menu-cat__body">
                                            {categoryItems.length === 0 ? (
                                                <OpsEmpty title="Sin productos todavía." />
                                            ) : (
                                                <ul className="adm-menu-items">
                                                    {categoryItems.map((item) => (
                                                        <li key={item.id}>
                                                            {item.imageUrl ? (
                                                                <img className="adm-menu-items__thumb" src={item.imageUrl} alt="" loading="lazy" />
                                                            ) : (
                                                                <span className="adm-menu-items__thumb" aria-hidden />
                                                            )}
                                                            <span className="adm-menu-items__info">
                                                                <span className="adm-menu-items__name">{item.name}</span>
                                                                {recentIds.includes(item.id) ? (
                                                                    <span className="adm-pill is-new">Recién creado</span>
                                                                ) : (
                                                                    <span className={`adm-pill is-${item.isAvailable ? "ok" : "idle"}`}>
                                                                        {item.isAvailable ? "A la venta" : "Oculto"}
                                                                    </span>
                                                                )}
                                                                {item.variants?.some(v=>v.availability)?<span className="adm-note adm-menu-items__note">{item.variants.filter(v=>v.availability).map(v=>{const a=v.availability!;return <span key={v.variantId}>{item.variantCount>1?v.name+": ":""}{availabilityLabel(a)} · {a.productionMode==="BATCH"?"Stock: "+a.usableStock:"Se pueden preparar: "+a.maxProducible}{a.limitingIngredient?" · Limitado por: "+a.limitingIngredient:""}{a.nextExpiration?" · "+expirationLabel(a.nextExpiration):""}{a.warning?" · "+a.warning:""}</span>;})}</span>:null}
                                                            </span>
                                                            {item.variants?.length?<button type="button" className="adm-btn adm-btn--sm adm-menu-items__action" onClick={()=>setDialog({kind:"recipe",editing:item})}>Receta / Producir lote</button>:null}
                                                            <span className="adm-menu-items__price">
                                                                {item.price === null ? "Precio libre" : `B/. ${formatMoney(item.price)}`}
                                                                {item.variantCount > 1 ? <em> y más</em> : null}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="adm-btn adm-btn--sm adm-menu-items__action"
                                                                onClick={() => setDialog({ kind: "item", editing: item })}
                                                                aria-label={`Editar ${item.name}`}
                                                            >
                                                                Editar
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {isRealCategory ? (
                                                <button
                                                    type="button"
                                                    className="adm-btn adm-btn--sm adm-menu-cat__edit"
                                                    onClick={() => setDialog({ kind: "category", editing: category })}
                                                >
                                                    Editar categoría
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="adm-card adm-menu-list">
                <div className="adm-card-head">
                    <div className="grow">
                        <h3 className="script">Modificadores</h3>
                        <p className="adm-note">Toca una opción para marcarla agotada o volver a ofrecerla. La web la muestra como “Agotado”.</p>
                    </div>
                    <button
                        type="button"
                        className="adm-btn adm-btn--solid"
                        onClick={() => setDialog({ kind: "modifier", editing: null })}
                        disabled={isLoading}
                    >
                        Nuevo modificador
                    </button>
                </div>

                {isLoading ? null : modifiers.length === 0 ? (
                    <OpsEmpty title="Todavía no hay modificadores. Crea uno y márcalo en los productos que lo lleven." />
                ) : (
                    <ul className="adm-mods">
                        {modifiers.map((modifier) => {
                            const usedIn = getModifierUsage(modifier.id);
                            return (
                                <li key={modifier.id}>
                                    <span className="adm-mods__main">
                                        <b>{modifier.name}</b>
                                        <span className="adm-mods__chips">
                                            {modifier.options.map((option) => {
                                                const isAvailable = isOptionAvailable(option);
                                                return (
                                                    <button
                                                        key={option.id}
                                                        type="button"
                                                        className={`adm-optchip${isAvailable ? "" : " is-off"}`}
                                                        aria-pressed={!isAvailable}
                                                        aria-label={`${option.name}: ${isAvailable ? "disponible, tocar para agotar" : "agotado, tocar para volver a ofrecer"}`}
                                                        disabled={pendingOptionIds.includes(option.id)}
                                                        onClick={() => void toggleOptionAvailability(modifier, option.id)}
                                                    >
                                                        {option.name}
                                                        {option.price > 0 ? ` +${formatMoney(option.price)}` : ""}
                                                        {isAvailable ? null : <small>agotado</small>}
                                                    </button>
                                                );
                                            })}
                                        </span>
                                    </span>
                                    <span className={`adm-mods__used${usedIn === 0 ? " is-idle" : ""}`}>
                                        {usedIn === 0 ? "sin usar" : `en ${getProductCountLabel(usedIn)}`}
                                    </span>
                                    <button
                                        type="button"
                                        className="adm-btn adm-btn--sm"
                                        onClick={() => setDialog({ kind: "modifier", editing: modifier })}
                                        aria-label={`Editar ${modifier.name}`}
                                    >
                                        Editar
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {dialog?.kind === "recipe" ? (
                <RecipeDialog
                    token={token}
                    item={dialog.editing}
                    onClose={() => setDialog(null)}
                    onChanged={load}
                    modifiers={dialog.editing.modifierIds
                        .map((id) => modifiers.find((modifier) => modifier.id === id))
                        .filter((modifier): modifier is IModifier => Boolean(modifier))}
                    usedBy={Object.fromEntries(
                        modifiers.map((modifier) => [
                            modifier.id,
                            items.filter((entry) => entry.modifierIds.includes(modifier.id)).map((entry) => entry.name),
                        ])
                    )}
                />
            ) : null}
            {dialog?.kind === "category" ? (
                <CategoryDialog
                    editing={dialog.editing}
                    itemCount={dialog.editing ? (itemsByCategory.get(dialog.editing.id)?.length ?? 0) : 0}
                    onSave={(name, color, photo) => saveCategory(dialog.editing, name, color, photo)}
                    onDelete={() => (dialog.editing ? removeCategory(dialog.editing) : Promise.resolve())}
                    onClose={() => setDialog(null)}
                />
            ) : null}
            {dialog?.kind === "item" ? (
                <ItemDialog
                    editing={dialog.editing}
                    categories={categories}
                    modifiers={modifiers}
                    initialCategoryId={openCategoryId && openCategoryId !== NO_CATEGORY_ID ? openCategoryId : ""}
                    onSave={(draft) => saveItem(dialog.editing, draft)}
                    onDelete={() => (dialog.editing ? removeItem(dialog.editing) : Promise.resolve())}
                    onClose={() => setDialog(null)}
                />
            ) : null}
            {dialog?.kind === "modifier" ? (
                <ModifierDialog
                    editing={dialog.editing}
                    itemCount={dialog.editing ? getModifierUsage(dialog.editing.id) : 0}
                    onSave={(name, options) => saveModifier(dialog.editing, name, options)}
                    onDelete={() => (dialog.editing ? removeModifier(dialog.editing) : Promise.resolve())}
                    onClose={() => setDialog(null)}
                />
            ) : null}
        </section>
    );
};
