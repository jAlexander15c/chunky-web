import { httpGet, httpPost } from "./getHttp";
import { getPhoneDigits } from "./payment";

/**
 * Cotizador de cakes. Estos precios son una copia de los de chunky-api
 * (src/modules/quotes/quote.catalog.ts) solo para mostrar el total mientras el cliente elige:
 * el total que se guarda lo recalcula el API. Si cambian, se cambian en los dos lados.
 *
 * La hoja de costos da tres precios; los otros tres salen proporcionales:
 * - La doble altura sube lo mismo por pulgada que de 6" a 7".
 * - Una altura cuesta lo mismo, en proporción, que el 4.5" contra su doble altura.
 */
export type QuoteSize = "4.5" | "6" | "7";
export type QuoteHeight = 1 | 2;

const KNOWN_4_5_SINGLE = 23.44;
const KNOWN_6_DOUBLE = 50.03;
const KNOWN_7_DOUBLE = 57.92;

const getCents = (value: number) => Math.round(value * 100) / 100;

const DOUBLE_PER_INCH = KNOWN_7_DOUBLE - KNOWN_6_DOUBLE;
const DOUBLE_4_5 = KNOWN_6_DOUBLE - 1.5 * DOUBLE_PER_INCH;
const SINGLE_TO_DOUBLE = KNOWN_4_5_SINGLE / DOUBLE_4_5;

const QUOTE_BASE_PRICES: Record<QuoteSize, Record<QuoteHeight, number>> = {
    "4.5": { 1: KNOWN_4_5_SINGLE, 2: getCents(DOUBLE_4_5) },
    "6": { 1: getCents(KNOWN_6_DOUBLE * SINGLE_TO_DOUBLE), 2: KNOWN_6_DOUBLE },
    "7": { 1: getCents(KNOWN_7_DOUBLE * SINGLE_TO_DOUBLE), 2: KNOWN_7_DOUBLE },
};

/** Los recargos de masa y relleno están dados para el 6" doble altura. */
const SURCHARGE_REFERENCE_PRICE = KNOWN_6_DOUBLE;

export const QUOTE_SIZES: QuoteSize[] = ["4.5", "6", "7"];
export const QUOTE_HEIGHTS: { value: QuoteHeight; label: string }[] = [
    { value: 1, label: "1 altura" },
    { value: 2, label: "Doble altura" },
];

export const TOPPER_PRICE = 10;
export const MAX_FILLINGS = 2;

export interface IQuoteOption {
    id: string;
    name: string;
    /** Recargo en el 6" doble altura. Cero es incluido. */
    extra: number;
}

export const QUOTE_DOUGHS: IQuoteOption[] = [
    { id: "vainilla-caramelo", name: "Vainilla caramelo", extra: 0 },
    { id: "zanahoria", name: "Zanahoria", extra: 6 },
    { id: "banana-nueces", name: "Banana y nueces", extra: 6 },
    { id: "especias-nueces", name: "Especias y nueces", extra: 5 },
    { id: "chocolate-humeda", name: "Chocolate húmeda", extra: 5 },
    { id: "cafe", name: "Cake de café", extra: 5 },
    { id: "naranja", name: "Naranja", extra: 5 },
];

export const QUOTE_FILLINGS: IQuoteOption[] = [
    { id: "dulce-de-leche", name: "Dulce de leche", extra: 0 },
    { id: "fresas", name: "Fresas", extra: 0 },
    { id: "moras", name: "Moras", extra: 0 },
    { id: "crema-pastelera", name: "Crema pastelera", extra: 0 },
    { id: "ganache-oscuro", name: "Ganache de chocolate oscuro", extra: 5 },
    { id: "frosty-queso-crema", name: "Frosty de queso crema", extra: 5 },
    { id: "compota-frutos-rojos", name: "Compota de frutos rojos", extra: 5 },
    { id: "crema-bariloche", name: "Crema bariloche", extra: 5 },
    { id: "caramelo-salado", name: "Caramelo salado", extra: 5 },
    { id: "crema-avellanas", name: "Crema de avellanas", extra: 5 },
    { id: "crema-oreo", name: "Crema de oreo", extra: 5 },
];

export const getQuoteBasePrice = (size: QuoteSize, height: QuoteHeight) => QUOTE_BASE_PRICES[size][height];

/** El recargo crece o se achica con el precio base del cake elegido. */
export const getQuoteSurcharge = (extra: number, size: QuoteSize, height: QuoteHeight) =>
    getCents((extra * getQuoteBasePrice(size, height)) / SURCHARGE_REFERENCE_PRICE);

const getFilling = (id: string) => QUOTE_FILLINGS.find((one) => one.id === id);

export const isIncludedFilling = (id: string) => getFilling(id)?.extra === 0;

/**
 * Si un relleno se puede sumar a lo elegido. Uno o dos, y nunca dos incluidos:
 * con uno incluido ya elegido, el segundo tiene que ser especial.
 */
export const canAddFilling = (chosen: string[], id: string) => {
    if (chosen.includes(id)) return true;
    if (chosen.length >= MAX_FILLINGS) return false;
    return !(isIncludedFilling(id) && chosen.some(isIncludedFilling));
};

/** "1 incluido", "Incluido + especial"… para el contador del paso de rellenos. */
export const getFillingsLabel = (chosen: string[]) => {
    const included = chosen.filter(isIncludedFilling).length;
    const special = chosen.length - included;
    if (!chosen.length) return "Elige 1 o 2";
    if (included && special) return "Incluido + especial";
    if (included) return "1 incluido";
    return special === 1 ? "1 especial" : "2 especiales";
};

