import { httpGet, httpPost } from "./getHttp";
import { formatPrice } from "./order";
import { formatPhone, getPhoneDigits } from "./payment";
import { getCatalogGroupsMissing } from "./pastry";
import type { ICatalogProduct } from "./pastry";
import { PRIVACY_NOTICE_VERSION } from "./privacy";

/**
 * El catálogo (postres, tamaños, opciones y precios) lo publica el API en GET /quotes/catalog
 * desde las recetas de Repostería: aquí solo viven los tipos de las cotizaciones viejas de
 * cakes y postres, que se siguen leyendo, y lo que arma el cliente.
 */
export type QuoteSize = "4.5" | "6" | "7";
export type QuoteHeight = 1 | 2;
type DessertSize = "5.5" | "7" | "8";

/** Qué es lo cotizado, para el tracking del embudo: un cake (con foto) o un postre entero. */
export type QuoteKind = "cake" | "postre";

export interface IQuoteDraft {
    /** Null mientras carga el catálogo o no hay recetas publicadas. */
    productId: number | null;
    sizeId: number | null;
    /** Las opciones elegidas de todos los grupos. */
    optionIds: number[];
    topper: boolean;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    desiredDate: string;
    note: string;
    cakeImage: string | null;
    topperImage: string | null;
    /** Aceptó el aviso de privacidad antes de mandar sus datos (Ley 81). */
    privacyConsent: boolean;
    /** Cuántos iguales quiere: el total se multiplica. */
    quantity: number;
}

/** Tope de unidades iguales en una cotización. El API valida lo mismo. */
export const MAX_QUOTE_QUANTITY = 20;

/** El total de varias iguales, al centavo: el precio de una por la cantidad. */
export const getQuoteQuantityTotal = (unitTotal: number, quantity: number) => Math.round(unitTotal * quantity * 100) / 100;

/** Días que necesita la pastelería para preparar un cake. El API valida lo mismo. */
export const QUOTE_LEAD_DAYS = 4;

/** Hoy en Panamá más esos días, como AAAA-MM-DD. */
const getQuoteDateInDays = (days: number) =>
    new Date(Date.now() - 5 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** El primer día que se puede elegir: hoy. Antes de los días de preparación llega igual y la pastelera decide. */
export const getTodayQuoteDate = () => getQuoteDateInDays(0);

/** El primer día con los días de preparación completos: hoy en Panamá más QUOTE_LEAD_DAYS. */
export const getEarliestQuoteDate = () => getQuoteDateInDays(QUOTE_LEAD_DAYS);

/** Pedida con menos días de los que se piden: se manda igual, con aviso. */
export const isShortNoticeQuoteDate = (date: string) => Boolean(date) && date >= getTodayQuoteDate() && date < getEarliestQuoteDate();

/** Un correo con forma de correo: el API lo valida igual y ahí le llegan el acuse y la confirmación. */
export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) && value.trim().length <= 254;

/**
 * Lo que falta para poder enviar, en palabras del cliente. Vacío es listo. Las reglas de cada receta
 * (mínimo, máximo e incluidas de cada grupo, foto y topper) salen del catálogo.
 */
export const getQuoteMissing = (draft: IQuoteDraft, product: ICatalogProduct | undefined) => {
    const missing: string[] = [];
    if (!product || draft.sizeId === null) missing.push("Elige el postre y el tamaño");
    else {
        missing.push(...getCatalogGroupsMissing(product, draft.sizeId, draft.optionIds));
        if (product.needsPhoto && !draft.cakeImage) missing.push("Sube la foto de referencia");
        if (product.allowsTopper && draft.topper && !draft.topperImage) missing.push("Sube la foto de referencia del topper");
    }
    if (draft.customerName.trim().length < 2) missing.push("Escribe tu nombre");
    if (!/^6\d{7}$/.test(getPhoneDigits(draft.customerPhone))) missing.push("Escribe tu WhatsApp (8 dígitos, empieza en 6)");
    if (!isValidEmail(draft.customerEmail)) missing.push("Escribe tu correo");
    if (!draft.desiredDate) missing.push("Elige la fecha deseada");
    else if (draft.desiredDate < getTodayQuoteDate()) missing.push("Esa fecha ya pasó: elige hoy o un día después");
    if (!draft.privacyConsent) missing.push("Acepta el aviso de privacidad");
    return missing;
};

const MAX_IMAGE_SIDE = 1400;
const IMAGE_QUALITY = 0.82;

/**
 * Achica la foto en el navegador antes de mandarla: una foto de celular pesa varios MB y
 * se guarda en la base. Sale como JPEG de unos cientos de kB, lista para un <img src>.
 */
