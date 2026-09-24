import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import {
    CATEGORY_COLORS,
    HttpError,
    MENU_IMAGE_SIDE,
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
    updateMenuCategory,
    updateMenuItem,
    updateMenuModifier,
    uploadMenuItemImage,
} from "@/helpers";
import type { CategoryColor, IMenuCategory, IMenuItem, IMenuModifierOptionInput, IModifier } from "@/helpers";

/** Grupo de los productos que en Loyverse no tienen categoria (la web no los muestra). */
const NO_CATEGORY_ID = "__sin-categoria__";

interface INotice {
    text: string;
    tone: "ok" | "warn";
}

type MenuDialog =
    | { kind: "category"; editing: IMenuCategory | null }
    | { kind: "item"; editing: IMenuItem | null }
    | { kind: "modifier"; editing: IModifier | null };

const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof HttpError ? error.message : fallback;

const getProductCountLabel = (count: number) => (count === 1 ? "1 producto" : `${count} productos`);

/** "Entera · Avena +0.50": lo que el cliente ve al elegir. */
const getOptionsSummary = (modifier: IModifier) =>
    modifier.options.map((option) => (option.price > 0 ? `${option.name} +${formatMoney(option.price)}` : option.name)).join(" · ");

/* ============ Eliminar (se confirma en el mismo formulario) ============ */

interface IDeleteConfirmProps {
    name: string;
    detail: string;
    isDeleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const DeleteConfirm = ({ name, detail, isDeleting, onConfirm, onCancel }: IDeleteConfirmProps) => (
    <div className="adm-menu-confirm" role="alert">
        <b>¿Eliminar {name}?</b>
        <p>{detail}</p>
        <div className="adm-modal__actions">
            <button type="button" className="adm-btn" onClick={onCancel} disabled={isDeleting} autoFocus>No, volver</button>
            <button type="button" className="adm-btn adm-btn--danger" onClick={onConfirm} disabled={isDeleting}>
                {isDeleting ? "Eliminando…" : "Sí, eliminar"}
            </button>
        </div>
    </div>
);

/**
 * Los botones del pie del formulario. Al editar, "Eliminar" queda a la izquierda,
 * lejos de Guardar, y abre la confirmación en su lugar.
 */
interface IDialogActionsProps {
    isEditing: boolean;
    isSending: boolean;
    saveLabel: string;
    sendingLabel: string;
    /** Por qué no se puede eliminar (ej. la categoría tiene productos). */
    deleteBlockedReason?: string;
    onAskDelete: () => void;
    onClose: () => void;
}

const DialogActions = ({
    isEditing,
    isSending,
    saveLabel,
    sendingLabel,
    deleteBlockedReason,
    onAskDelete,
    onClose,
}: IDialogActionsProps) => (
    <div className="adm-modal__actions adm-menu-actions-row">
        {isEditing ? (
            <button
                type="button"
                className="adm-btn adm-menu-delete"
                onClick={onAskDelete}
                disabled={isSending || Boolean(deleteBlockedReason)}
            >
                Eliminar
            </button>
        ) : null}
        <button type="button" className="adm-btn" onClick={onClose} disabled={isSending}>Cancelar</button>
        <button type="submit" className="adm-btn adm-btn--solid" disabled={isSending}>
            {isSending ? sendingLabel : saveLabel}
        </button>
    </div>
);

/* ============ Categoría ============ */

interface ICategoryDialogProps {
    /** Null es una categoría nueva. */
    editing: IMenuCategory | null;
    itemCount: number;
    onSave: (name: string, color: CategoryColor) => Promise<void>;
    onDelete: () => Promise<void>;
    onClose: () => void;
}

const CategoryDialog = ({ editing, itemCount, onSave, onDelete, onClose }: ICategoryDialogProps) => {
    const [name, setName] = useState(editing?.name ?? "");
    const [color, setColor] = useState<CategoryColor>(editing?.color ?? "ORANGE");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const deleteBlockedReason = itemCount > 0
        ? itemCount === 1
            ? "Para eliminarla, primero mueve o elimina su producto."
            : `Para eliminarla, primero mueve o elimina sus ${getProductCountLabel(itemCount)}.`
        : undefined;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!name.trim()) {
            setError("Escribe el nombre de la categoría.");
            return;
        }

