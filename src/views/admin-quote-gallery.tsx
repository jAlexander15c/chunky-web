import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { FullSheet } from "@/components";
import {
    HttpError,
    QUOTE_GALLERY_LIMITS,
    QUOTE_GALLERY_MAX_PHOTOS,
    createQuoteGalleryPhoto,
    cropQuoteGalleryImage,
    deleteQuoteGalleryPhoto,
    fetchAdminQuoteGallery,
    getGalleryPhotoUrl,
    reorderQuoteGallery,
    updateQuoteGalleryPhoto,
    uploadQuoteGalleryImage,
} from "@/helpers";
import type { IGalleryPhoto, IGalleryPhotoInput } from "@/helpers";

import "./admin-home-slides.css";
import "./admin-quote-gallery.css";

interface INotice {
    text: string;
    tone: "ok" | "warn";
}

/** Una foto nueva (sheet.photo = null) o la que se edita. */
interface ISheetState {
    photo: IGalleryPhoto | null;
}

const getErrorMessage = (error: unknown, fallback: string) => (error instanceof HttpError ? error.message : fallback);

/** El cuerpo completo del PUT a partir de la foto; `changes` pisa lo que cambia. */
const getPhotoInput = (photo: IGalleryPhoto, changes: Partial<IGalleryPhotoInput> = {}): IGalleryPhotoInput => ({
    title: photo.title,
    tag: photo.tag ?? undefined,
    active: photo.active,
    ...changes,
});

/* ============ Lista ============ */

interface IPhotoCardProps {
    photo: IGalleryPhoto;
    index: number;
    total: number;
    isBusy: boolean;
    onToggle: () => void;
    onMove: (delta: -1 | 1) => void;
    onEdit: () => void;
}

