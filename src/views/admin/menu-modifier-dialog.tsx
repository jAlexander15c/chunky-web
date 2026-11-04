import { useState } from "react";
import type { FormEvent } from "react";
import type { IMenuModifierOptionInput, IModifier } from "@/helpers";
import { getErrorMessage, getProductCountLabel, parsePrice } from "./menu-helpers";
import { DeleteConfirm, DialogActions } from "./menu-shared";

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

export const ModifierDialog = ({ editing, itemCount, onSave, onDelete, onClose }: IModifierDialogProps) => {
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