export const compressImage = (file: File) =>
    new Promise<string>((resolve, reject) => {
        if (!file.type.startsWith("image/")) {
            reject(new Error("Ese archivo no es una imagen."));
            return;
        }

        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(image.naturalWidth * scale);
            canvas.height = Math.round(image.naturalHeight * scale);

            const context = canvas.getContext("2d");
            if (!context) {
                URL.revokeObjectURL(url);
                reject(new Error("No pudimos procesar la foto."));
                return;
            }

            // Fondo blanco: un PNG transparente pasado a JPEG quedaría negro
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("No pudimos leer esa foto. Prueba con otra en JPG o PNG."));
        };

        image.src = url;
    });

/* ============ API ============ */

export type QuoteStatus = "nueva" | "confirmada" | "entregada" | "cancelada";

export const QUOTE_STATUSES: QuoteStatus[] = ["nueva", "confirmada", "entregada", "cancelada"];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
    nueva: "Nueva",
    confirmada: "Confirmada",
    entregada: "Entregada",
    cancelada: "Cancelada",
};

export const QUOTE_STATUS_PLURAL: Record<QuoteStatus, string> = {
    nueva: "Nuevas",
    confirmada: "Confirmadas",
    entregada: "Entregadas",
    cancelada: "Canceladas",
};

interface IQuoteLine {
    id: string;
    name: string;
    price: number;
}

/** Las cotizaciones de antes de los postres no traen `kind`: son cakes. */
interface ICakeSelection {
    kind?: "cake";
    size: QuoteSize;
    height: QuoteHeight;
    basePrice: number;
    dough: IQuoteLine;
    fillings: IQuoteLine[];
    topper: boolean;
    topperPrice: number;
}

interface IDessertSelection {
    kind: "postre";
    dessert: { id: string; name: string };
    size: DessertSize;
    basePrice: number;
}

/** Cotizaciones de recetas de Repostería: lo elegido y los precios al momento de pedirla. */
interface IRecipeSelection {
    kind: "receta";
    product: { id: number; name: string };
    size: { id: number; label: string };
    basePrice: number;
    options: { group: string; id: number; name: string; price: number }[];
    topper: boolean;
    topperPrice: number;
    estimatedCost: number;
    /** Los precios de arriba son de una unidad. Las de antes no lo traen: son 1. */
    quantity?: number;
}

export const isDessertSelection = (selection: IQuote["selection"]): selection is IDessertSelection =>
    selection.kind === "postre";

export const isRecipeSelection = (selection: IQuote["selection"]): selection is IRecipeSelection =>
    selection.kind === "receta";