        setIsSending(true);
        setError("");

        try {
            await onSave(name.trim(), color);
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No se pudo guardar la categoría."));
            setIsSending(false);
        }
    };

    const confirmDelete = async () => {
        setIsSending(true);
        setError("");

        try {
            await onDelete();
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No se pudo eliminar la categoría."));
            setIsConfirmingDelete(false);
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal adm-menu-modal" role="dialog" aria-modal="true" aria-label={editing ? "Editar categoría" : "Nueva categoría"}>
            <form className="adm-modal__panel adm-modal__panel--wide" onSubmit={submit}>
                <h3 className="script">{editing ? editing.name : "Nueva categoría"}</h3>
                <p className="adm-modal__hint">
                    {editing ? "Cambia el nombre o el color." : "Queda vacía hasta que le agregues productos."}
                </p>

                <div className="adm-form adm-form--single">
                    <label className="adm-form__row">
                        <span>Nombre</span>
                        <input
                            id="menu-category-name"
                            className="adm-form__input adm-menu-input"
                            type="text"
                            autoFocus
                            maxLength={64}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Especiales de otoño"
                        />
                    </label>

                    <div className="adm-form__row">
                        <span id="menu-category-color">Color en el POS</span>
                        <div className="adm-swatches" role="radiogroup" aria-labelledby="menu-category-color">
                            {CATEGORY_COLORS.map((one) => (
                                <button
                                    key={one.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={color === one.id}
                                    aria-label={one.label}
                                    title={one.label}
                                    className="adm-swatch"
                                    style={{ background: one.hex }}
                                    onClick={() => setColor(one.id)}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {editing && deleteBlockedReason ? <p className="adm-menu-blocked">{deleteBlockedReason}</p> : null}
                {error ? <p className="adm-gate__error">{error}</p> : null}

                {isConfirmingDelete && editing ? (
                    <DeleteConfirm
                        name={editing.name}
                        detail="Se borra de Loyverse y deja de salir en el POS. No se puede deshacer."
                        isDeleting={isSending}
                        onConfirm={() => void confirmDelete()}
                        onCancel={() => setIsConfirmingDelete(false)}
                    />
                ) : (
                    <DialogActions
                        isEditing={Boolean(editing)}
                        isSending={isSending}
                        saveLabel={editing ? "Guardar cambios" : "Crear categoría"}
                        sendingLabel={editing ? "Guardando…" : "Creando…"}
                        deleteBlockedReason={deleteBlockedReason}
                        onAskDelete={() => setIsConfirmingDelete(true)}
                        onClose={onClose}
                    />
                )}
            </form>
        </div>
    );
};

/* ============ Producto ============ */

interface IItemDraft {
    name: string;
    categoryId: string;
    /** Falta cuando el producto tiene varias variantes: no se cambia desde aquí. */
    price?: number;
    description: string;
    isAvailable: boolean;
    modifierIds: string[];
    photo: File | null;
}

interface IItemDialogProps {
    /** Null es un producto nuevo. */
    editing: IMenuItem | null;
    categories: IMenuCategory[];
    modifiers: IModifier[];
    initialCategoryId: string;
    onSave: (draft: IItemDraft) => Promise<void>;
    onDelete: () => Promise<void>;
    onClose: () => void;
}

/** "3,50", "3.5" o "B/. 3.50" → 3.5. NaN si no es un número. */
const parsePrice = (value: string) => Number(value.replace(/[^\d.,]/g, "").replace(",", "."));

const ItemDialog = ({ editing, categories, modifiers, initialCategoryId, onSave, onDelete, onClose }: IItemDialogProps) => {
    const hasVariants = (editing?.variantCount ?? 1) > 1;

    const [name, setName] = useState(editing?.name ?? "");
    const [categoryId, setCategoryId] = useState(editing?.categoryId ?? initialCategoryId);
    const [price, setPrice] = useState(editing?.price != null ? editing.price.toFixed(2) : "");
    const [description, setDescription] = useState(editing?.description ?? "");
    const [isAvailable, setIsAvailable] = useState(editing?.isAvailable ?? true);
    // En el orden en que se marcan: asi los ve el cliente
    const [modifierIds, setModifierIds] = useState<string[]>(editing?.modifierIds ?? []);
    const [photo, setPhoto] = useState<File | null>(null);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    // La vista previa vive lo que viva la foto elegida
    const newPhotoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
    useEffect(() => () => {
        if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl);
    }, [newPhotoUrl]);
    const previewUrl = newPhotoUrl || editing?.imageUrl || "";

    const toggleModifier = (modifierId: string) =>
        setModifierIds((current) =>
            current.includes(modifierId) ? current.filter((id) => id !== modifierId) : [...current, modifierId]
        );

    const pickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setError("Elige una foto (JPG o PNG).");
            return;
        }
        setError("");
        setPhoto(file);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        const amount = parsePrice(price);
        if (!name.trim()) return setError("Escribe el nombre del producto.");
        if (!categoryId) return setError("Elige la categoría.");
        if (!hasVariants && (!Number.isFinite(amount) || amount <= 0)) {
            return setError("Escribe un precio mayor que cero, por ejemplo 3,50.");
        }

        setIsSending(true);
        setError("");

        try {
            await onSave({
                name: name.trim(),
                categoryId,
                price: hasVariants ? undefined : amount,
                description: description.trim(),
                isAvailable,
                // Los que ya no existen en Loyverse no se reenvian
                modifierIds: modifierIds.filter((id) => modifiers.some((modifier) => modifier.id === id)),
                photo,
            });
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No se pudo guardar el producto."));
            setIsSending(false);
        }
    };

    const confirmDelete = async () => {
        setIsSending(true);
        setError("");

        try {
            await onDelete();
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No se pudo eliminar el producto."));
            setIsConfirmingDelete(false);
            setIsSending(false);
        }
    };

    const savingLabel = photo ? "Guardando y subiendo foto…" : "Guardando…";

    return (
        <div className="adm-modal adm-menu-modal" role="dialog" aria-modal="true" aria-label={editing ? "Editar producto" : "Nuevo producto"}>
            <form className="adm-modal__panel adm-modal__panel--wide" onSubmit={submit}>
                <h3 className="script">{editing ? editing.name : "Nuevo producto"}</h3>
                <p className="adm-modal__hint">
                    {editing
                        ? "Cambia lo que necesites. Una foto nueva reemplaza a la anterior."
                        : "Se crea en Loyverse con este precio para el local y la web."}
                </p>

                <div className="adm-form">
                    <div className="adm-form__row adm-form__row--full">
                        <span>Foto <em>(opcional)</em></span>
                        <label className="adm-photo" htmlFor="menu-item-photo">
                            {previewUrl ? (
                                <img className="adm-photo__img" src={previewUrl} alt="" />
                            ) : (
                                <span className="adm-photo__img adm-photo__img--empty" aria-hidden>
                                    <svg viewBox="0 0 24 24"><path d="M4 7h3l2-3h6l2 3h3v13H4z" /><circle cx="12" cy="13" r="4" /></svg>
                                </span>
                            )}
                            <span>
                                <b>{previewUrl ? "Cambiar foto" : "Agregar foto"}</b>
                                <em>
                                    Tómala o elígela. Se recorta cuadrada ({MENU_IMAGE_SIDE}×{MENU_IMAGE_SIDE}): queda lo que ves en el cuadro.
                                </em>
                            </span>
                        </label>
                        <input
                            id="menu-item-photo"
                            className="adm-sr-only"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/*"
                            onChange={pickPhoto}
                        />
                    </div>

                    <label className="adm-form__row adm-form__row--full">
                        <span>Nombre</span>
                        <input
                            id="menu-item-name"
                            className="adm-form__input adm-menu-input"
                            type="text"
                            autoFocus={!editing}
                            maxLength={64}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Galleta Nutella"
                        />
                    </label>

                    <label className={`adm-form__row${hasVariants ? " adm-form__row--full" : ""}`}>
                        <span>Categoría</span>
                        <select
                            id="menu-item-category"
                            className="adm-form__input adm-menu-input"
                            value={categoryId}
                            onChange={(event) => setCategoryId(event.target.value)}
                        >
                            <option value="" disabled>Elige una</option>
                            {categories.map((category) => (
                                <option key={category.id} value={category.id}>{category.name}</option>
                            ))}
                        </select>
                    </label>

                    {hasVariants ? (
                        <p className="adm-form__note adm-form__row--full">
                            Tiene {editing?.variantCount} variantes (tamaños o sabores), cada una con su precio. Los precios se cambian en Loyverse.
                        </p>
                    ) : (
                        <label className="adm-form__row">
                            <span>Precio</span>
                            <span className="adm-money">
                                <b aria-hidden>B/.</b>
                                <input
                                    id="menu-item-price"
                                    className="adm-form__input adm-menu-input"
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    value={price}
                                    onChange={(event) => setPrice(event.target.value)}
                                    placeholder="3,50"
                                />
                            </span>
                        </label>
                    )}

                    <label className="adm-form__row adm-form__row--full">
                        <span>Descripción <em>(opcional)</em></span>
                        <textarea
                            id="menu-item-description"
                            className="adm-form__input adm-form__textarea"
                            maxLength={2000}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="Rellena de Nutella, crujiente por fuera."
                        />
                    </label>
                </div>

                {modifiers.length > 0 ? (
                    <fieldset className="adm-modpick">
                        <legend>Modificadores <em>(opcional)</em></legend>
                        {modifiers.map((modifier) => {
                            const isOn = modifierIds.includes(modifier.id);
                            return (
                                <label key={modifier.id} className={`adm-modpick__row${isOn ? " is-on" : ""}`}>
                                    <input
                                        id={`menu-item-modifier-${modifier.id}`}
                                        type="checkbox"
                                        checked={isOn}
                                        onChange={() => toggleModifier(modifier.id)}
                                    />
                                    <span>
                                        <b>{modifier.name}</b>
                                        <em>{getOptionsSummary(modifier)}</em>
                                    </span>
                                    {isOn && modifierIds.length > 1 ? (
                                        <span className="adm-modpick__order" aria-label="Orden">{modifierIds.indexOf(modifier.id) + 1}</span>
                                    ) : null}
                                </label>
                            );
                        })}
                        <p className="adm-note">El cliente los ve en el orden en que los marcas.</p>
                    </fieldset>
                ) : null}

                <label className="adm-switch adm-menu-switch">
                    <input
                        id="menu-item-available"
                        type="checkbox"
                        checked={isAvailable}
                        onChange={(event) => setIsAvailable(event.target.checked)}
                    />
                    <span className="adm-switch__track" aria-hidden />
                    <span>
                        <b>A la venta</b>
                        <em>{isAvailable ? "Se ve en la web" : "Oculto en la web"}</em>
                    </span>
                </label>

                {error ? <p className="adm-gate__error">{error}</p> : null}

                {isConfirmingDelete && editing ? (
                    <DeleteConfirm
                        name={editing.name}
                        detail="Se borra de Loyverse: deja de salir en la web y en el POS. No se puede deshacer. Las ventas pasadas no se tocan."
                        isDeleting={isSending}
                        onConfirm={() => void confirmDelete()}
                        onCancel={() => setIsConfirmingDelete(false)}
                    />
                ) : (
                    <DialogActions
                        isEditing={Boolean(editing)}
                        isSending={isSending}
                        saveLabel={editing ? "Guardar cambios" : "Crear producto"}
                        sendingLabel={editing ? savingLabel : photo ? "Creando y subiendo foto…" : "Creando…"}
                        onAskDelete={() => setIsConfirmingDelete(true)}
                        onClose={onClose}
                    />
                )}
            </form>
        </div>
    );
};

/* ============ Modificador ============ */

/** Una fila del formulario. `key` es local: las opciones nuevas todavía no tienen id. */
interface IOptionRow {
    key: number;
    id?: string;
    name: string;
    price: string;
}

interface IModifierDialogProps {
    /** Null es un modificador nuevo. */
    editing: IModifier | null;
    itemCount: number;
    onSave: (name: string, options: IMenuModifierOptionInput[]) => Promise<void>;
    onDelete: () => Promise<void>;
    onClose: () => void;
}

let optionRowKey = 0;
const createOptionRow = (option?: { id: string; name: string; price: number }): IOptionRow => ({
    key: ++optionRowKey,
    id: option?.id,
    name: option?.name ?? "",
    price: option && option.price > 0 ? option.price.toFixed(2) : "",
});

const ModifierDialog = ({ editing, itemCount, onSave, onDelete, onClose }: IModifierDialogProps) => {
    const [name, setName] = useState(editing?.name ?? "");
    const [rows, setRows] = useState<IOptionRow[]>(() =>
        editing ? editing.options.map((option) => createOptionRow(option)) : [createOptionRow()]
    );
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const changeRow = (key: number, field: "name" | "price", value: string) =>
        setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

    const removeRow = (key: number) => setRows((current) => current.filter((row) => row.key !== key));

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        // Las filas sin nombre se ignoran: es la fila vacía que queda al final
        const filled = rows.filter((row) => row.name.trim());
        if (!name.trim()) return setError("Escribe el nombre del modificador.");
        if (filled.length === 0) return setError("Agrega al menos una opción.");

        const options = filled.map((row) => ({
            ...(row.id ? { id: row.id } : {}),
            name: row.name.trim(),
            price: row.price.trim() ? parsePrice(row.price) : 0,
        }));
        if (options.some((option) => !Number.isFinite(option.price) || option.price < 0)) {
            return setError("Revisa los precios extra: déjalos vacíos o escribe un número, por ejemplo 0,50.");
        }

        setIsSending(true);
        setError("");

        try {
            await onSave(name.trim(), options);
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No se pudo guardar el modificador."));
            setIsSending(false);
        }
    };

    const confirmDelete = async () => {
        setIsSending(true);
        setError("");

        try {
            await onDelete();
        } catch (requestError) {
            setError(getErrorMessage(requestError, "No se pudo eliminar el modificador."));
            setIsConfirmingDelete(false);
            setIsSending(false);
        }
    };

    return (
        <div className="adm-modal adm-menu-modal" role="dialog" aria-modal="true" aria-label={editing ? "Editar modificador" : "Nuevo modificador"}>
            <form className="adm-modal__panel adm-modal__panel--wide" onSubmit={submit}>
                <h3 className="script">{editing ? editing.name : "Nuevo modificador"}</h3>
                <p className="adm-modal__hint">
                    Las opciones con precio suman al producto; sin precio no cobran extra. Con una sola opción el cliente
                    la marca o no; con varias, elige una.
                </p>

                <div className="adm-form adm-form--single">
                    <label className="adm-form__row">
                        <span>Nombre</span>
                        <input
                            id="menu-modifier-name"
                            className="adm-form__input adm-menu-input"
                            type="text"
                            autoFocus
                            maxLength={40}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Leche"
                        />
                    </label>

                    <div className="adm-form__row">
                        <span id="menu-modifier-options">Opciones</span>
                        <div className="adm-optrows" role="group" aria-labelledby="menu-modifier-options">
                            {rows.map((row, index) => (
                                <div key={row.key} className="adm-optrow">
                                    <input
                                        id={`menu-modifier-option-${row.key}`}
                                        className="adm-form__input adm-menu-input"
                                        type="text"
                                        maxLength={40}
                                        value={row.name}
                                        onChange={(event) => changeRow(row.key, "name", event.target.value)}
                                        placeholder={index === 0 ? "Avena" : "Otra opción"}
                                        aria-label={`Opción ${index + 1}`}
                                    />
                                    <span className="adm-money adm-money--extra">
                                        <b aria-hidden>+B/.</b>
                                        <input
                                            id={`menu-modifier-price-${row.key}`}
                                            className="adm-form__input adm-menu-input"
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            value={row.price}
                                            onChange={(event) => changeRow(row.key, "price", event.target.value)}
                                            placeholder="0,00"
                                            aria-label={`Precio extra de la opción ${index + 1}`}
                                        />
                                    </span>
                                    <button
                                        type="button"
                                        className="adm-optrow__remove"
                                        onClick={() => removeRow(row.key)}
                                        disabled={rows.length === 1}
                                        aria-label={`Quitar ${row.name || `la opción ${index + 1}`}`}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="adm-optrows__add"
                            onClick={() => setRows((current) => [...current, createOptionRow()])}
                            disabled={rows.length >= 30}
                        >
                            + Agregar opción
                        </button>
                    </div>
                </div>

                {editing && itemCount > 0 ? (
                    <p className="adm-menu-blocked">
                        Se usa en {getProductCountLabel(itemCount)}. Si lo eliminas, se les quita.
                    </p>
                ) : null}
                {error ? <p className="adm-gate__error">{error}</p> : null}

                {isConfirmingDelete && editing ? (
                    <DeleteConfirm
                        name={editing.name}
                        detail={
                            itemCount > 0
                                ? `Se quita de ${getProductCountLabel(itemCount)} y deja de ofrecerse en la web y el POS. Los pedidos pasados no cambian.`
                                : "Se borra de Loyverse. No se puede deshacer."
                        }
                        isDeleting={isSending}
                        onConfirm={() => void confirmDelete()}
                        onCancel={() => setIsConfirmingDelete(false)}
                    />
                ) : (
                    <DialogActions
                        isEditing={Boolean(editing)}
                        isSending={isSending}
                        saveLabel={editing ? "Guardar cambios" : "Crear modificador"}
                        sendingLabel={editing ? "Guardando…" : "Creando…"}
                        onAskDelete={() => setIsConfirmingDelete(true)}
                        onClose={onClose}
                    />
                )}
            </form>
        </div>
    );
};

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
        return () => controller.abort();
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

    const saveCategory = async (editing: IMenuCategory | null, name: string, color: CategoryColor) => {
        if (editing) {
            const { category } = await updateMenuCategory(token, editing.id, name, color).catch(guardSession);
            return finish(`Listo: guardamos los cambios de ${category.name}.`);
        }

        const { category } = await createMenuCategory(token, name, color).catch(guardSession);
        setRecentIds((current) => [...current, category.id]);
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

    const removeItem = async (item: IMenuItem) => {
        await deleteMenuItem(token, item.id).catch(guardSession);
        return finish(`Eliminamos ${item.name}. En la web desaparece en unos minutos.`);
    };

    return (
        <section className="adm-band">
            <div className="adm-band__head">
                <h2 className="script">Menú</h2>
                <span className="adm-band__sub">Lo que crees aquí aparece en la web y en el POS de Loyverse</span>
                <span className="adm-src">Loyverse</span>
            </div>

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
                    <p className="adm-empty">Cargando el menú…</p>
                ) : groups.length === 0 ? (
                    <p className="adm-empty">Todavía no hay categorías. Crea la primera con el botón de arriba.</p>
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
                                        <span className="adm-menu-cat__dot" style={{ background: getCategoryColorHex(category.color) }} />
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
                                                <p className="adm-empty">Sin productos todavía.</p>
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
                                                            </span>
                                                            <span className="adm-menu-items__price">
                                                                {item.price === null ? "Precio libre" : `B/. ${formatMoney(item.price)}`}
                                                                {item.variantCount > 1 ? <em> y más</em> : null}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="adm-btn adm-btn--sm"
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
                        <p className="adm-note">Extras y opciones que el cliente elige al pedir. Con 1 opción es una casilla; con varias, elige una.</p>
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
                    <p className="adm-empty">Todavía no hay modificadores. Crea uno y márcalo en los productos que lo lleven.</p>
                ) : (
                    <ul className="adm-mods">
                        {modifiers.map((modifier) => {
                            const usedIn = getModifierUsage(modifier.id);
                            return (
                                <li key={modifier.id}>
                                    <span className="adm-mods__main">
                                        <b>{modifier.name}</b>
                                        <em>{getOptionsSummary(modifier)}</em>
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

            {dialog?.kind === "category" ? (
                <CategoryDialog
                    editing={dialog.editing}
                    itemCount={dialog.editing ? (itemsByCategory.get(dialog.editing.id)?.length ?? 0) : 0}
                    onSave={(name, color) => saveCategory(dialog.editing, name, color)}
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
