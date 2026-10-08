import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { FullSheet, Mascot, PromoSlide } from "@/components";
import {
    HOME_SLIDE_DESTINATION_LABEL,
    HOME_SLIDE_LIMITS,
    HOME_SLIDE_THEMES,
    HOME_SLIDES_MAX_ACTIVE,
    HttpError,
    addDays,
    createExampleHomeSlides,
    createHomeSlide,
    cropHomeSlideImage,
    deleteHomeSlide,
    deleteHomeSlideImage,
    fetchAdminHomeSlides,
    fetchWebReport,
    formatShortDate,
    getHomeSlideImageUrl,
    getPanamaToday,
    getSlideStatus,
    reorderHomeSlides,
    updateHomeSlide,
    uploadHomeSlideImage,
    useCategories,
} from "@/helpers";
import type { HomeSlideDestination, HomeSlideStatus, HomeSlideTheme, IHomeSlide, IHomeSlideInput } from "@/helpers";

import "./admin-home-slides.css";

interface INotice {
    text: string;
    tone: "ok" | "warn";
}

/** Una lámina nueva (sheet.slide = null) o la que se edita. */
interface ISheetState {
    slide: IHomeSlide | null;
}

const DESTINATIONS = Object.keys(HOME_SLIDE_DESTINATION_LABEL) as HomeSlideDestination[];

const getErrorMessage = (error: unknown, fallback: string) => (error instanceof HttpError ? error.message : fallback);

/** El cuerpo completo del PUT a partir de la lámina; `changes` pisa lo que cambia. */
const getSlideInput = (slide: IHomeSlide, changes: Partial<IHomeSlideInput> = {}): IHomeSlideInput => ({
    title: slide.title,
    script: slide.script,
    tag: slide.tag ?? undefined,
    text: slide.text,
    buttonLabel: slide.buttonLabel,
    destination: slide.destination,
    categoryId: slide.destination === "category" ? slide.categoryId ?? undefined : undefined,
    theme: slide.theme,
    active: slide.active,
    startsOn: slide.startsOn ?? undefined,
    endsOn: slide.endsOn ?? undefined,
    ...changes,
});

const STATUS_LABEL: Record<Exclude<HomeSlideStatus, "scheduled">, string> = {
    live: "Se ve ahora",
    expired: "Vencida",
    off: "Apagada",
};

const getStatusLabel = (slide: IHomeSlide, status: HomeSlideStatus) =>
    status === "scheduled" && slide.startsOn ? `Programada · desde ${formatShortDate(slide.startsOn)}` : STATUS_LABEL[status as keyof typeof STATUS_LABEL];

const getClicksLabel = (clicks: number) => (clicks === 1 ? "1 clic esta semana" : `${clicks} clics esta semana`);

/* ============ Lista ============ */

interface ISlideCardProps {
    slide: IHomeSlide;
    index: number;
    total: number;
    today: string;
    categoryName: string | undefined;
    clicks: number | null;
    isBusy: boolean;
    onToggle: () => void;
    onMove: (delta: -1 | 1) => void;
    onEdit: () => void;
}

