import { useEffect, useState } from "react";

import {
    DAY_NAMES,
    HttpError,
    WEEK_ORDER,
    formatTime,
    isWithinOperatingHours,
    loadSettings,
    saveOpeningHours,
    setStoreStatus,
    useSettings,
} from "@/helpers";
import type { IDayHours, IWeekHours, StoreOverride } from "@/helpers";

type StoreStatus = StoreOverride | "auto";

const STATUS_OPTIONS: { value: StoreStatus; label: string }[] = [
    { value: "auto", label: "Automático" },
    { value: "open", label: "Abierto" },
    { value: "closed", label: "Cerrado" },
];

// Al abrir un dia que estaba cerrado se propone el horario del sabado
const NEW_DAY_HOURS: IDayHours = { open: "08:00", close: "17:00" };

const isValidDay = (day: IDayHours | null) => !day || day.close > day.open;

const isSameWeek = (a: IWeekHours, b: IWeekHours) => JSON.stringify(a) === JSON.stringify(b);

/** El estado de ahora en una etiqueta y una frase, como lo va a ver el cliente. */
const getStatusSummary = (status: StoreStatus, hours: IWeekHours, now = new Date()) => {
    const today = hours[now.getDay()];
    const dayName = DAY_NAMES[now.getDay()].toLowerCase();

    if (status === "open") {
        return { tone: "warn", pill: "Abierto a mano", text: "La web acepta pedidos todo el día de hoy, aunque el horario diga otra cosa." };
    }
    if (status === "closed") {
        return { tone: "crit", pill: "Cerrado a mano", text: "La web no acepta pedidos en línea hoy, aunque el horario diga que está abierto." };
    }

    const isOpen = isWithinOperatingHours(hours, now);
    return {
        tone: isOpen ? "good" : "",
        pill: isOpen && today ? `Abierto · hasta ${formatTime(today.close)}` : "Cerrado según horario",
        text: today
            ? `Sigue el horario de la semana. Hoy ${dayName} abre de ${formatTime(today.open)} a ${formatTime(today.close)}`
            : `Sigue el horario de la semana. Hoy ${dayName} no abre.`,
    };
};

