import type { CakeQuoteStep, QuoteFunnelStep, QuoteReportKind, WebFunnelStep } from "@/helpers";

export const FUNNEL_LABEL: Record<WebFunnelStep, string> = {
    visit: "Visitaron",
    category_open: "Abrieron una categoría",
    add_to_cart: "Agregaron al carrito",
    cart_open: "Abrieron el carrito",
    checkout_start: "Empezaron el checkout",
    pay_click: "Tocaron pagar",
    paid: "Pagaron",
};

export const QUOTE_KIND_OPTIONS: { id: QuoteReportKind; label: string }[] = [
    { id: "all", label: "Todo" },
    { id: "cake", label: "Cakes" },
    { id: "postre", label: "Flan y cheesecake" },
];

export const QUOTE_STEP_LABEL: Record<QuoteFunnelStep, string> = {
    visit: "Entró al cotizador",
    start: "Empezó a armar",
    photo: "Subió fotos",
    contact: "Escribió sus datos",
    submit: "Envió",
    whatsapp: "Abrió WhatsApp",
};

export const CAKE_STEP_LABEL: Record<CakeQuoteStep, string> = {
    tamano: "Tamaño y altura",
    masa: "Masa",
    rellenos: "Rellenos",
    fotos: "Fotos y topper",
    datos: "Tus datos",
};

/** Aclaración bajo el nombre del paso, según lo que se está viendo. */
export const getQuoteStepHint = (step: QuoteFunnelStep, kind: QuoteReportKind) => {
    if (step === "whatsapp") return "después de enviar";
    if (step === "photo") return kind === "postre" ? "no aplica" : kind === "all" ? "solo cakes" : "";
    if (kind === "all") return "";
    if (step === "visit") return "todavía sin elegir";
    if (step === "start") return kind === "cake" ? "eligió un cake" : "eligió un postre";
    return "";
};

export const PAGE_LABEL: Record<string, string> = {
    "/": "Inicio",
    "/menu": "Menú",
    "/items": "Productos",
    "/cotizador": "Cotizador",
    "/privacidad": "Aviso de privacidad",
    "/pedido": "Estado del pedido",
};

/** Por debajo de esto un % de producto no dice nada: una apertura y un agregado dan 100 %. */
export const MIN_OPENS_FOR_RATE = 5;
/** Con menos visitas la conversión de un origen no dice nada. */
export const MIN_SESSIONS_FOR_RATE = 10;
/** Desde aquí la conversión de un origen sale en verde. */
export const GOOD_SOURCE_CONVERSION = 0.05;

/** Nombres de los orígenes que la web reconoce; el resto se muestra con su dominio. */
export const SOURCE_LABEL: Record<string, string> = {
    instagram: "Instagram",
    facebook: "Facebook",
    whatsapp: "WhatsApp",
    google: "Google",
    pedidosya: "PedidosYa",
    tiktok: "TikTok",
    directo: "Directo",
};

export const formatCount = (value: number) => value.toLocaleString("es-PA");

export const formatPercent = (ratio: number) =>
    `${(ratio * 100).toLocaleString("es-PA", { maximumFractionDigits: 1 })} %`;
