import { httpPost } from "./getHttp";
import type { ISupplyStatus } from "./admin";

/** Cómo viene el insumo (cartón, bolsa…) y cuánto trae, en su unidad de consumo. */
export interface IPresentation {
    name: string;
    plural: string;
    size: number;
}

const FACTORS: Record<string, number> = { kg: 1000, g: 1, l: 1000, L: 1000, ml: 1 };
const FAMILY: Record<string, string> = { kg: "masa", g: "masa", l: "volumen", L: "volumen", ml: "volumen" };

/** "cartón" → "cartones", "bolsa" → "bolsas", "paquete" → "paquetes". */
export const getPlural = (word: string) => {
    const lower = word.trim();
    if (/[aeiouáéíóú]$/i.test(lower)) return lower + "s";
    if (/ón$/i.test(lower)) return lower.replace(/ón$/i, "ones");
    if (/z$/i.test(lower)) return lower.replace(/z$/i, "ces");
    return lower + "es";
};

/**
 * La presentación con la que se cuenta, si tiene. Solo sirve cuando su contenido se puede llevar a la
 * unidad de consumo (ml ↔ l, g ↔ kg); una caja de 12 "u" se cuenta en "u".
 */
export const getPresentation = (supply: Pick<ISupplyStatus, "unit" | "purchaseUnit" | "purchaseSize" | "contentUnit">) => {
    if (!supply.purchaseUnit || !supply.purchaseSize || supply.purchaseSize <= 0) return null;
    const content = supply.contentUnit ?? supply.unit;
    let size = supply.purchaseSize;
    if (content !== supply.unit) {
        if (!FAMILY[content] || FAMILY[content] !== FAMILY[supply.unit]) return null;
        size = (supply.purchaseSize * FACTORS[content]) / FACTORS[supply.unit];
    }
    // Contar "1 u = 1 u" no ayuda en nada
    if (size === 1 && content === supply.unit && ["u", "unit"].includes(supply.unit)) return null;
    return { name: supply.purchaseUnit, plural: getPlural(supply.purchaseUnit), size } satisfies IPresentation;
};

/** Seis decimales como el API, sin errores de coma flotante (0.1 + 0.2). */
export const roundQuantity = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/** Presentaciones enteras más lo suelto, en la unidad de consumo. */
export const splitInPresentation = (stock: number, presentation: IPresentation) => {
    const whole = Math.floor(roundQuantity(stock / presentation.size));
    return { whole, loose: roundQuantity(stock - whole * presentation.size) };
};

/** "3 cartones y 400 ml", "1 cartón", "400 ml". */
export const formatInPresentation = (stock: number, presentation: IPresentation, unit: string) => {
    if (stock <= 0) return `0 ${unit}`;
    const { whole, loose } = splitInPresentation(stock, presentation);
    const parts = [
        ...(whole > 0 ? [`${whole} ${whole === 1 ? presentation.name : presentation.plural}`] : []),
        ...(loose > 0 ? [`${loose.toLocaleString("es-PA", { maximumFractionDigits: 3 })} ${unit}`] : []),
    ];
    return parts.join(" y ");
};

/** De "u" a ml o g: lo usan las recetas, y la unidad vieja queda como presentación para contar. */
export const changeSupplyUnit = (token: string, supplyId: number, input: { unit: string; perUnit: string; presentation: string }) =>
    httpPost<{ unit: string; perUnit: string; presentation: string }>(`/admin/supplies/${supplyId}/unit`, input, {
        headers: { "x-admin-token": token },
    });

/** Unidades que no se convierten solas: con ellas una receta no puede pedir ml ni g. */
export const isCountUnit = (unit: string) => !Object.hasOwn(FACTORS, unit);