const PhotoCard = ({ photo, index, total, isBusy, onToggle, onMove, onEdit }: IPhotoCardProps) => {
    const photoUrl = getGalleryPhotoUrl(photo);
    const isShown = photo.active && Boolean(photoUrl);
    const statusLabel = !photo.active ? "Oculta" : photoUrl ? "En el cotizador" : "Sin foto";

    return (
        <li className={`ahs-card${photo.active ? "" : " is-off"}`}>
            <div className="ahs-card__row">
                <div className="ahs-thumb aqg-thumb" aria-hidden>
                    {photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : null}
                </div>
                <div className="ahs-card__text">
                    <b className="ahs-card__title">{photo.title}</b>
                    {photo.tag ? <span className="ahs-card__dest">{photo.tag}</span> : null}
                    <span className="ahs-card__meta">
                        <span className={`ahs-chip ${isShown ? "is-live" : "is-off"}`}>{statusLabel}</span>
                    </span>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={photo.active}
                    aria-label={`${photo.active ? "Ocultar" : "Mostrar"} ${photo.title}`}
                    className="ahs-switch"
                    disabled={isBusy}
                    onClick={onToggle}
                >
                    <span className="ahs-switch__track"><span className="ahs-switch__knob" /></span>
                </button>
            </div>
            <div className="ahs-card__foot">
                <div className="ahs-card__moves">
                    <button type="button" className="ahs-icon-btn" aria-label={`Subir ${photo.title}`} disabled={isBusy || index === 0} onClick={() => onMove(-1)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                    </button>
                    <button type="button" className="ahs-icon-btn" aria-label={`Bajar ${photo.title}`} disabled={isBusy || index === total - 1} onClick={() => onMove(1)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 5v14M5 12l7 7 7-7" />
                        </svg>
                    </button>
                </div>
                <button type="button" className="ahs-link-btn" onClick={onEdit}>Editar</button>
            </div>
        </li>
    );
};

/* ============ Hoja de edición ============ */

interface IPhotoFormProps {
    token: string;
    photo: IGalleryPhoto | null;
    /** Cierra la hoja y después corre lo que se le pase (la hoja vive en el historial del teléfono). */
    close: (after?: () => void) => void;
    onDone: (notice: INotice) => void;
    onSessionExpired: () => void;
}

const PhotoForm = ({ token, photo, close, onDone, onSessionExpired }: IPhotoFormProps) => {
    const [title, setTitle] = useState(photo?.title ?? "");
    const [tag, setTag] = useState(photo?.tag ?? "");
    const [isActive, setIsActive] = useState(photo?.active ?? true);
    const [newPhoto, setNewPhoto] = useState<File | null>(null);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const newPhotoUrl = useMemo(() => (newPhoto ? URL.createObjectURL(newPhoto) : ""), [newPhoto]);
    useEffect(() => () => {
        if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl);
    }, [newPhotoUrl]);

    const previewPhotoUrl = newPhotoUrl || (photo ? getGalleryPhotoUrl(photo) : null);

    const pickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setError("Elige una foto (JPG o PNG).");
            return;
        }
        setError("");
        setNewPhoto(file);
    };

    /** Un 401 cierra la sesión del tablero; cualquier otro error se muestra en la hoja. */
    const handleRequestError = (requestError: unknown, fallback: string) => {
        if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
        setError(getErrorMessage(requestError, fallback));
        setIsSending(false);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (isSending) return;

        if (!title.trim()) return setError("Escribe el título de la foto.");
        if (!previewPhotoUrl) return setError("Sube la foto: sin ella no se puede mostrar.");

        const input: IGalleryPhotoInput = { title: title.trim(), tag: tag.trim() || undefined, active: isActive };

        setIsSending(true);
        setError("");

        let saved: IGalleryPhoto;
        try {
            saved = photo ? await updateQuoteGalleryPhoto(token, photo.id, input) : await createQuoteGalleryPhoto(token, input);
        } catch (requestError) {
            return handleRequestError(requestError, "No se pudo guardar la foto.");
        }

        // La foto ya se guardó: si la imagen falla no se deshace, solo se avisa
        try {
            if (newPhoto) await uploadQuoteGalleryImage(token, saved.id, await cropQuoteGalleryImage(newPhoto));
        } catch (photoError) {
            console.error("[quote-gallery] no se pudo guardar la imagen:", photoError);
            return close(() => onDone({ text: "Se guardó, pero la imagen no subió. Vuelve a intentarlo desde Editar.", tone: "warn" }));
        }

        close(() => onDone({ text: photo ? "Listo: guardamos los cambios de la foto." : "Listo: la foto ya está en la galería.", tone: "ok" }));
    };

    const confirmDelete = async () => {
        if (!photo) return;
        setIsSending(true);
        setError("");

        try {
            await deleteQuoteGalleryPhoto(token, photo.id);
        } catch (requestError) {
            setIsConfirmingDelete(false);
            return handleRequestError(requestError, "No se pudo borrar la foto.");
        }

        close(() => onDone({ text: "Borramos la foto.", tone: "ok" }));
    };

    const countClass = (value: string, max: number) => `ahs-count${value.length >= max ? " is-full" : ""}`;

    return (
        <form className="ahs-form" onSubmit={submit}>
            <div className="ahs-field">
                <span className="ahs-field__label">Foto</span>
                <div className="aqg-drop">
                    <div className="aqg-drop__thumb" aria-hidden>
                        {previewPhotoUrl ? <img src={previewPhotoUrl} alt="" /> : null}
                    </div>
                    <div className="aqg-drop__side">
                        <span className="ahs-hint">JPG o PNG, horizontal se ve mejor. Se recorta 4:3 y se achica sola.</span>
                        <label className="ahs-photo-btn" htmlFor="aqg-photo">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="6" width="18" height="14" rx="2" />
                                <circle cx="12" cy="13" r="3.5" />
                                <path d="M8 6l1.5-2h5L16 6" />
                            </svg>
                            {previewPhotoUrl ? "Cambiar foto" : "Subir o tomar foto"}
                        </label>
                        <input id="aqg-photo" className="adm-sr-only" type="file" accept="image/*" onChange={pickPhoto} />
                    </div>
                </div>
            </div>

            <div className="ahs-field">
                <label htmlFor="aqg-title"><span>Título <em>(lo ve el cliente)</em></span><span className={countClass(title, QUOTE_GALLERY_LIMITS.title)}>{title.length}/{QUOTE_GALLERY_LIMITS.title}</span></label>
                <input id="aqg-title" maxLength={QUOTE_GALLERY_LIMITS.title} value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="ahs-field">
                <label htmlFor="aqg-tag"><span>Etiqueta pequeña <em>(opcional)</em></span><span className={countClass(tag, QUOTE_GALLERY_LIMITS.tag)}>{tag.length}/{QUOTE_GALLERY_LIMITS.tag}</span></label>
                <input id="aqg-tag" maxLength={QUOTE_GALLERY_LIMITS.tag} value={tag} onChange={(event) => setTag(event.target.value)} />
            </div>

            <div className="ahs-active">
                <div>
                    <b>Se muestra en el cotizador</b>
                    <span>Ocúltala sin borrarla.</span>
                </div>
                <button type="button" role="switch" aria-checked={isActive} aria-label="Se muestra en el cotizador" className="ahs-switch" onClick={() => setIsActive((current) => !current)}>
                    <span className="ahs-switch__track"><span className="ahs-switch__knob" /></span>
                </button>
            </div>

            {error ? <p className="ahs-error" role="alert">{error}</p> : null}

            <div className="ahs-actions">
                <button type="submit" className="ahs-primary" disabled={isSending}>{isSending ? "Guardando…" : "Guardar"}</button>
                {photo && !isConfirmingDelete ? (
                    <button type="button" className="ahs-delete" disabled={isSending} onClick={() => setIsConfirmingDelete(true)}>Borrar foto</button>
                ) : null}
            </div>

            {photo && isConfirmingDelete ? (
                <div className="ahs-confirm" role="alert">
                    <b>¿Borrar esta foto?</b>
                    <p>Desaparece del cotizador y no se puede deshacer. Si solo quieres quitarla un rato, ocúltala.</p>
                    <div className="ahs-confirm__actions">
                        <button type="button" className="ahs-secondary" disabled={isSending} onClick={() => setIsConfirmingDelete(false)} autoFocus>No, volver</button>
                        <button type="button" className="ahs-danger" disabled={isSending} onClick={confirmDelete}>{isSending ? "Borrando…" : "Sí, borrar"}</button>
                    </div>
                </div>
            ) : null}
        </form>
    );
};

