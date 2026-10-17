import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { FullSheet, SheetChevron } from "@/components/full-sheet";
import {
    COMBO_DAY_LABELS,
    COMBO_LIMITS,
    HttpError,
    createCombo,
    cropMenuImage,
    deleteCombo,
    deleteComboImage,
    fetchAdminCombos,
    fetchMenu,
    formatComboDate,
    formatComboSchedule,
    formatPrice,
    getComboError,
    getComboImageUrl,
    getComboInput,
    getComboNextStart,
    getComboSlotsText,
    getSeparatePrice,
    updateCombo,
    uploadComboImage,
} from "@/helpers";
import type { ComboChannel, IComboAdmin, IComboInput, IComboSlot, IMenuCategory, IMenuItem } from "@/helpers";

import "./admin-combos.css";

interface INotice {
    text: string;
    tone: "ok" | "warn";
}

const CHANNEL_LABEL: Record<ComboChannel, string> = { both: "Web y Caja", web: "Solo web", caja: "Solo caja" };
const CHANNELS: ComboChannel[] = ["web", "caja", "both"];

const getErrorMessage = (error: unknown, fallback: string) => (error instanceof HttpError ? error.message : fallback);

/* ============ Hoja de edición ============ */

interface IComboFormProps {
    token: string;
    combo: IComboAdmin | null;
    categories: IMenuCategory[];
    items: IMenuItem[];
    /** Cierra la hoja y después corre lo que se le pase (la hoja vive en el historial del teléfono). */
    close: (after?: () => void) => void;
    onDone: (notice: INotice) => void;
    onSessionExpired: () => void;
}

