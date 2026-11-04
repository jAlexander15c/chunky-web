import type { ChangeEvent } from "react";
import { MENU_IMAGE_SIDE } from "@/helpers";

interface IPhotoFieldProps {
    inputId: string;
    previewUrl: string;
    onPick: (event: ChangeEvent<HTMLInputElement>) => void;
}

export const PhotoField = ({ inputId, previewUrl, onPick }: IPhotoFieldProps) => (
    <div className="adm-form__row adm-form__row--full">
        <span>Foto <em>(opcional)</em></span>
        <label className="adm-photo" htmlFor={inputId}>
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
            id={inputId}
            className="adm-sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/*"
            onChange={onPick}
        />
    </div>
);

/* ============ Eliminar (se confirma en el mismo formulario) ============ */

interface IDeleteConfirmProps {
    name: string;
    detail: string;
    isDeleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const DeleteConfirm = ({ name, detail, isDeleting, onConfirm, onCancel }: IDeleteConfirmProps) => (
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

export const DialogActions = ({
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