export interface IQuoteDraft {
    size: QuoteSize;
    height: QuoteHeight;
    doughId: string;
    fillingIds: string[];
    topper: boolean;
    customerName: string;
    customerPhone: string;
    desiredDate: string;
    note: string;
    cakeImage: string | null;
    topperImage: string | null;
}

export interface IQuoteBreakdownLine {
    label: string;
    name: string;
    price: number;
}

/** El desglose que ve el cliente y la suma. */
export const getQuoteBreakdown = (draft: Pick<IQuoteDraft, "size" | "height" | "doughId" | "fillingIds" | "topper">) => {
    const dough = QUOTE_DOUGHS.find((one) => one.id === draft.doughId) ?? QUOTE_DOUGHS[0];
    const base = getQuoteBasePrice(draft.size, draft.height);
    const lines: IQuoteBreakdownLine[] = [
        { label: "Masa", name: dough.name, price: getQuoteSurcharge(dough.extra, draft.size, draft.height) },
        ...draft.fillingIds.map((id, index) => {
            const filling = getFilling(id);
            return {
                label: `Relleno ${index + 1}`,
                name: filling?.name ?? id,
                price: getQuoteSurcharge(filling?.extra ?? 0, draft.size, draft.height),
            };
        }),
        ...(draft.topper ? [{ label: "Topper", name: "Con topper", price: TOPPER_PRICE }] : []),
    ];
    const total = getCents(base + lines.reduce((sum, line) => sum + line.price, 0));
    return { base, lines, total };
};

/** Hoy en Panamá como AAAA-MM-DD, para el mínimo del campo de fecha. */
export const getTodayInPanama = () =>
    new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Lo que falta para poder enviar, en palabras del cliente. Vacío es listo. */
export const getQuoteMissing = (draft: IQuoteDraft) => {
    const missing: string[] = [];
    if (!draft.fillingIds.length) missing.push("Elige al menos un relleno");
    if (!draft.cakeImage) missing.push("Sube la foto de referencia del cake");
    if (draft.topper && !draft.topperImage) missing.push("Sube la foto de referencia del topper");
    if (draft.customerName.trim().length < 2) missing.push("Escribe tu nombre");
    if (!/^6\d{7}$/.test(getPhoneDigits(draft.customerPhone))) missing.push("Escribe tu WhatsApp (8 dígitos, empieza en 6)");
    if (!draft.desiredDate) missing.push("Elige la fecha deseada");
    else if (draft.desiredDate < getTodayInPanama()) missing.push("La fecha deseada ya pasó");
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

export interface IQuoteLine {
    id: string;
    name: string;
    price: number;
}

export interface IQuote {
    id: number;
    code: string;
    status: QuoteStatus;
    customerName: string;
    customerPhone: string;
    desiredDate: string;
    note: string | null;
    selection: {
        size: QuoteSize;
        height: QuoteHeight;
        basePrice: number;
        dough: IQuoteLine;
        fillings: IQuoteLine[];
        topper: boolean;
        topperPrice: number;
    };
    total: number;
    statusChangedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface IQuoteDetail extends IQuote {
    cakeImage: string;
    topperImage: string | null;
}

export const submitQuote = (draft: IQuoteDraft) =>
    httpPost<{ quote: IQuote }>("/quotes", {
        size: draft.size,
        height: draft.height,
        doughId: draft.doughId,
        fillingIds: draft.fillingIds,
        topper: draft.topper,
        customerName: draft.customerName.trim(),
        customerPhone: getPhoneDigits(draft.customerPhone),
        desiredDate: draft.desiredDate,
        note: draft.note.trim() || null,
        cakeImage: draft.cakeImage,
        topperImage: draft.topper ? draft.topperImage : null,
    });

/**
 * Quién mira las cotizaciones: el dueño desde /admin o la pastelera desde /gestion.
 * Las rutas son iguales; cambian el prefijo y el header de la sesión.
 */
export type QuoteArea = "admin" | "gestion";

const getQuoteHeaders = (area: QuoteArea, token: string): Record<string, string> =>
    area === "admin" ? { "x-admin-token": token } : { "x-gestion-token": token };

export const fetchQuotes = (area: QuoteArea, token: string, status: QuoteStatus, signal?: AbortSignal) =>
    httpGet<{ quotes: IQuote[]; counts: Record<QuoteStatus, number> }>(`/${area}/quotes?status=${status}`, {
        signal,
        headers: getQuoteHeaders(area, token),
    });

export const fetchQuote = (area: QuoteArea, token: string, id: number, signal?: AbortSignal) =>
    httpGet<{ quote: IQuoteDetail }>(`/${area}/quotes/${id}`, { signal, headers: getQuoteHeaders(area, token) });

export const changeQuoteStatus = (area: QuoteArea, token: string, id: number, status: QuoteStatus) =>
    httpPost<{ quote: IQuoteDetail }>(`/${area}/quotes/${id}/status`, { status }, { headers: getQuoteHeaders(area, token) });

/** "2026-10-03" -> "sáb 3 oct". La fecha es un día, no un instante: se arma sin zona horaria. */
export const formatQuoteDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });
};

export const getQuoteSizeLabel = (selection: Pick<IQuote["selection"], "size" | "height">) =>
    `Cake ${selection.size}" · ${selection.height === 2 ? "doble altura" : "1 altura"}`;
