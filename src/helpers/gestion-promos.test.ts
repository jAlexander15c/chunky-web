import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getTicketLineSubtotal, getTicketLineTotal } from "./gestion";
import type { ITicket, ITicketLine } from "./gestion";
import { TicketLinePricing, TicketTotals } from "../views/gestion/ticket-pricing";

const getLine = (changes: Partial<ITicketLine> = {}): ITicketLine => ({
    id: 1, variantId: "cookie", name: "Galleta", quantity: 2, unitPrice: 4,
    modifiers: [{ modifierOptionId: "extra", name: "Extra", option: "Chocolate", price: 0.5 }],
    note: null, sentAt: null, addedByName: "Caja", discount: 0, freeQuantity: 0,
    promoName: null, promoLabel: null, ...changes,
});

const getTicket = (lines: ITicketLine[], changes: Partial<ITicket> = {}): ITicket => ({
    id: 1, tableNumber: 1, customerName: null, status: "abierta", openedByName: "Caja",
    openedAt: "2026-10-13T12:00:00Z", subtotal: 9, discount: 4.5, total: 4.5,
    payments: null, paidAmount: 0, loyverseReceiptNumber: null, receiptPending: false,
    lines, tableAccounts: [], inKitchen: 0, creditAt: null, creditByName: null, ...changes,
});

describe("precios de Caja del API", () => {
    it("resta el descuento recibido sobre base y modificadores originales", () => {
        const line = getLine({ discount: 1.8, promoLabel: "-20%", promoName: "Tarde" });
        expect(getTicketLineSubtotal(line)).toBe(9);
        expect(getTicketLineTotal(line)).toBe(7.2);
        const html = renderToStaticMarkup(createElement(TicketLinePricing, { line }));
        expect(html).toContain("-20% \u00b7 Tarde");
        expect(html).toContain("<del>$9.00</del>");
        expect(html).toContain("$7.20");
    });

    it("separa la unidad gratis y conserva sus modificadores en el original", () => {
        const line = getLine({ discount: 4.5, freeQuantity: 1, promoLabel: "2x1", promoName: "Doble" });
        const html = renderToStaticMarkup(createElement(TicketLinePricing, { line }));
        expect(getTicketLineTotal(line)).toBe(4.5);
        expect(html.match(/1 \u00d7 Galleta/g)).toHaveLength(2);
        expect(html).toContain("Gratis \u00b7 2x1");
        expect(html).toContain("<del>$4.50</del>$0.00");
    });

    it("muestra una linea completamente gratis sin otra fila de cero unidades", () => {
        const html = renderToStaticMarkup(createElement(TicketLinePricing, {
            line: getLine({ quantity: 1, discount: 4.5, freeQuantity: 1, promoLabel: "2x1", promoName: "Doble" }),
        }));
        expect(html).not.toContain("0 \u00d7");
        expect(html.match(/1 \u00d7 Galleta/g)).toHaveLength(1);
    });

    it("respeta total del servidor aunque las lineas no permitan reconstruirlo", () => {
        const line = getLine({ discount: 4.5, promoName: "Doble", promoLabel: "2x1", freeQuantity: 1 });
        const html = renderToStaticMarkup(createElement(TicketTotals, { ticket: getTicket([line], { total: 3.75 }) }));
        expect(html).toContain("Productos");
        expect(html).toContain("Promo Doble");
        expect(html).toContain("<b>$3.75</b>");
    });

    it("agrupa varias promos por nombre sin duplicarlas por linea", () => {
        const lines = [getLine({ discount: 1, promoName: "Doble" }), getLine({ discount: 1, promoName: "Tarde" })];
        expect(renderToStaticMarkup(createElement(TicketTotals, { ticket: getTicket(lines) }))).toContain(">Promos</span>");
    });
});
