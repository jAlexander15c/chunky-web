import { useState } from "react";
import type { FormEvent } from "react";
import type { IMenuCategory, IMenuItem, IModifier } from "@/helpers";
import { getErrorMessage, getOptionsSummary, usePhotoDraft, parsePrice } from "./menu-helpers";
import { PhotoField, DeleteConfirm, DialogActions } from "./menu-shared";

/* ============ Producto ============ */

export interface IItemDraft {
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

export const ItemDialog = ({ editing, categories, modifiers, initialCategoryId, onSave, onDelete, onClose }: IItemDialogProps) => {
    const hasVariants = (editing?.variantCount ?? 1) > 1;

    const [name, setName] = useState(editing?.name ?? "");
    const [categoryId, setCategoryId] = useState(editing?.categoryId ?? initialCategoryId);
    const [price, setPrice] = useState(editing?.price != null ? editing.price.toFixed(2) : "");
    const [description, setDescription] = useState(editing?.description ?? "");
    const [isAvailable, setIsAvailable] = useState(editing?.isAvailable ?? true);
    // En el orden en que se marcan: asi los ve el cliente
    const [modifierIds, setModifierIds] = useState<string[]>(editing?.modifierIds ?? []);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const { photo, previewUrl, pickPhoto } = usePhotoDraft(editing?.imageUrl ?? "", setError);

    const toggleModifier = (modifierId: string) =>
        setModifierIds((current) =>
            current.includes(modifierId) ? current.filter((id) => id !== modifierId) : [...current, modifierId]
        );

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
                    <PhotoField inputId="menu-item-photo" previewUrl={previewUrl} onPick={pickPhoto} />

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