export interface IQuote {
    id: number;
    code: string;
    status: QuoteStatus;
    customerName: string;
    /** Las registradas a mano pueden venir sin celular. */
    customerPhone: string | null;
    /** Obligatorio en las de la web; las manuales no lo traen. */
    customerEmail: string | null;
    desiredDate: string;
    note: string | null;
    selection: ICakeSelection | IDessertSelection | IRecipeSelection;
    total: number;
    /** Web: la mandó el cliente desde /cotizador. Manual: la registró la pastelera. */
    source: "web" | "manual";
    createdBy: string | null;
    /** La pastelera dueña. Null: llegó de la web y está en la bandeja común hasta que alguien la confirme. */
    ownerId: number | null;
    statusChangedBy: string | null;
    /** Lo que la pastelera le escribió al cliente al confirmarla o cancelarla. */
    statusNote: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface IQuoteDetail extends IQuote {
    cakeImage: string | null;
    topperImage: string | null;
}

const getCustomerBody = (draft: IQuoteDraft) => ({
    customerName: draft.customerName.trim(),
    customerPhone: getPhoneDigits(draft.customerPhone),
    customerEmail: draft.customerEmail.trim().toLowerCase(),
    desiredDate: draft.desiredDate,
    note: draft.note.trim() || null,
    privacyConsent: draft.privacyConsent,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
});

/**
 * Manda la receta, el tamaño y las opciones elegidas con el total que vio el cliente: si el
 * precio cambió mientras armaba, el API responde 409 y la web recarga el catálogo.
 */
export const submitQuote = (draft: IQuoteDraft, product: ICatalogProduct, expectedTotal: number) =>
    httpPost<{ quote: IQuote }>("/quotes", {
        kind: "receta",
        productId: draft.productId,
        sizeId: draft.sizeId,
        optionIds: draft.optionIds,
        quantity: draft.quantity,
        topper: product.allowsTopper && draft.topper,
        expectedTotal,
        ...getCustomerBody(draft),
        cakeImage: product.needsPhoto ? draft.cakeImage : null,
        topperImage: product.allowsTopper && draft.topper ? draft.topperImage : null,
    });

/** Solo la pastelera las ve, desde /gestion con su PIN. */
const getQuoteHeaders = (token: string) => ({ "x-gestion-token": token });

export const fetchQuotes = (token: string, status: QuoteStatus, signal?: AbortSignal) =>
    httpGet<{ quotes: IQuote[]; counts: Record<QuoteStatus, number> }>(`/gestion/quotes?status=${status}`, {
        signal,
        headers: getQuoteHeaders(token),
    });

export const fetchQuote = (token: string, id: number, signal?: AbortSignal) =>
    httpGet<{ quote: IQuoteDetail }>(`/gestion/quotes/${id}`, { signal, headers: getQuoteHeaders(token) });

/**
 * Al confirmarla o cancelarla al cliente le llega un correo con la nota, si hay.
 * `emailSent`: null si ese cambio no manda correo; false si no salió.
 */
export const changeQuoteStatus = (token: string, id: number, status: QuoteStatus, note?: string) =>
    httpPost<{ quote: IQuoteDetail; emailSent: boolean | null }>(
        `/gestion/quotes/${id}/status`,
        { status, note: note?.trim() || null },
        { headers: getQuoteHeaders(token) }
    );

/** Lo que la pastelera anota a mano: una receta del catálogo con sus opciones, sin fotos ni topper. */
export interface IManualQuoteDraft {
    productId: number | null;
    sizeId: number | null;
    optionIds: number[];
    customerName: string;
    customerPhone: string;
    desiredDate: string;
    note: string;
    status: "nueva" | "confirmada";
    quantity: number;
}

/** Lo que falta para guardar un registro manual. Vacío es listo. */
export const getManualQuoteMissing = (draft: IManualQuoteDraft, product: ICatalogProduct | undefined) => {
    const missing: string[] = [];
    if (!product || draft.sizeId === null) missing.push("Elige el postre y el tamaño");
    else missing.push(...getCatalogGroupsMissing(product, draft.sizeId, draft.optionIds));
    if (draft.customerName.trim().length < 2) missing.push("Escribe el nombre del cliente");
    const phone = getPhoneDigits(draft.customerPhone);
    if (phone && !/^6\d{7}$/.test(phone)) missing.push("El celular tiene 8 dígitos y empieza en 6 (o déjalo vacío)");
    if (!draft.desiredDate) missing.push("Elige la fecha de entrega");
    return missing;
};

/** El precio lo pone el API: aquí solo se manda lo elegido. */
export const createManualQuote = (token: string, draft: IManualQuoteDraft) =>
    httpPost<{ quote: IQuote }>(
        "/gestion/quotes",
        {
            kind: "receta",
            productId: draft.productId,
            sizeId: draft.sizeId,
            optionIds: draft.optionIds,
            quantity: draft.quantity,
            topper: false,
            customerName: draft.customerName.trim(),
            customerPhone: getPhoneDigits(draft.customerPhone) || null,
            desiredDate: draft.desiredDate,
            note: draft.note.trim() || null,
            status: draft.status,
        },
        { headers: getQuoteHeaders(token) }
    );

/* ============ Ingresos de la pastelera ============ */

export interface IQuoteIncomeTotals {
    count: number;
    gross: number;
    cost: number;
    net: number;
}

export interface IQuoteSummary {
    range: { from: string; to: string };
    /** Entregadas en el rango, por fecha de entrega. */
    delivered: IQuoteIncomeTotals;
    /** Lo mismo en el período anterior del mismo largo. */
    previous: IQuoteIncomeTotals;
    /** Confirmadas que se entregan en el rango: lo que falta cobrar. */
    pending: { count: number; gross: number };
    series: { from: string; to: string; gross: number; net: number }[];
    byProduct: (IQuoteIncomeTotals & { label: string })[];
    bySource: Record<"web" | "manual", { count: number; gross: number }>;
}

export const fetchQuoteSummary = (token: string, from: string, to: string, signal?: AbortSignal) =>
    httpGet<IQuoteSummary>(`/gestion/quotes/summary?from=${from}&to=${to}`, { signal, headers: getQuoteHeaders(token) });

export type QuoteIncomePeriod = "mes" | "mes-anterior" | "30d";

export const QUOTE_INCOME_PERIODS: { id: QuoteIncomePeriod; label: string }[] = [
    { id: "mes", label: "Este mes" },
    { id: "mes-anterior", label: "Mes pasado" },
    { id: "30d", label: "Últimos 30 días" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const addQuoteDays = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Primer y último día (incluidos). "Este mes" va hasta fin de mes y no hasta hoy: se cuenta por
 * fecha de entrega, y lo confirmado para los próximos días es lo que falta cobrar.
 */
export const getQuoteIncomeRange = (period: QuoteIncomePeriod, today = getPanamaTodayText()) => {
    const monthStart = `${today.slice(0, 7)}-01`;
    switch (period) {
        case "mes": {
            const nextMonth = addQuoteDays(monthStart, 32).slice(0, 7);
            return { from: monthStart, to: addQuoteDays(`${nextMonth}-01`, -1) };
        }
        case "mes-anterior": {
            const lastDay = addQuoteDays(monthStart, -1);
            return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
        }
        case "30d":
            return { from: addQuoteDays(today, -29), to: today };
    }
};

/* ============ Calendario (iOS) ============ */

/** Hoy en Panamá como AAAA-MM-DD. */
export const getPanamaTodayText = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Texto de iCalendar: comas, puntos y comas, barras y saltos van escapados. */
const escapeIcsText = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Las líneas largas se doblan: la siguiente empieza con un espacio. */
const foldIcsLine = (line: string) => {
    const parts: string[] = [];
    for (let index = 0; index < line.length; index += 60) parts.push(line.slice(index, index + 60));
    return parts.join("\r\n ");
};

const getQuoteDetailLines = (quote: IQuote) => {
    const { selection } = quote;
    if (isDessertSelection(selection)) return [];
    if (isRecipeSelection(selection)) return selection.options.map((one) => `${one.group}: ${one.name}`);
    return [`Masa: ${selection.dough.name}`, `Relleno: ${selection.fillings.map((one) => one.name).join(" + ")}`];
};

/**
 * Evento de todo el día en la fecha de entrega, con aviso el día anterior a las 9:00.
 * El UID es el de la cotización: si se agrega otra vez, algunos calendarios lo reconocen.
 */
export const getQuoteIcs = (quote: IQuote, now = new Date()) => {
    const day = quote.desiredDate.replace(/-/g, "");
    const nextDay = addQuoteDays(quote.desiredDate, 1).replace(/-/g, "");
    const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const title = `Entrega ${quote.code} · ${getQuoteSizeLabel(quote.selection)}`;
    const description = [
        `${quote.customerName}${quote.customerPhone ? ` · ${formatPhone(quote.customerPhone)}` : ""}`,
        ...getQuoteDetailLines(quote),
        `Total: ${formatPrice(quote.total)}`,
        ...(quote.note ? [`Nota: ${quote.note}`] : []),
    ].join("\n");

    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Chunky Bites//Cotizaciones//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${quote.code.toLowerCase()}@chunkybites`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${day}`,
        `DTEND;VALUE=DATE:${nextDay}`,
        `SUMMARY:${escapeIcsText(title)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        "BEGIN:VALARM",
        // El evento empieza a medianoche: 15 horas antes son las 9:00 del día anterior
        "TRIGGER:-PT15H",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcsText(`Mañana se entrega ${quote.code}`)}`,
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
        .map(foldIcsLine)
        .join("\r\n");
};

/** Descarga el .ics: en el iPhone, Safari lo abre con "Agregar a Calendario". */
export const downloadQuoteIcs = (quote: IQuote) => {
    const url = URL.createObjectURL(new Blob([getQuoteIcs(quote)], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${quote.code}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Safari necesita el enlace vivo un momento después del clic
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};

/** "2026-10-03" -> "sáb 3 oct". La fecha es un día, no un instante: se arma sin zona horaria. */
export const formatQuoteDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });
};

/** Cuántas iguales lleva: solo las recetas pueden ser varias. */
export const getQuoteQuantity = (selection: IQuote["selection"]) => (isRecipeSelection(selection) ? selection.quantity ?? 1 : 1);

export const getQuoteSizeLabel = (selection: IQuote["selection"]) => {
    if (isRecipeSelection(selection)) {
        const quantity = getQuoteQuantity(selection);
        return `${quantity > 1 ? `${quantity} × ` : ""}${selection.product.name} ${selection.size.label}`;
    }
    return isDessertSelection(selection)
        ? `${selection.dessert.name} ${selection.size}"`
        : `Cake ${selection.size}" · ${selection.height === 2 ? "doble altura" : "1 altura"}`;
};

/** Las líneas del detalle de una cotización después de la base: masa, rellenos y opciones (cada una con su precio) y topper. */
export const getQuoteSpecLines = (selection: IQuote["selection"]) => {
    if (isDessertSelection(selection)) return [];
    const lines = isRecipeSelection(selection)
        ? selection.options.map((one) => ({ label: one.group, name: one.name, price: one.price }))
        : [
              { label: "Masa", name: selection.dough.name, price: selection.dough.price },
              ...selection.fillings.map((line, index) => ({ label: `Relleno ${index + 1}`, name: line.name, price: line.price })),
          ];
    return selection.topper ? [...lines, { label: "Topper", name: "", price: selection.topperPrice }] : lines;
};
