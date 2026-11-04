import type { ManualFundMovementType } from "@/helpers";

export const parseAmount = (value: string) => {
    if (value.trim() === "") return NaN;
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : NaN;
};

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const CASH_DIALOG = {
    entrada: {
        title: "Entra efectivo",
        note: "Dinero que entra al cajón y no es una venta, por ejemplo cambio del banco.",
        reasonPlaceholder: "Cambio del banco",
    },
    salida: {
        title: "Sale efectivo",
        note: "Dinero que sale del cajón, por ejemplo una compra o las propinas repartidas.",
        reasonPlaceholder: "Compra de hielo",
    },
} as const;

export const FUND_DIALOG: Record<ManualFundMovementType, { title: string; note: string; amountLabel: string; reasonPlaceholder: string }> = {
    entrada: {
        title: "Entra al fondo",
        note: "Efectivo que se suma al fondo aparte y no viene de un cierre, por ejemplo cambio en monedas.",
        amountLabel: "Monto",
        reasonPlaceholder: "Cambio en monedas",
    },
    salida: {
        title: "Sale del fondo",
        note: "Efectivo que sale del fondo aparte, por ejemplo un depósito al banco o un pago a un proveedor.",
        amountLabel: "Monto",
        reasonPlaceholder: "Depósito al banco",
    },
    ajuste: {
        title: "Ajustar el fondo",
        note: "Escribe cuánto hay de verdad en el fondo aparte. Se guarda la diferencia con el saldo y el motivo.",
        amountLabel: "Hay de verdad",
        reasonPlaceholder: "Recuento del sobre",
    },
};