/* ============ Sección ============ */

export const AdminQuoteGallery = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [photos, setPhotos] = useState<IGalleryPhoto[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState<INotice | null>(null);
    const [sheet, setSheet] = useState<ISheetState | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const response = await fetchAdminQuoteGallery(token, signal);
                setPhotos(response.photos);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(getErrorMessage(requestError, "No pudimos cargar la galería."));
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

    const closeSheet = useCallback(() => setSheet(null), []);

    /** Un 401 cierra la sesión; cualquier otro error se muestra arriba de la lista. */
    const showRequestError = (requestError: unknown, fallback: string) => {
        if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
        setNotice({ text: getErrorMessage(requestError, fallback), tone: "warn" });
    };

    const togglePhoto = async (photo: IGalleryPhoto) => {
        setBusyId(photo.id);
        setNotice(null);
        try {
            const updated = await updateQuoteGalleryPhoto(token, photo.id, getPhotoInput(photo, { active: !photo.active }));
            setPhotos((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
        } catch (requestError) {
            showRequestError(requestError, "No se pudo cambiar la foto.");
        } finally {
            setBusyId(null);
        }
    };

    /** Cambia el orden al instante y avisa al API; si falla vuelve al orden de antes. */
    const movePhoto = async (index: number, delta: -1 | 1) => {
        const target = index + delta;
        if (target < 0 || target >= photos.length) return;

        const previous = photos;
        const next = [...photos];
        [next[index], next[target]] = [next[target], next[index]];
        setPhotos(next);
        setBusyId(next[target].id);
        setNotice(null);

        try {
            const response = await reorderQuoteGallery(token, next.map((photo) => photo.id));
            setPhotos(response.photos);
        } catch (requestError) {
            setPhotos(previous);
            showRequestError(requestError, "No se pudo cambiar el orden.");
        } finally {
            setBusyId(null);
        }
    };

    const finishEditing = (result: INotice) => {
        setNotice(result);
        void load();
    };

    if (isLoading) return <p className="adm-empty">Cargando la galería…</p>;

    const isFull = photos.length >= QUOTE_GALLERY_MAX_PHOTOS;

    return (
        <section className="ahs">
            {error ? <p className="adm-error">{error}</p> : null}

            {notice ? (
                <div className={`adm-menu-notice is-${notice.tone}`} role="status">
                    <p>{notice.text}</p>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setNotice(null)}>Entendido</button>
                </div>
            ) : null}

            <div className="ahs-toolbar">
                <p className="aqg-lede">Fotos de referencia arriba del cotizador. Pasan solas cada 5 segundos. Hasta {QUOTE_GALLERY_MAX_PHOTOS}.</p>
                <button type="button" className="ahs-primary ahs-primary--sm" disabled={isFull} onClick={() => setSheet({ photo: null })}>+ Agregar foto</button>
            </div>

            {photos.length === 0 && !error ? (
                <p className="aqg-empty">Todavía no hay fotos. Mientras no haya ninguna, el cotizador se ve como siempre.</p>
            ) : (
                <ol className="ahs-list aqg-list">
                    {photos.map((photo, index) => (
                        <PhotoCard
                            key={photo.id}
                            photo={photo}
                            index={index}
                            total={photos.length}
                            isBusy={busyId !== null}
                            onToggle={() => void togglePhoto(photo)}
                            onMove={(delta) => void movePhoto(index, delta)}
                            onEdit={() => setSheet({ photo })}
                        />
                    ))}
                </ol>
            )}

            {sheet ? (
                <FullSheet title={sheet.photo ? "Editar foto" : "Agregar foto"} onClose={closeSheet}>
                    {(close) => (
                        <PhotoForm
                            token={token}
                            photo={sheet.photo}
                            close={close}
                            onDone={finishEditing}
                            onSessionExpired={onSessionExpired}
                        />
                    )}
                </FullSheet>
            ) : null}
        </section>
    );
};
