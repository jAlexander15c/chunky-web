import { useState } from "react";

import { HttpError } from "@/helpers";
import type { ITicketLine } from "@/helpers";
import { LINE_NOTE_MAX } from "./helpers";

interface ILineNoteDialogProps {
    line: ITicketLine;
    onSave: (note: string | null) => Promise<void>;
    onClose: () => void;
}

/** Lo que la cocina debe saber de ese plato. Sale bajo el plato en la comanda. */
export const LineNoteDialog = ({ line, onSave, onClose }: ILineNoteDialogProps) => {
    const [note, setNote] = useState(line.note ?? "");
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const save = async (value: string | null) => {
        setIsSending(true);
        setError("");
        try {
            await onSave(value);
        } catch (requestError) {
            setError(requestError instanceof HttpError ? requestError.message : "No se pudo guardar la nota.");
            setIsSending(false);
        }
    };

    return (
        <div className="ges-modal" role="dialog" aria-modal="true" aria-label={`Nota para ${line.name}`}>
            <form
                className="ges-modal__panel"
                onSubmit={(event) => {
                    event.preventDefault();
                    void save(note.trim() || null);
                }}
            >
                <h3 className="script">Nota para {line.name}</h3>
                <label className="ges-field">
                    <span>Qué debe saber la cocina</span>
                    <input
                        id="caja-nota-plato"
                        type="text"
                        autoFocus
                        maxLength={LINE_NOTE_MAX}
                        autoComplete="off"
                        value={note}
                        placeholder="Ej. sin cebolla, bien tostado"
                        onChange={(event) => { setNote(event.target.value); setError(""); }}
                    />
                    <small className="ges-field__hint">
                        {note.length}/{LINE_NOTE_MAX} · Sale bajo el plato en la comanda.
                    </small>
                </label>
                {error ? <p className="ges-error" role="alert">{error}</p> : null}
                <div className="ges-modal__acts">
                    {line.note ? (
                        <button type="button" className="ges-btn" disabled={isSending} onClick={() => void save(null)}>
                            Quitar nota
                        </button>
                    ) : (
                        <button type="button" className="ges-btn" disabled={isSending} onClick={onClose}>Cancelar</button>
                    )}
                    <button type="submit" className="ges-btn ges-btn--solid" disabled={isSending || !note.trim()}>
                        {isSending ? "Guardando…" : "Guardar nota"}
                    </button>
                </div>
            </form>
        </div>
    );
};
