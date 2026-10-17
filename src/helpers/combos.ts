import { useEffect, useState } from "react";

import { fetchItemsByCategoryCached, getCatalogScope, useCategories } from "./catalog";
import { getApiUrl, httpDelete, httpGet, httpPost, httpPostBinary, httpPut } from "./getHttp";
import type { ICartModifier } from "./modifiers";
import type { IPublicOrder } from "./payment";
import { useSettings } from "./settings";

import type { IItem } from "@/interfaces";

export type ComboChannel = "web" | "caja" | "both";

/** Un hueco del combo: el cliente elige 1 de sus productos (con uno solo, es fijo). */
export interface IComboSlot {
    label: string;
    itemIds: string[];
}

export interface IComboInput {
    name: string;
    description: string | null;
    /** Descuento entero de 0 a 90 sobre la suma de los precios normales de lo que elija el cliente. */
    discountPercent: number;
    slots: IComboSlot[];
    channel: ComboChannel;
    /** 0 = domingo ... 6 = sábado. */
    days: number[];
    timeFrom: string;
    timeTo: string;
    startsOn: string | null;
    endsOn: string | null;
    isEnabled: boolean;
}

export interface ICombo extends IComboInput {
    id: number;
    position: number;
    imageVersion: number | null;
    updatedByName: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface IComboAdmin extends ICombo {
    isActiveNow: boolean;
    /** "Desde" con descuento (la opción más barata de cada hueco). */
    price: number | null;
    /** "Desde" sin descuento. */
    regularPrice: number | null;
    /** Algún hueco tiene opciones de distinto precio. */
    priceVaries: boolean;
    todayUses: number;
}

/** Lo que ve el cliente en la web: solo los combos que están a la venta ahora. */
export interface IPublicCombo {
    id: number;
    name: string;
    description: string | null;
    /** "Desde" con descuento: la opción más barata de cada hueco. */
    price: number;
    /** "Desde" sin descuento. */
    regularPrice: number | null;
    discountPercent: number;
    /** Algún hueco tiene opciones de distinto precio (el precio es "desde"). */
    priceVaries: boolean;
    slots: IComboSlot[];
    timeTo: string;
    endsOn: string | null;
    imageVersion: number | null;
}

/** Lo elegido en un hueco: el producto y sus modificadores. */
export interface IComboChoice {
    item: IItem;
    modifiers: ICartModifier[];
}

export const COMBO_LIMITS = { nameMax: 60, labelMax: 30, slotsMax: 6, quantityMax: 20, discountMax: 90 } as const;

/* ============ Horario (siempre hora de Panamá, UTC-5 sin horario de verano) ============ */

const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const COMBO_DAY_LABELS = WEEK_ORDER.map((day) => ({ day, label: DAY_SHORT[day] }));

/** Fecha y hora de Panamá de un instante: { date: "2026-10-17", day: 6, minutes: 905 }. */
const getPanamaClock = (now: Date) => {
    const shifted = new Date(now.getTime() - PANAMA_OFFSET_MS);
    return {
        date: shifted.toISOString().slice(0, 10),
        day: shifted.getUTCDay(),
        minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    };
};

const addDaysToDate = (date: string, days: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

const getDayOfDate = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** "15:30" -> 930. */
export const getComboMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
};

/** "15:00" -> { hour: 3, minutes: 0, suffix: "pm" }. */
const splitTime = (time: string) => {
    const total = getComboMinutes(time);
    const hours = Math.floor(total / 60) % 24;
    return { hour: hours % 12 === 0 ? 12 : hours % 12, minutes: total % 60, suffix: hours < 12 ? "am" : "pm" };
};

const formatClock = (part: ReturnType<typeof splitTime>) => `${part.hour}${part.minutes ? `:${String(part.minutes).padStart(2, "0")}` : ""}`;

/** "15:00" -> "3 pm"; "15:30" -> "3:30 pm". */
export const formatComboTime = (time: string) => {
    const part = splitTime(time);
    return `${formatClock(part)} ${part.suffix}`;
};

/** "15:00","18:00" -> "3 a 6 pm"; "11:00","14:00" -> "11 am a 2 pm". */
export const formatComboHours = (timeFrom: string, timeTo: string) => {
    const from = splitTime(timeFrom);
    const to = splitTime(timeTo);
    if (getComboMinutes(timeFrom) === 0 && getComboMinutes(timeTo) >= 23 * 60 + 59) return "Todo el día";
    return from.suffix === to.suffix
        ? `${formatClock(from)} a ${formatClock(to)} ${to.suffix}`
        : `${formatClock(from)} ${from.suffix} a ${formatClock(to)} ${to.suffix}`;
};

/** [1,2,3,4,5] -> "Lun a Vie"; [6,0] -> "Sáb y Dom"; [1,3,5] -> "Lun, Mié y Vie". */
export const formatComboDays = (days: number[]) => {
    const chosen = WEEK_ORDER.filter((day) => days.includes(day));
    if (chosen.length === 7) return "Todos los días";
    // Tandas de días seguidos (Lun a Dom): de 3 en adelante se dicen "A a B"
    const runs: number[][] = [];
    chosen.forEach((day) => {
        const last = runs[runs.length - 1];
        if (last && WEEK_ORDER.indexOf(day) === WEEK_ORDER.indexOf(last[last.length - 1]) + 1) last.push(day);
        else runs.push([day]);
    });
    const parts = runs.flatMap((run) => run.length >= 3 ? [`${DAY_SHORT[run[0]]} a ${DAY_SHORT[run[run.length - 1]]}`] : run.map((day) => DAY_SHORT[day]));
    if (parts.length <= 1) return parts[0] ?? "";
    return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
};

/** "Lun a Vie · 3 a 6 pm". */
export const formatComboSchedule = (days: number[], timeFrom: string, timeTo: string) =>
    `${formatComboDays(days)} · ${formatComboHours(timeFrom, timeTo)}`;

/** "18:00" -> "Hasta las 6 pm"; "13:00" -> "Hasta la 1 pm"; "18:30" -> "Hasta las 6:30 pm". */
export const formatComboUntil = (timeTo: string) => {
    const part = splitTime(timeTo);
    return `Hasta ${part.hour === 1 ? "la" : "las"} ${formatClock(part)} ${part.suffix}`;
};

/** "2026-10-31" -> "31 oct". */
export const formatComboDate = (date: string) => {
    const [, month, day] = date.split("-").map(Number);
    return `${day} ${MONTH_SHORT[month - 1]}`;
};

type ComboWindow = Pick<IComboInput, "days" | "timeFrom" | "timeTo" | "startsOn" | "endsOn">;

/** ¿Está a la venta en ese instante según su horario? (La web usa lo que responde el API; esto es para el admin.) */
export const isComboOnSale = (combo: ComboWindow, now = new Date()) => {
    const clock = getPanamaClock(now);
    if (combo.startsOn && clock.date < combo.startsOn) return false;
    if (combo.endsOn && clock.date > combo.endsOn) return false;
    return combo.days.includes(clock.day) && clock.minutes >= getComboMinutes(combo.timeFrom) && clock.minutes < getComboMinutes(combo.timeTo);
};

export interface IComboStatus {
    kind: "now" | "soon" | "ended" | "off";
    label: string;
}

/**
 * El estado de un combo en el admin: "A la venta ahora", "Empieza hoy a las 3 pm",
 * "Empieza el martes a las 5 pm", "Terminó el 31 oct" o "Apagado".
 */
export const getComboNextStart = (combo: ComboWindow & Pick<IComboInput, "isEnabled"> & { isActiveNow?: boolean }, now = new Date()): IComboStatus => {
    if (!combo.isEnabled) return { kind: "off", label: "Apagado" };
    const clock = getPanamaClock(now);
    if (combo.endsOn && clock.date > combo.endsOn) return { kind: "ended", label: `Terminó el ${formatComboDate(combo.endsOn)}` };
    if (combo.isActiveNow ?? isComboOnSale(combo, now)) return { kind: "now", label: "A la venta ahora" };

    const from = getComboMinutes(combo.timeFrom);
    const firstDate = combo.startsOn && combo.startsOn > clock.date ? combo.startsOn : clock.date;
    for (let offset = 0; offset < 15; offset++) {
        const date = addDaysToDate(firstDate, offset);
        if (combo.endsOn && date > combo.endsOn) break;
        if (!combo.days.includes(getDayOfDate(date))) continue;
        // Hoy: solo cuenta si todavía no empezó (si ya pasó su hora, se busca el próximo día)
        if (date === clock.date && clock.minutes >= from) continue;
        const at = formatComboTime(combo.timeFrom);
        if (date === clock.date) return { kind: "soon", label: `Empieza hoy a las ${at}` };
        if (date === addDaysToDate(clock.date, 1)) return { kind: "soon", label: `Empieza mañana a las ${at}` };
        const distance = Math.round((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${clock.date}T12:00:00Z`).getTime()) / DAY_MS);
        return { kind: "soon", label: distance < 7 ? `Empieza el ${DAY_LONG[getDayOfDate(date)]} a las ${at}` : `Empieza el ${formatComboDate(date)} a las ${at}` };
    }
    return { kind: "soon", label: "Sin horario próximo" };
};

/* ============ Textos y precios ============ */

/** "1 galleta a elegir + 1 bebida a elegir"; un hueco fijo (un solo producto) va sin "a elegir". */
export const getComboSlotsText = (slots: IComboSlot[]) =>
    slots.map((slot) => `1 ${slot.label.trim().toLowerCase()}${slot.itemIds.length > 1 ? " a elegir" : ""}`).join(" + ");

/** Precio de una unidad del combo según lo elegido: suma de precios normales menos el %, al centavo hacia arriba. Igual que en el API. */
export const getComboTotal = (componentPrices: number[], discountPercent: number): number => {
    // En centavos enteros: 5.50 * 0.9 en flotante da 4.9500000001 y al subir saldría 4.96
    const cents = componentPrices.reduce((sum, price) => sum + Math.round(Math.max(price, 0) * 100), 0);
    // Al centavo hacia arriba; con 0 % queda la suma tal cual
    return Math.ceil(cents * (100 - discountPercent) / 100) / 100;
};

/** Lo que suman los modificadores elegidos en todos los huecos (completos, sin descuento). */
export const getComboExtras = (choices: Pick<IComboChoice, "modifiers">[]) =>
    Math.round(choices.reduce((sum, choice) => sum + choice.modifiers.reduce((inner, modifier) => inner + modifier.price, 0), 0) * 100) / 100;

/** Precio de una unidad en el carrito: el total de lo elegido (ya con el descuento) más lo que cuesten los modificadores. */
export const getComboUnitPrice = (selectionTotal: number, choices: Pick<IComboChoice, "modifiers">[]) =>
    Math.round((selectionTotal + getComboExtras(choices)) * 100) / 100;

/** "Leche: Avena". */
const formatModifierLabel = (modifier: ICartModifier) => {
    const name = modifier.name.trim();
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${modifier.option}`;
};

/** Identidad de la línea del carrito: el combo y, por hueco, el producto y sus modificadores. */
export const getComboLineKey = (comboId: number, choices: IComboChoice[]) =>
    `combo:${comboId}:${choices
        .map((choice) => [choice.item.variants[0].variant_id, ...choice.modifiers.map((modifier) => modifier.modifierOptionId).sort()].join("+"))
        .join("|")}`;

/** "Chocochip · Café frío (Leche: Avena +$0.50)": lo elegido por hueco, con el precio de cada extra. */
export const formatComboChoices = (choices: IComboChoice[], separator = " · ") =>
    choices
        .map((choice) => choice.modifiers.length
            ? `${choice.item.item_name} (${choice.modifiers.map((modifier) => `${formatModifierLabel(modifier)}${modifier.price > 0 ? ` +$${modifier.price.toFixed(2)}` : ""}`).join(", ")})`
            : choice.item.item_name)
        .join(separator);

/** Una fila del ticket de /pedido: un producto suelto o un combo con sus productos debajo. */
export type OrderTicketRow =
    | { kind: "line"; line: IPublicOrder["lines"][number] }
    | { kind: "combo"; groupKey: string; name: string; quantity: number; total: number; products: string[] };

/** Junta las líneas de un mismo combo (mismo groupKey) en una sola fila: "Combo X ×2 · $12.00". */
export const groupOrderLines = (lines: IPublicOrder["lines"]): OrderTicketRow[] => {
    const rows: OrderTicketRow[] = [];
    lines.forEach((line) => {
        if (!line.combo) {
            rows.push({ kind: "line", line });
            return;
        }
        const extras = (line.modifiers ?? []).reduce((sum, modifier) => sum + modifier.price, 0) * line.quantity;
        const product = line.modifiers?.length ? `${line.name} (${line.modifiers.map((modifier) => `${modifier.name} ${modifier.option}`).join(", ")})` : line.name;
        const existing = rows.find((row) => row.kind === "combo" && row.groupKey === line.combo!.groupKey);
        if (existing && existing.kind === "combo") {
            existing.products.push(product);
            existing.total = Math.round((existing.total + extras) * 100) / 100;
            return;
        }
        rows.push({
            kind: "combo",
            groupKey: line.combo.groupKey,
            name: line.combo.comboName,
            quantity: line.quantity,
            total: Math.round((line.combo.comboPrice * line.quantity + extras) * 100) / 100,
            products: [product],
        });
    });
    return rows;
};

/**
 * Lo que cuesta el combo por separado, con los precios del catálogo: de la opción más barata de cada
 * hueco a la más cara. `min`/`max` ya llevan el descuento; `regularMin`/`regularMax` no.
 */
export const getComboRange = (slots: IComboSlot[], items: { id: string; price: number | null }[], discountPercent = 0) => {
    const cheapest: number[] = [];
    const priciest: number[] = [];
    slots.forEach((slot) => {
        const prices = items.filter((item) => slot.itemIds.includes(item.id) && item.price !== null).map((item) => item.price as number);
        cheapest.push(prices.length ? Math.min(...prices) : 0);
        priciest.push(prices.length ? Math.max(...prices) : 0);
    });
    return {
        regularMin: getComboTotal(cheapest, 0),
        regularMax: getComboTotal(priciest, 0),
        min: getComboTotal(cheapest, discountPercent),
        max: getComboTotal(priciest, discountPercent),
    };
};

/* ============ Combos a la venta (web) ============ */

const COMBOS_TTL_MS = 60000;

let cache: { combos: IPublicCombo[]; savedAt: number } | null = null;
let request: Promise<IPublicCombo[]> | null = null;
const listeners = new Set<(combos: IPublicCombo[]) => void>();

const toCombos = (response: IPublicCombo[] | { combos: IPublicCombo[] }) => Array.isArray(response) ? response : response?.combos ?? [];

export const fetchCombosCached = (force = false): Promise<IPublicCombo[]> => {
    if (!force && cache && Date.now() - cache.savedAt < COMBOS_TTL_MS) return Promise.resolve(cache.combos);
    if (!request) {
        request = httpGet<IPublicCombo[] | { combos: IPublicCombo[] }>("/combos")
            .then((response) => {
                const combos = toCombos(response);
                cache = { combos, savedAt: Date.now() };
                listeners.forEach((listener) => listener(combos));
                return combos;
            })
            .finally(() => { request = null; });
    }
    return request;
};

/**
 * Los que siguen a la venta en este momento: el API ya filtró al responder, pero si el reloj pasó la
 * hora de cierre (o cambió el día) antes de la siguiente consulta, el combo se esconde sin esperar.
 */
export const getVisibleCombos = (combos: IPublicCombo[], now = new Date(), fetchedAt = now) => {
    const clock = getPanamaClock(now);
    if (clock.date !== getPanamaClock(fetchedAt).date) return [];
    return combos.filter((combo) => clock.minutes < getComboMinutes(combo.timeTo));
};

export const getComboImageUrl = (combo: Pick<IPublicCombo, "id" | "imageVersion">) =>
    getApiUrl(`/combos/${combo.id}/image?v=${combo.imageVersion ?? 0}`);

/** `isReady`: ya se consultó al menos una vez (para no tomar por "ya no está" lo que aún no cargó). */
export const useCombos = () => {
    const [state, setState] = useState<{ combos: IPublicCombo[]; fetchedAt: number | null }>({ combos: cache?.combos ?? [], fetchedAt: cache?.savedAt ?? null });
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const listener = (combos: IPublicCombo[]) => setState({ combos, fetchedAt: Date.now() });
        listeners.add(listener);
        const refresh = () => { void fetchCombosCached().catch(() => undefined); };
        refresh();
        const poll = window.setInterval(refresh, COMBOS_TTL_MS);
        const tick = window.setInterval(() => setNow(new Date()), 15000);
        return () => {
            listeners.delete(listener);
            window.clearInterval(poll);
            window.clearInterval(tick);
        };
    }, []);

    const fetchedAt = state.fetchedAt === null ? null : new Date(state.fetchedAt);
    const combos = fetchedAt ? getVisibleCombos(state.combos, now, fetchedAt) : [];
    return { combos, isReady: fetchedAt !== null };
};

/** Los productos de la web por id, para armar las opciones de un combo. Solo carga cuando `enabled`. */
export const useComboItems = (enabled: boolean) => {
    const { categories } = useCategories();
    const { settings } = useSettings();
    const [items, setItems] = useState<Map<string, IItem>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const scope = getCatalogScope(settings.pastaMode, settings.pastaFullMenu);

    useEffect(() => {
        if (!enabled || categories.length === 0) return;
        let cancelled = false;
        void Promise.all(categories.map((category) => fetchItemsByCategoryCached(category.id, scope).catch(() => [] as IItem[]))).then((lists) => {
            if (cancelled) return;
            setItems(new Map(lists.flat().map((item) => [item.id, item])));
            setIsLoading(false);
        });
        return () => { cancelled = true; };
    }, [enabled, categories, scope]);

    return { items, isLoading };
};

/* ============ Admin ============ */

const getAdminHeaders = (token: string) => ({ "x-admin-token": token });

export const fetchAdminCombos = async (token: string, signal?: AbortSignal) => {
    const response = await httpGet<IComboAdmin[] | { combos: IComboAdmin[] }>("/admin/combos", { signal, headers: getAdminHeaders(token) });
    return Array.isArray(response) ? response : response?.combos ?? [];
};

export const createCombo = (token: string, input: IComboInput) =>
    httpPost<ICombo>("/admin/combos", input, { headers: getAdminHeaders(token) });

/** Edita con el cuerpo completo (no hay cambios parciales). */
export const updateCombo = (token: string, id: number, input: IComboInput) =>
    httpPut<ICombo>(`/admin/combos/${id}`, input, { headers: getAdminHeaders(token) });

export const deleteCombo = (token: string, id: number) =>
    httpDelete<void>(`/admin/combos/${id}`, { headers: getAdminHeaders(token) });

export const uploadComboImage = (token: string, id: number, image: Blob) =>
    httpPostBinary<{ imageVersion: number }>(`/admin/combos/${id}/image`, image, { headers: getAdminHeaders(token) });

export const deleteComboImage = (token: string, id: number) =>
    httpDelete<void>(`/admin/combos/${id}/image`, { headers: getAdminHeaders(token) });

/** El cuerpo completo del PUT a partir de un combo ya guardado. */
export const getComboInput = (combo: IComboInput): IComboInput => ({
    name: combo.name,
    description: combo.description,
    discountPercent: combo.discountPercent,
    slots: combo.slots.map((slot) => ({ label: slot.label, itemIds: [...slot.itemIds] })),
    channel: combo.channel,
    days: [...combo.days],
    timeFrom: combo.timeFrom,
    timeTo: combo.timeTo,
    startsOn: combo.startsOn,
    endsOn: combo.endsOn,
    isEnabled: combo.isEnabled,
});

/** Las mismas reglas del API; devuelve el primer problema o null. */
export const getComboError = (input: IComboInput): string | null => {
    const name = input.name.trim();
    if (!name || name.length > COMBO_LIMITS.nameMax) return `Escribe el nombre (hasta ${COMBO_LIMITS.nameMax} letras).`;
    if (!Number.isInteger(input.discountPercent) || input.discountPercent < 0 || input.discountPercent > COMBO_LIMITS.discountMax) return `El descuento va de 0 a ${COMBO_LIMITS.discountMax} %, sin decimales.`;
    if (input.slots.length < 1 || input.slots.length > COMBO_LIMITS.slotsMax) return `El combo lleva de 1 a ${COMBO_LIMITS.slotsMax} huecos.`;
    for (const slot of input.slots) {
        const label = slot.label.trim();
        if (!label || label.length > COMBO_LIMITS.labelMax) return `Cada hueco necesita un nombre (hasta ${COMBO_LIMITS.labelMax} letras).`;
        if (slot.itemIds.length < 1) return `Elige al menos un producto en el hueco ${label}.`;
    }
    if (input.days.length < 1) return "Elige al menos un día.";
    if (!input.timeFrom || !input.timeTo || getComboMinutes(input.timeTo) <= getComboMinutes(input.timeFrom)) return "La hora final tiene que ser después de la inicial.";
    if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) return "La fecha en que termina no puede ser antes de la que empieza.";
    return null;
};