const ComboForm = ({ token, combo, categories, items, close, onDone, onSessionExpired }: IComboFormProps) => {
    const [name, setName] = useState(combo?.name ?? "");
    const [description, setDescription] = useState(combo?.description ?? "");
    const [priceText, setPriceText] = useState(combo ? String(combo.price) : "");
    const [slots, setSlots] = useState<IComboSlot[]>(combo?.slots.map((slot) => ({ label: slot.label, itemIds: [...slot.itemIds] })) ?? [{ label: "", itemIds: [] }]);
    const [days, setDays] = useState<number[]>(combo?.days ?? [1, 2, 3, 4, 5]);
    const [timeFrom, setTimeFrom] = useState(combo?.timeFrom ?? "15:00");
    const [timeTo, setTimeTo] = useState(combo?.timeTo ?? "18:00");
    const [startsOn, setStartsOn] = useState(combo?.startsOn ?? "");
    const [endsOn, setEndsOn] = useState(combo?.endsOn ?? "");
    const [channel, setChannel] = useState<ComboChannel>(combo?.channel ?? "both");
    const [isEnabled, setIsEnabled] = useState(combo?.isEnabled ?? true);
    const [photo, setPhoto] = useState<File | null>(null);
    const [isPhotoRemoved, setIsPhotoRemoved] = useState(false);
    const [editingSlot, setEditingSlot] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const newPhotoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
    useEffect(() => () => {
        if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl);
    }, [newPhotoUrl]);
    const currentPhotoUrl = combo?.imageVersion && !isPhotoRemoved ? getComboImageUrl(combo) : null;
    const previewPhotoUrl = newPhotoUrl || currentPhotoUrl;

    const price = Number(priceText.replace(",", "."));
    const separatePrice = getSeparatePrice(slots, items.map((item) => ({ id: item.id, price: item.price })));
    const hasEverySlot = slots.every((slot) => slot.itemIds.length > 0);
    const saving = Math.round((separatePrice - price) * 100) / 100;

    const updateSlot = (index: number, changes: Partial<IComboSlot>) =>
        setSlots((current) => current.map((slot, position) => (position === index ? { ...slot, ...changes } : slot)));

    const toggleDay = (day: number) =>
        setDays((current) => (current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b)));

    const toggleSlotItem = (index: number, itemId: string) => {
        const current = slots[index].itemIds;
        updateSlot(index, { itemIds: current.includes(itemId) ? current.filter((value) => value !== itemId) : [...current, itemId] });
    };

    const removeSlot = (index: number) => {
        setSlots((current) => current.filter((_, position) => position !== index));
        setEditingSlot(null);
    };

    const addSlot = () => {
        setSlots((current) => [...current, { label: "", itemIds: [] }]);
        setEditingSlot(slots.length);
    };

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

    /** Un 401 cierra la sesión del tablero; cualquier otro error se muestra en la hoja. */
    const handleRequestError = (requestError: unknown, fallback: string) => {
        if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
        setError(getErrorMessage(requestError, fallback));
        setIsSending(false);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (isSending) return;

        const input: IComboInput = {
            name: name.trim(),
            description: description.trim() || null,
            price,
            slots: slots.map((slot) => ({ label: slot.label.trim(), itemIds: slot.itemIds })),
            channel,
            days,
            timeFrom,
            timeTo,
            startsOn: startsOn || null,
            endsOn: endsOn || null,
            isEnabled,
        };
        const problem = getComboError(input);
        if (problem) return setError(problem);

        setIsSending(true);
        setError("");

        let saved: { id: number };
        try {
            saved = combo ? await updateCombo(token, combo.id, input) : await createCombo(token, input);
        } catch (requestError) {
            return handleRequestError(requestError, "No se pudo guardar el combo.");
        }

        // El combo ya se guardó: si la foto falla no se deshace, solo se avisa
        try {
            if (photo) await uploadComboImage(token, saved.id, await cropMenuImage(photo));
            else if (isPhotoRemoved && combo?.imageVersion) await deleteComboImage(token, saved.id);
        } catch (photoError) {
            console.error("[combos] no se pudo guardar la foto:", photoError);
            return close(() => onDone({ text: "El combo se guardó, pero la foto no subió. Vuelve a intentarlo desde Editar.", tone: "warn" }));
        }

        close(() => onDone({ text: combo ? "Listo: guardamos los cambios del combo." : "Listo: el combo ya está creado.", tone: "ok" }));
    };

    const confirmDelete = async () => {
        if (!combo) return;
        setIsSending(true);
        setError("");
        try {
            await deleteCombo(token, combo.id);
        } catch (requestError) {
            setIsConfirmingDelete(false);
            return handleRequestError(requestError, "No se pudo borrar el combo.");
        }
        close(() => onDone({ text: "Borramos el combo.", tone: "ok" }));
    };

    // Subvista: nombre del hueco y sus productos, por categoría
    if (editingSlot !== null && slots[editingSlot]) {
        const slot = slots[editingSlot];
        const groups = [
            ...categories.map((category) => ({ id: category.id, name: category.name, items: items.filter((item) => item.categoryId === category.id) })),
            { id: "none", name: "Sin categoría", items: items.filter((item) => !item.categoryId || !categories.some((category) => category.id === item.categoryId)) },
        ].filter((group) => group.items.length > 0);

        return (
            <div className="adm-combo-form">
                <button type="button" className="adm-btn adm-btn--sm adm-combo-form__back" onClick={() => setEditingSlot(null)}>‹ Volver al combo</button>
                <label className="adm-combo-form__field">
                    Nombre del hueco
                    <input value={slot.label} maxLength={COMBO_LIMITS.labelMax} placeholder="Galleta, Bebida…" onChange={(event) => updateSlot(editingSlot, { label: event.target.value })} />
                    <small>El cliente lo ve como "1 {slot.label.trim().toLowerCase() || "galleta"} a elegir".</small>
                </label>
                <p className="adm-note">Marca los productos que se pueden elegir en este hueco. Con uno solo, el hueco va fijo.</p>
                {groups.map((group) => (
                    <fieldset key={group.id} className="adm-combo-form__group">
                        <legend>{group.name}</legend>
                        {group.items.map((item) => (
                            <label key={item.id} className="adm-combo-form__check">
                                <input type="checkbox" checked={slot.itemIds.includes(item.id)} onChange={() => toggleSlotItem(editingSlot, item.id)} />
                                <span>{item.name}</span>
                                {item.price !== null && <small>{formatPrice(item.price)}</small>}
                            </label>
                        ))}
                    </fieldset>
                ))}
                <div className="adm-combo-form__actions">
                    <button type="button" className="adm-btn adm-btn--solid adm-btn--block" onClick={() => setEditingSlot(null)}>Listo</button>
                    {slots.length > 1 && <button type="button" className="adm-btn adm-btn--block" onClick={() => removeSlot(editingSlot)}>Quitar este hueco</button>}
                </div>
            </div>
        );
    }

    return (
        <form className="adm-combo-form" onSubmit={submit}>
            <label className="adm-combo-form__field">
                Nombre
                <input value={name} maxLength={COMBO_LIMITS.nameMax} disabled={isSending} placeholder="Merienda Chunky" onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="adm-combo-form__field">
                Descripción (opcional)
                <input value={description} maxLength={140} disabled={isSending} placeholder="La pausa de la tarde" onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="adm-combo-form__field">
                Precio del combo
                <input value={priceText} inputMode="decimal" disabled={isSending} placeholder="5.50" onChange={(event) => setPriceText(event.target.value)} />
            </label>
            {hasEverySlot && separatePrice > 0 && price > 0 && (
                <p className="adm-combo-form__hint" role="status">
                    {saving > 0
                        ? `Por separado cuesta desde ${formatPrice(separatePrice)}: el cliente ahorra ${formatPrice(saving)}.`
                        : "El combo cuesta igual o más que por separado."}
                </p>
            )}

            <div className="adm-combo-form__field">
                Lo que lleva
                <div className="adm-combo-form__slots">
                    {slots.map((slot, index) => (
                        <button key={index} type="button" className="fsheet-select" disabled={isSending} onClick={() => setEditingSlot(index)}>
                            <span className="fsheet-select__text">
                                <small>{slot.label.trim() || "Hueco sin nombre"}</small>
                                <span>{slot.itemIds.length === 0 ? "Elige los productos" : slot.itemIds.length === 1 ? "1 producto fijo" : `Elige 1 de ${slot.itemIds.length} productos`}</span>
                            </span>
                            <SheetChevron />
                        </button>
                    ))}
                    {slots.length < COMBO_LIMITS.slotsMax && (
                        <button type="button" className="adm-btn adm-btn--block" disabled={isSending} onClick={addSlot}>+ Agregar hueco</button>
                    )}
                </div>
            </div>

            <div className="adm-combo-form__field" role="group" aria-label="Días">
                Días
                <div className="adm-combo-form__chips">
                    {COMBO_DAY_LABELS.map(({ day, label }) => (
                        <button key={day} type="button" className={`adm-combo-form__chip${days.includes(day) ? " is-on" : ""}`} aria-pressed={days.includes(day)} disabled={isSending} onClick={() => toggleDay(day)}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="adm-combo-form__row">
                <label className="adm-combo-form__field">
                    Desde
                    <input type="time" value={timeFrom} disabled={isSending} onChange={(event) => setTimeFrom(event.target.value)} />
                </label>
                <label className="adm-combo-form__field">
                    Hasta
                    <input type="time" value={timeTo} disabled={isSending} onChange={(event) => setTimeTo(event.target.value)} />
                </label>
            </div>
            <div className="adm-combo-form__row">
                <label className="adm-combo-form__field">
                    Empieza (opcional)
                    <input type="date" value={startsOn} disabled={isSending} onChange={(event) => setStartsOn(event.target.value)} />
                </label>
                <label className="adm-combo-form__field">
                    Termina (opcional)
                    <input type="date" min={startsOn || undefined} value={endsOn} disabled={isSending} onChange={(event) => setEndsOn(event.target.value)} />
                </label>
            </div>

            <div className="adm-combo-form__field" role="group" aria-label="Dónde se vende">
                Dónde se vende
                <div className="adm-combo-form__chips">
                    {CHANNELS.map((value) => (
                        <button key={value} type="button" className={`adm-combo-form__chip${channel === value ? " is-on" : ""}`} aria-pressed={channel === value} disabled={isSending} onClick={() => setChannel(value)}>
                            {CHANNEL_LABEL[value]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="adm-combo-form__field">
                Foto (opcional)
                {previewPhotoUrl && <img className="adm-combo-form__photo" src={previewPhotoUrl} alt="Foto del combo" />}
                <div className="adm-combo-form__chips">
                    <label className="adm-btn adm-btn--sm adm-combo-form__upload">
                        {previewPhotoUrl ? "Cambiar foto" : "Subir foto"}
                        <input type="file" accept="image/*" hidden disabled={isSending} onChange={pickPhoto} />
                    </label>
                    {previewPhotoUrl && <button type="button" className="adm-btn adm-btn--sm" disabled={isSending} onClick={() => { setPhoto(null); setIsPhotoRemoved(true); }}>Quitar foto</button>}
                </div>
                <small>Sin foto se usa la del primer producto. Se recorta cuadrada.</small>
            </div>

            <label className="adm-combo-form__check">
                <input type="checkbox" checked={isEnabled} disabled={isSending} onChange={(event) => setIsEnabled(event.target.checked)} />
                <span>Activo (si lo apagas, no se vende aunque sea su día)</span>
            </label>

            {error && <p className="adm-combo-form__error" role="alert">{error}</p>}

            <div className="adm-combo-form__actions">
                <button type="submit" className="adm-btn adm-btn--solid adm-btn--block" disabled={isSending}>{isSending ? "Guardando…" : "Guardar"}</button>
                {combo && (isConfirmingDelete ? (
                    <div className="adm-combo-form__confirm" role="alert">
                        <p>¿Borrar {combo.name}? Esta acción no se puede deshacer.</p>
                        <button type="button" className="adm-btn adm-btn--danger" disabled={isSending} onClick={() => void confirmDelete()}>Sí, borrar combo</button>
                        <button type="button" className="adm-btn" disabled={isSending} onClick={() => setIsConfirmingDelete(false)}>Cancelar</button>
                    </div>
                ) : (
                    <button type="button" className="adm-btn adm-btn--block" disabled={isSending} onClick={() => setIsConfirmingDelete(true)}>Borrar combo</button>
                ))}
            </div>
        </form>
    );
};

/* ============ Historia ============ */

interface IStoryState {
    combo: IComboAdmin;
    status: "loading" | "ready" | "error";
    blob?: Blob;
    url?: string;
    error?: string;
}

const getStoryFileName = (name: string) => {
    const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `historia-${slug || "combo"}.png`;
};

const StorySheet = ({ story, onClose }: { story: IStoryState; onClose: () => void }) => {
    const fileName = getStoryFileName(story.combo.name);
    const file = story.blob ? new File([story.blob], fileName, { type: "image/png" }) : null;
    const canShare = Boolean(file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file as File] }));
    const [shareError, setShareError] = useState("");

    const share = async () => {
        if (!file) return;
        try {
            await navigator.share({ files: [file], title: story.combo.name });
        } catch (shareFailure) {
            // Cerrar el menú del sistema no es un error
            if (!(shareFailure instanceof DOMException && shareFailure.name === "AbortError")) setShareError("No pudimos abrir el menú para compartir. Usa Descargar PNG.");
        }
    };

    return (
        <FullSheet title="Historia lista" onClose={onClose}>
            {() => (
                <div className="adm-combo-story">
                    {story.status === "loading" && <p role="status">Dibujando la historia…</p>}
                    {story.status === "error" && <p role="alert">{story.error}</p>}
                    {story.status === "ready" && story.url && (
                        <>
                            <p className="adm-note">Vista previa del PNG de 1080×1920.</p>
                            <img className="adm-combo-story__preview" src={story.url} alt={`Historia del combo ${story.combo.name}`} />
                            <div className="adm-combo-form__actions">
                                {canShare && <button type="button" className="adm-btn adm-btn--solid adm-btn--block" onClick={() => void share()}>Compartir</button>}
                                <a className="adm-btn adm-btn--block adm-combo-story__download" href={story.url} download={fileName}>Descargar PNG</a>
                            </div>
                            {shareError && <p role="alert">{shareError}</p>}
                            <p className="adm-note">En el teléfono, "Compartir" abre el menú del sistema para mandarla directo a Instagram.</p>
                        </>
                    )}
                </div>
            )}
        </FullSheet>
    );
};

/* ============ Lista ============ */

export const AdminCombos = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const [combos, setCombos] = useState<IComboAdmin[]>([]);
    const [categories, setCategories] = useState<IMenuCategory[]>([]);
    const [items, setItems] = useState<IMenuItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState<INotice | null>(null);
    const [editing, setEditing] = useState<IComboAdmin | null | undefined>(undefined);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [story, setStory] = useState<IStoryState | null>(null);

    const showError = useCallback((requestError: unknown, fallback: string) => {
        if (requestError instanceof HttpError && requestError.status === 401) {
            onSessionExpired();
            return "";
        }
        return getErrorMessage(requestError, fallback);
    }, [onSessionExpired]);

    const load = useCallback(async (signal?: AbortSignal) => {
        try {
            const [nextCombos, menu] = await Promise.all([fetchAdminCombos(token, signal), fetchMenu(token, signal)]);
            if (signal?.aborted) return;
            setCombos(nextCombos);
            setCategories(menu.categories);
            setItems(menu.items);
            setError("");
        } catch (requestError) {
            if (!signal?.aborted) setError(showError(requestError, "No pudimos cargar los combos. Intenta de nuevo."));
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, [token, showError]);

    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);

    // El estado "Empieza hoy a las…" se mueve con la hora
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 30000);
        return () => window.clearInterval(timer);
    }, []);

    const closeEditor = useCallback(() => setEditing(undefined), []);

    const toggle = async (combo: IComboAdmin) => {
        setBusyId(combo.id);
        setNotice(null);
        try {
            await updateCombo(token, combo.id, { ...getComboInput(combo), isEnabled: !combo.isEnabled });
            await load();
        } catch (requestError) {
            setError(showError(requestError, "No pudimos cambiar el combo."));
        } finally {
            setBusyId(null);
        }
    };

    const closeStory = useCallback(() => {
        setStory((current) => {
            if (current?.url) URL.revokeObjectURL(current.url);
            return null;
        });
    }, []);

    const makeStory = async (combo: IComboAdmin) => {
        setStory({ combo, status: "loading" });
        try {
            // Se carga aparte: trae las letras y el lienzo, que solo esta sección necesita
            const { drawComboStory } = await import("@/helpers/combo-story");
            const blob = await drawComboStory(combo, getComboSlotsText(combo.slots));
            setStory({ combo, status: "ready", blob, url: URL.createObjectURL(blob) });
        } catch (storyError) {
            console.error("[combos] no se pudo dibujar la historia:", storyError);
            setStory({ combo, status: "error", error: "No pudimos dibujar la historia. Revisa tu conexión e intenta de nuevo." });
        }
    };

    return (
        <section className="adm-combos">
            <button className="adm-btn adm-btn--solid" type="button" disabled={isLoading} onClick={() => { setNotice(null); setEditing(null); }}>+ Nuevo combo</button>
            {notice && <p className={`adm-combos__notice adm-combos__notice--${notice.tone}`} role="status">{notice.text}</p>}
            {error && <p className="adm-note" role="alert">{error}</p>}
            {isLoading ? <p>Cargando combos…</p> : combos.length === 0 && !error ? <p>Todavía no hay combos. Crea el primero para vender más por visita.</p> : null}

            {combos.map((combo) => {
                const status = getComboNextStart(combo, now);
                return (
                    <article className="adm-card adm-combo" key={combo.id}>
                        <div className="adm-combo__head">
                            <div>
                                <b className="adm-combo__name">{combo.name}</b>
                                <span className={`adm-combo__state adm-combo__state--${status.kind}`}>{status.label}</span>
                            </div>
                            <label className="adm-combo__switch">
                                <input type="checkbox" role="switch" checked={combo.isEnabled} disabled={busyId === combo.id} onChange={() => void toggle(combo)} />
                                {combo.isEnabled ? "Activo" : "Apagado"}
                            </label>
                        </div>
                        <ul className="adm-combo__meta">
                            <li><b>{formatPrice(combo.price)}</b>{combo.regularPrice !== null && combo.regularPrice > combo.price ? ` · antes ${formatPrice(combo.regularPrice)}` : ""}</li>
                            <li>{formatComboSchedule(combo.days, combo.timeFrom, combo.timeTo)}{combo.endsOn ? ` · hasta el ${formatComboDate(combo.endsOn)}` : ""}</li>
                            <li>{CHANNEL_LABEL[combo.channel]}</li>
                            <li>Hoy: <b>{combo.todayUses === 1 ? "1 vendido" : `${combo.todayUses} vendidos`}</b></li>
                        </ul>
                        <div className="adm-combo__actions">
                            <button type="button" className="adm-btn adm-btn--solid" onClick={() => void makeStory(combo)}>Generar historia</button>
                            <button type="button" className="adm-btn" onClick={() => { setNotice(null); setEditing(combo); }}>Editar</button>
                        </div>
                    </article>
                );
            })}
            <p className="adm-note">Un combo solo se ve en la web dentro de sus días y horas (hora de Panamá). Las promos 2x1 y % no se aplican a los combos.</p>

            {editing !== undefined && (
                <FullSheet title={editing ? "Editar combo" : "Nuevo combo"} onClose={closeEditor}>
                    {(close) => (
                        <ComboForm
                            token={token}
                            combo={editing}
                            categories={categories}
                            items={items}
                            close={close}
                            onDone={(next) => { setNotice(next); void load(); }}
                            onSessionExpired={onSessionExpired}
                        />
                    )}
                </FullSheet>
            )}

            {story && <StorySheet story={story} onClose={closeStory} />}
        </section>
    );
};