const SlideCard = ({ slide, index, total, today, categoryName, clicks, isBusy, onToggle, onMove, onEdit }: ISlideCardProps) => {
    const status = getSlideStatus(slide, today);
    const photoUrl = getHomeSlideImageUrl(slide);
    const destination = slide.destination === "category"
        ? `Categoría ${categoryName ?? "que ya no existe"}`
        : HOME_SLIDE_DESTINATION_LABEL[slide.destination];
    const name = `${slide.title} ${slide.script}`.trim();

    return (
        <li className={`ahs-card${slide.active ? "" : " is-off"}`}>
            <div className="ahs-card__row">
                <div className={`ahs-thumb ahs-thumb--${slide.theme}`} aria-hidden>
                    {photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : null}
                </div>
                <div className="ahs-card__text">
                    <b className="ahs-card__title">{name}</b>
                    <span className="ahs-card__dest">Lleva a: {destination}</span>
                    <span className="ahs-card__meta">
                        <span className={`ahs-chip is-${status}`}>{getStatusLabel(slide, status)}</span>
                        {clicks !== null ? <span className="ahs-card__clicks">{getClicksLabel(clicks)}</span> : null}
                    </span>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={slide.active}
                    aria-label={`${slide.active ? "Apagar" : "Prender"} ${name}`}
                    className="ahs-switch"
                    disabled={isBusy}
                    onClick={onToggle}
                >
                    <span className="ahs-switch__track"><span className="ahs-switch__knob" /></span>
                </button>
            </div>
            <div className="ahs-card__foot">
                <div className="ahs-card__moves">
                    <button type="button" className="ahs-icon-btn" aria-label={`Subir ${name}`} disabled={isBusy || index === 0} onClick={() => onMove(-1)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                    </button>
                    <button type="button" className="ahs-icon-btn" aria-label={`Bajar ${name}`} disabled={isBusy || index === total - 1} onClick={() => onMove(1)}>
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

interface ISlideFormProps {
    token: string;
    slide: IHomeSlide | null;
    /** Cierra la hoja y después corre lo que se le pase (la hoja vive en el historial del teléfono). */
    close: (after?: () => void) => void;
    onDone: (notice: INotice) => void;
    onSessionExpired: () => void;
}

const SlideForm = ({ token, slide, close, onDone, onSessionExpired }: ISlideFormProps) => {
    const { categories } = useCategories();
    const [title, setTitle] = useState(slide?.title ?? "");
    const [script, setScript] = useState(slide?.script ?? "");
    const [tag, setTag] = useState(slide?.tag ?? "");
    const [text, setText] = useState(slide?.text ?? "");
    const [buttonLabel, setButtonLabel] = useState(slide?.buttonLabel ?? "");
    const [destination, setDestination] = useState<HomeSlideDestination>(slide?.destination ?? "menu");
    const [categoryId, setCategoryId] = useState(slide?.categoryId ?? "");
    const [theme, setTheme] = useState<HomeSlideTheme>(slide?.theme ?? "cake");
    const [isActive, setIsActive] = useState(slide?.active ?? true);
    const [startsOn, setStartsOn] = useState(slide?.startsOn ?? "");
    const [endsOn, setEndsOn] = useState(slide?.endsOn ?? "");
    const [photo, setPhoto] = useState<File | null>(null);
    const [isPhotoRemoved, setIsPhotoRemoved] = useState(false);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const newPhotoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
    useEffect(() => () => {
        if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl);
    }, [newPhotoUrl]);

    const currentPhotoUrl = slide && !isPhotoRemoved ? getHomeSlideImageUrl(slide) : null;
    const previewPhotoUrl = newPhotoUrl || currentPhotoUrl;

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
        setIsPhotoRemoved(false);
    };

    const removePhoto = () => {
        setPhoto(null);
        setIsPhotoRemoved(true);
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

        if (!title.trim() || !script.trim()) return setError("Escribe el título y el remate de la lámina.");
        if (!text.trim()) return setError("Escribe el texto de la lámina.");
        if (!buttonLabel.trim()) return setError("Escribe lo que dice el botón.");
        if (destination === "category" && !categoryId) return setError("Elige a qué categoría lleva el botón.");
        if (startsOn && endsOn && endsOn < startsOn) return setError("La fecha final no puede ser antes de la inicial.");

        const input: IHomeSlideInput = {
            title: title.trim(),
            script: script.trim(),
            tag: tag.trim() || undefined,
            text: text.trim(),
            buttonLabel: buttonLabel.trim(),
            destination,
            categoryId: destination === "category" ? categoryId : undefined,
            theme,
            active: isActive,
            startsOn: startsOn || undefined,
            endsOn: endsOn || undefined,
        };

        setIsSending(true);
        setError("");

        let saved: IHomeSlide;
        try {
            saved = slide ? await updateHomeSlide(token, slide.id, input) : await createHomeSlide(token, input);
        } catch (requestError) {
            return handleRequestError(requestError, "No se pudo guardar la lámina.");
        }

        // La lámina ya se guardó: si la foto falla no se deshace, solo se avisa
        try {
            if (photo) await uploadHomeSlideImage(token, saved.id, await cropHomeSlideImage(photo));
            else if (isPhotoRemoved && slide?.imageVersion) await deleteHomeSlideImage(token, saved.id);
        } catch (photoError) {
            console.error("[home-slides] no se pudo guardar la foto:", photoError);
            return close(() => onDone({ text: "La lámina se guardó, pero la foto no subió. Vuelve a intentarlo desde Editar.", tone: "warn" }));
        }

        close(() => onDone({ text: slide ? "Listo: guardamos los cambios de la lámina." : "Listo: la lámina ya está creada.", tone: "ok" }));
    };

    const confirmDelete = async () => {
        if (!slide) return;
        setIsSending(true);
        setError("");

        try {
            await deleteHomeSlide(token, slide.id);
        } catch (requestError) {
            setIsConfirmingDelete(false);
            return handleRequestError(requestError, "No se pudo borrar la lámina.");
        }

        close(() => onDone({ text: "Borramos la lámina.", tone: "ok" }));
    };

    const countClass = (value: string, max: number) => `ahs-count${value.length >= max ? " is-full" : ""}`;

    return (
        <form className="ahs-form" onSubmit={submit}>
            <div>
                <div className="ahs-form__eyebrow">Así se verá</div>
                <PromoSlide
                    compact
                    photoUrl={previewPhotoUrl}
                    slide={{ title, script, tag: tag.trim() || null, text, buttonLabel, theme }}
                />
            </div>

            <div className="ahs-field">
                <label htmlFor="ahs-title"><span>Título</span><span className={countClass(title, HOME_SLIDE_LIMITS.title)}>{title.length}/{HOME_SLIDE_LIMITS.title}</span></label>
                <input id="ahs-title" maxLength={HOME_SLIDE_LIMITS.title} value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="ahs-field">
                <label htmlFor="ahs-script"><span>Remate en letra de mano</span><span className={countClass(script, HOME_SLIDE_LIMITS.script)}>{script.length}/{HOME_SLIDE_LIMITS.script}</span></label>
                <input id="ahs-script" maxLength={HOME_SLIDE_LIMITS.script} value={script} onChange={(event) => setScript(event.target.value)} />
            </div>
            <div className="ahs-field">
                <label htmlFor="ahs-tag"><span>Etiqueta <em>(opcional)</em></span><span className={countClass(tag, HOME_SLIDE_LIMITS.tag)}>{tag.length}/{HOME_SLIDE_LIMITS.tag}</span></label>
                <input id="ahs-tag" maxLength={HOME_SLIDE_LIMITS.tag} value={tag} onChange={(event) => setTag(event.target.value)} />
            </div>
            <div className="ahs-field">
                <label htmlFor="ahs-text"><span>Texto</span><span className={countClass(text, HOME_SLIDE_LIMITS.text)}>{text.length}/{HOME_SLIDE_LIMITS.text}</span></label>
                <textarea id="ahs-text" rows={3} maxLength={HOME_SLIDE_LIMITS.text} value={text} onChange={(event) => setText(event.target.value)} />
            </div>
            <div className="ahs-field">
                <label htmlFor="ahs-button"><span>Texto del botón</span><span className={countClass(buttonLabel, HOME_SLIDE_LIMITS.buttonLabel)}>{buttonLabel.length}/{HOME_SLIDE_LIMITS.buttonLabel}</span></label>
                <input id="ahs-button" maxLength={HOME_SLIDE_LIMITS.buttonLabel} value={buttonLabel} onChange={(event) => setButtonLabel(event.target.value)} />
            </div>

            <div className="ahs-field">
                <label htmlFor="ahs-destination"><span>El botón lleva a</span></label>
                <select id="ahs-destination" value={destination} onChange={(event) => setDestination(event.target.value as HomeSlideDestination)}>
                    {DESTINATIONS.map((entry) => (
                        <option key={entry} value={entry}>{HOME_SLIDE_DESTINATION_LABEL[entry]}</option>
                    ))}
                </select>
            </div>
            {destination === "category" ? (
                <div className="ahs-field">
                    <label htmlFor="ahs-category"><span>Categoría</span></label>
                    <select id="ahs-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                        <option value="">Elegir…</option>
                        {categories.map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                    </select>
                </div>
            ) : null}

            <fieldset className="ahs-fieldset">
                <legend>Estilo</legend>
                <div className="ahs-themes">
                    {HOME_SLIDE_THEMES.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            className={`ahs-theme ahs-theme--${entry.id}`}
                            aria-pressed={theme === entry.id}
                            onClick={() => setTheme(entry.id)}
                        >
                            <span className="ahs-theme__dot" aria-hidden />
                            <span>{entry.label}</span>
                        </button>
                    ))}
                </div>
            </fieldset>

            <div className="ahs-field">
                <span className="ahs-field__label">Foto <em>(opcional)</em></span>
                <label className="ahs-photo-btn" htmlFor="ahs-photo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="6" width="18" height="14" rx="2" />
                        <circle cx="12" cy="13" r="3.5" />
                        <path d="M8 6l1.5-2h5L16 6" />
                    </svg>
                    {previewPhotoUrl ? "Cambiar foto" : "Subir o tomar foto"}
                </label>
                <input id="ahs-photo" className="adm-sr-only" type="file" accept="image/*" onChange={pickPhoto} />
                {previewPhotoUrl ? (
                    <button type="button" className="ahs-link-btn ahs-link-btn--danger" onClick={removePhoto}>Quitar foto</button>
                ) : null}
                <span className="ahs-hint">Se recorta 4:3 y se achica sola. Sin foto, la estampilla lleva a la mascota.</span>
            </div>

            <fieldset className="ahs-fieldset">
                <legend>Cuándo se ve <em>(opcional)</em></legend>
                <div className="ahs-dates">
                    <div className="ahs-field">
                        <label htmlFor="ahs-from"><span>Desde</span></label>
                        <input id="ahs-from" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
                    </div>
                    <div className="ahs-field">
                        <label htmlFor="ahs-to"><span>Hasta</span></label>
                        <input id="ahs-to" type="date" min={startsOn || undefined} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
                    </div>
                </div>
                <p className="ahs-hint">Vacío = se ve mientras esté prendida. Al pasar la fecha se apaga sola.</p>
            </fieldset>

            <div className="ahs-active">
                <div>
                    <b>Prendida</b>
                    <span>Apágala sin borrarla.</span>
                </div>
                <button type="button" role="switch" aria-checked={isActive} aria-label="Prendida" className="ahs-switch" onClick={() => setIsActive((current) => !current)}>
                    <span className="ahs-switch__track"><span className="ahs-switch__knob" /></span>
                </button>
            </div>

            {error ? <p className="ahs-error" role="alert">{error}</p> : null}

            <div className="ahs-actions">
                <button type="submit" className="ahs-primary" disabled={isSending}>{isSending ? "Guardando…" : "Guardar"}</button>
                {slide && !isConfirmingDelete ? (
                    <button type="button" className="ahs-delete" disabled={isSending} onClick={() => setIsConfirmingDelete(true)}>Borrar lámina</button>
                ) : null}
            </div>

            {slide && isConfirmingDelete ? (
                <div className="ahs-confirm" role="alert">
                    <b>¿Borrar esta lámina?</b>
                    <p>Desaparece del inicio y no se puede deshacer. Si solo quieres quitarla un rato, apágala.</p>
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

export const AdminHomeSlides = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const { categories } = useCategories();
    const [slides, setSlides] = useState<IHomeSlide[]>([]);
    const [clicks, setClicks] = useState<Map<string, number> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState<INotice | null>(null);
    const [sheet, setSheet] = useState<ISheetState | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [isCreatingExamples, setIsCreatingExamples] = useState(false);
    const today = getPanamaToday();

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const response = await fetchAdminHomeSlides(token, signal);
                setSlides(response.slides);
                setError("");
            } catch (requestError) {
                if (signal?.aborted) return;
                if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
                setError(getErrorMessage(requestError, "No pudimos cargar las láminas."));
            } finally {
                if (!signal?.aborted) setIsLoading(false);
            }

            // Los clics de la semana son un extra: si no cargan, simplemente no se muestran
            try {
                const todayPanama = getPanamaToday();
                const report = await fetchWebReport(token, addDays(todayPanama, -6), todayPanama, signal);
                if (!signal?.aborted) setClicks(report.promoClicks ? new Map(report.promoClicks.map((promo) => [promo.id, promo.clicks])) : null);
            } catch {
                if (!signal?.aborted) setClicks(null);
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

    const activeCount = slides.filter((slide) => slide.active).length;

    /** Un 401 cierra la sesión; cualquier otro error se muestra arriba de la lista. */
    const showRequestError = (requestError: unknown, fallback: string) => {
        if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
        setNotice({ text: getErrorMessage(requestError, fallback), tone: "warn" });
    };

    const toggleSlide = async (slide: IHomeSlide) => {
        setBusyId(slide.id);
        setNotice(null);
        try {
            const updated = await updateHomeSlide(token, slide.id, getSlideInput(slide, { active: !slide.active }));
            setSlides((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
        } catch (requestError) {
            showRequestError(requestError, "No se pudo cambiar la lámina.");
        } finally {
            setBusyId(null);
        }
    };

    /** Cambia el orden al instante y avisa al API; si falla vuelve al orden de antes. */
    const moveSlide = async (index: number, delta: -1 | 1) => {
        const target = index + delta;
        if (target < 0 || target >= slides.length) return;

        const previous = slides;
        const next = [...slides];
        [next[index], next[target]] = [next[target], next[index]];
        setSlides(next);
        setBusyId(next[target].id);
        setNotice(null);

        try {
            const response = await reorderHomeSlides(token, next.map((slide) => slide.id));
            setSlides(response.slides);
        } catch (requestError) {
            setSlides(previous);
            showRequestError(requestError, "No se pudo cambiar el orden.");
        } finally {
            setBusyId(null);
        }
    };

    const createExamples = async () => {
        setIsCreatingExamples(true);
        setNotice(null);
        try {
            const response = await createExampleHomeSlides(token);
            setSlides(response.slides);
            setNotice({ text: "Listo: creamos dos láminas de ejemplo. Edítalas a tu gusto.", tone: "ok" });
        } catch (requestError) {
            showRequestError(requestError, "No se pudieron crear las láminas de ejemplo.");
        } finally {
            setIsCreatingExamples(false);
        }
    };

    const finishEditing = (result: INotice) => {
        setNotice(result);
        void load();
    };

    const getCategoryName = (categoryId: string | null) => categories.find((category) => category.id === categoryId)?.name;

    if (isLoading) return <p className="adm-empty">Cargando las láminas…</p>;

    return (
        <section className="ahs">
            {error ? <p className="adm-error">{error}</p> : null}

            {notice ? (
                <div className={`adm-menu-notice is-${notice.tone}`} role="status">
                    <p>{notice.text}</p>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setNotice(null)}>Entendido</button>
                </div>
            ) : null}

            <div className="ahs-cover">
                <div className="ahs-cover__icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                </div>
                <div>
                    <b>Portada · siempre primera</b>
                    <span>
                        {slides.length === 0
                            ? "Mientras no haya promos, el inicio se ve como hoy."
                            : "\"De New York a Kioto…\". Cambia sola los días de pasta."}
                    </span>
                </div>
            </div>

            {slides.length === 0 && !error ? (
                <div className="ahs-empty">
                    <Mascot className="ahs-empty__mascot" />
                    <h2>Todavía no hay promos</h2>
                    <p>Te dejamos dos listas para editar: una para el cotizador de cakes y otra para el menú.</p>
                    <button type="button" className="ahs-primary" disabled={isCreatingExamples} onClick={createExamples}>
                        {isCreatingExamples ? "Creando…" : "Crear las de ejemplo"}
                    </button>
                    <button type="button" className="ahs-link-btn" onClick={() => setSheet({ slide: null })}>Empezar una en blanco</button>
                </div>
            ) : (
                <>
                    <div className="ahs-toolbar">
                        <span className="ahs-toolbar__count">{activeCount} de {HOME_SLIDES_MAX_ACTIVE} activas</span>
                        <button type="button" className="ahs-primary ahs-primary--sm" onClick={() => setSheet({ slide: null })}>+ Nueva lámina</button>
                    </div>

                    <ol className="ahs-list">
                        {slides.map((slide, index) => (
                            <SlideCard
                                key={slide.id}
                                slide={slide}
                                index={index}
                                total={slides.length}
                                today={today}
                                categoryName={getCategoryName(slide.categoryId)}
                                clicks={clicks ? clicks.get(slide.id) ?? 0 : null}
                                isBusy={busyId !== null}
                                onToggle={() => void toggleSlide(slide)}
                                onMove={(delta) => void moveSlide(index, delta)}
                                onEdit={() => setSheet({ slide })}
                            />
                        ))}
                    </ol>
                </>
            )}

            {sheet ? (
                <FullSheet title={sheet.slide ? "Editar lámina" : "Nueva lámina"} onClose={closeSheet}>
                    {(close) => (
                        <SlideForm
                            token={token}
                            slide={sheet.slide}
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
