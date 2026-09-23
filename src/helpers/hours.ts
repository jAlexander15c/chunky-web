/** Horario de un dia ("08:00" a "20:00"), o null si ese dia no abre. */
export interface IDayHours {
    open: string;
    close: string;
}

/** Siete dias, del domingo (0) al sabado (6), como Date#getDay. Se edita en /tablero. */
export type IWeekHours = (IDayHours | null)[];

/** Abierto o cerrado a mano desde /tablero; solo dura el dia en que se puso. */
export type StoreOverride = "open" | "closed";

/** El horario de siempre, por si el API no responde: lunes a viernes 8 a 20, sabado 8 a 17. */
export const DEFAULT_OPENING_HOURS: IWeekHours = [
    null,
    ...Array.from({ length: 5 }, () => ({ open: "08:00", close: "20:00" })),
    { open: "08:00", close: "17:00" },
];

export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** La semana empieza el lunes, como la lee el cliente. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const getMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
};

const getMinutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

/** "08:00" -> "8:00 a. m.": las horas siempre se muestran en formato de 12 horas. */
export const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", hour12: true });
};

export const isWithinOperatingHours = (hours: IWeekHours, date = new Date()) => {
    const today = hours[date.getDay()];
    if (!today) return false;

    const now = getMinutesOfDay(date);
    return now >= getMinutes(today.open) && now < getMinutes(today.close);
};

/** Texto corto para cuando la barra esta cerrada: indica cuando vuelve a abrir. */
export const getNextOpeningLabel = (hours: IWeekHours, date = new Date(), isClosedToday = false) => {
    const day = date.getDay();
    const today = hours[day];

    if (!isClosedToday && today && getMinutesOfDay(date) < getMinutes(today.open)) {
        return `Abrimos hoy a las ${formatTime(today.open)}`;
    }

    for (let offset = 1; offset <= 7; offset++) {
        const next = hours[(day + offset) % 7];
        if (!next) continue;
        const when = offset === 1 ? "mañana" : `el ${DAY_NAMES[(day + offset) % 7].toLowerCase()}`;
        return `Abrimos ${when} a las ${formatTime(next.open)}`;
    }

    return "Por ahora estamos cerrados";
};

/** Estado de la barra segun el horario: "Abierto hasta las 8:00 p. m." o cuando vuelve a abrir. */
export const getOpeningStatusLabel = (hours: IWeekHours, isOpen: boolean, date = new Date()) => {
    const today = hours[date.getDay()];
    return isOpen && today ? `Abierto hasta las ${formatTime(today.close)}` : getNextOpeningLabel(hours, date);
};

const formatDayHours = (day: IDayHours | null) => (day ? `${formatTime(day.open)} a ${formatTime(day.close)}` : "Cerrado");

/** Filas para mostrar el horario: los dias seguidos con las mismas horas van juntos ("Lunes a viernes"). */
export const getOpeningHoursRows = (hours: IWeekHours) => {
    const groups: { from: number; to: number; hours: string }[] = [];

    WEEK_ORDER.forEach((day) => {
        const text = formatDayHours(hours[day]);
        const last = groups[groups.length - 1];
        if (last && last.hours === text) last.to = day;
        else groups.push({ from: day, to: day, hours: text });
    });

    return groups.map((group) => ({
        days: group.from === group.to ? DAY_NAMES[group.from] : `${DAY_NAMES[group.from]} a ${DAY_NAMES[group.to].toLowerCase()}`,
        hours: group.hours,
    }));
};
