import { useState } from "react";
import type { FormEvent } from "react";
import { CATEGORY_COLORS } from "@/helpers";
import type { CategoryColor, IMenuCategory } from "@/helpers";
import { getErrorMessage, getProductCountLabel, usePhotoDraft, getMenuCategoryImageUrl } from "./menu-helpers";
import { PhotoField, DeleteConfirm, DialogActions } from "./menu-shared";

/* ============ Categoría ============ */

interface ICategoryDialogProps {
    /** Null es una categoría nueva. */
    editing: IMenuCategory | null;
    itemCount: number;
    onSave: (name: string, color: CategoryColor, photo: File | null) => Promise<void>;
    onDelete: () => Promise<void>;
    onClose: () => void;
}

export const CategoryDialog = ({ editing, itemCount, onSave, onDelete, onClose }: ICategoryDialogProps) => {
    const [name, setName] = useState(editing?.name ?? "");
    const [color, setColor] = useState<CategoryColor>(editing?.color ?? "ORANGE");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const { photo, previewUrl, pickPhoto } = usePhotoDraft(editing ? getMenuCategoryImageUrl(editing) : "", setError);

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
            await onSave(name.trim(), color, photo);
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
                    {editing
                        ? "Cambia el nombre, el color o la foto. La foto sale en la página de inicio."
                        : "Queda vacía hasta que le agregues productos."}
                </p>

                <div className="adm-form adm-form--single">
                    <PhotoField inputId="menu-category-photo" previewUrl={previewUrl} onPick={pickPhoto} />

                    <label className="adm-form__row">
                        <span>Nombre</span>
                        <input
                            id="menu-category-name"
                            className="adm-form__input adm-menu-input"
                            type="text"
                            autoFocus={!editing}
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
                        sendingLabel={photo ? (editing ? "Guardando y subiendo foto…" : "Creando y subiendo foto…") : editing ? "Guardando…" : "Creando…"}
                        deleteBlockedReason={deleteBlockedReason}
                        onAskDelete={() => setIsConfirmingDelete(true)}
                        onClose={onClose}
                    />
                )}
            </form>
        </div>
    );
};