/** Casos especiales: abrir o cerrar a mano por hoy y editar el horario de la semana. */
export const AdminHours = ({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) => {
    const { settings, isReady } = useSettings();
    const status: StoreStatus = settings.storeOverride ?? "auto";
    const [draft, setDraft] = useState<IWeekHours>(settings.openingHours);
    const [isDirty, setIsDirty] = useState(false);
    const [isConfirmingClose, setIsConfirmingClose] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [error, setError] = useState("");

    // Mientras no se edite, el borrador sigue lo que dice el API (otro admin pudo cambiarlo)
    useEffect(() => {
        if (!isDirty) setDraft(settings.openingHours);
    }, [settings.openingHours, isDirty]);

    const handleError = (requestError: unknown, fallback: string) => {
        if (requestError instanceof HttpError && requestError.status === 401) return onSessionExpired();
        setError(requestError instanceof HttpError ? requestError.message : fallback);
    };

    const changeStatus = async (next: StoreStatus) => {
        setIsSaving(true);
        setError("");

        try {
            await setStoreStatus(token, next);
            await loadSettings();
            setIsConfirmingClose(false);
        } catch (requestError) {
            handleError(requestError, "No pudimos cambiar el estado del local.");
        } finally {
            setIsSaving(false);
        }
    };

    // Cerrar deja a los clientes sin pedir en línea: pide confirmación
    const chooseStatus = (next: StoreStatus) => {
        if (next === status) return;
        if (next === "closed") return setIsConfirmingClose(true);
        void changeStatus(next);
    };

    const updateDay = (day: number, next: IDayHours | null) => {
        setDraft((current) => current.map((hours, index) => (index === day ? next : hours)));
        setIsDirty(true);
        setIsSaved(false);
    };

    const toggleDay = (day: number, isOpen: boolean) =>
        updateDay(day, isOpen ? settings.openingHours[day] ?? NEW_DAY_HOURS : null);

    const discard = () => {
        setDraft(settings.openingHours);
        setIsDirty(false);
        setError("");
    };

    const isDraftValid = draft.every(isValidDay);
    const hasChanges = isDirty && !isSameWeek(draft, settings.openingHours);

    const save = async () => {
        setIsSaving(true);
        setError("");

        try {
            await saveOpeningHours(token, draft);
            await loadSettings();
            setIsDirty(false);
            setIsSaved(true);
        } catch (requestError) {
            handleError(requestError, "No pudimos guardar el horario.");
        } finally {
            setIsSaving(false);
        }
    };

    const summary = getStatusSummary(status, settings.openingHours);

    return (
        <section className="adm-band adm-hours">
            <div className="adm-band__head">
                <h2 className="script">Horario del local</h2>
                <span className="adm-band__sub">Para casos especiales: feriados, cierres temprano o abrir un día que no toca</span>
            </div>

            <h3 className="adm-hours__title">Estado ahora</h3>
            <div className="adm-pasta__row">
                <div className="adm-seg" role="group" aria-label="Estado del local">
                    {STATUS_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            id={`store-status-${option.value}`}
                            className={`adm-seg__btn adm-seg__btn--${option.value}`}
                            aria-pressed={status === option.value}
                            disabled={!isReady || isSaving}
                            onClick={() => chooseStatus(option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <span className={`adm-pasta__state ${summary.tone ? `adm-pasta__state--${summary.tone}` : ""}`} role="status">
                    {isReady ? summary.pill : "Leyendo…"}
                </span>
            </div>
            <p className="adm-pasta__desc">{summary.text}</p>
            {status !== "auto" ? <p className="adm-hours__reset">Vuelve solo a Automático a medianoche.</p> : null}

            <h3 className="adm-hours__title adm-hours__title--week">Horario de la semana</h3>
            <div className="adm-hours__days">
                {WEEK_ORDER.map((day) => {
                    const hours = draft[day];
                    const isToday = day === new Date().getDay();

                    return (
                        <div key={day} className="adm-hours__day">
                            <span className="adm-hours__name">
                                {DAY_NAMES[day]}
                                {isToday ? <span className="adm-hours__today">hoy</span> : null}
                            </span>
                            <label className="adm-switch adm-switch--sm">
                                <input
                                    type="checkbox"
                                    id={`day-open-${day}`}
                                    checked={Boolean(hours)}
                                    onChange={(event) => toggleDay(day, event.target.checked)}
                                    disabled={!isReady || isSaving}
                                    aria-label={`${DAY_NAMES[day]} abierto`}
                                />
                                <span className="adm-switch__track" aria-hidden />
                            </label>
                            {hours ? (
                                <div className="adm-hours__times">
                                    <input
                                        type="time"
                                        id={`day-from-${day}`}
                                        className="adm-hours__time"
                                        value={hours.open}
                                        onChange={(event) => updateDay(day, { ...hours, open: event.target.value })}
                                        disabled={isSaving}
                                        aria-label={`Abre el ${DAY_NAMES[day].toLowerCase()}`}
                                        required
                                    />
                                    <span>a</span>
                                    <input
                                        type="time"
                                        id={`day-to-${day}`}
                                        className="adm-hours__time"
                                        value={hours.close}
                                        onChange={(event) => updateDay(day, { ...hours, close: event.target.value })}
                                        disabled={isSaving}
                                        aria-label={`Cierra el ${DAY_NAMES[day].toLowerCase()}`}
                                        required
                                    />
                                    {!isValidDay(hours) ? <span className="adm-hours__invalid">Cierra antes de abrir</span> : null}
                                </div>
                            ) : (
                                <span className="adm-hours__closed">Cerrado todo el día</span>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="adm-hours__actions">
                <button type="button" className="adm-btn adm-btn--solid" onClick={() => void save()} disabled={!hasChanges || !isDraftValid || isSaving}>
                    {isSaving ? "Guardando…" : "Guardar horario"}
                </button>
                {hasChanges ? (
                    <button type="button" className="adm-btn" onClick={discard} disabled={isSaving}>Descartar cambios</button>
                ) : null}
                {isSaved && !hasChanges ? (
                    <span className="adm-hours__saved" role="status">Horario guardado. Los clientes lo ven en menos de un minuto.</span>
                ) : null}
            </div>

            {error ? <p className="adm-error">{error}</p> : null}

            {isConfirmingClose ? (
                <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Cerrar el local hoy">
                    <div className="adm-modal__panel">
                        <h3 className="script">¿Cerrar el local hoy?</h3>
                        <ul className="adm-pasta__list">
                            <li>La web mostrará «Cerrado hoy» y no aceptará pedidos en línea.</li>
                            <li>También aplica si el modo pasta está activo.</li>
                            <li>Mañana vuelve solo al horario normal.</li>
                        </ul>
                        <div className="adm-modal__actions">
                            <button type="button" className="adm-btn" onClick={() => setIsConfirmingClose(false)} disabled={isSaving}>Cancelar</button>
                            <button type="button" className="adm-btn adm-btn--danger" onClick={() => void changeStatus("closed")} disabled={isSaving}>
                                {isSaving ? "Cerrando…" : "Cerrar hoy"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
};
