import { describe, expect, test } from "vitest";

import { getChangeToCarry, getDeliveryStage } from "./delivery-orders";
import { getDeliveryReach, getDistanceMeters } from "./settings";
import type { IDeliveryOrder } from "./delivery-orders";
import { buildWhatsappOrderMessage, getCashSuggestions, getFailedOrderReason, parseMoney } from "./payment";
import type { ICartLine } from "./order";
import type { IItem } from "@/interfaces";

const line: ICartLine = {
    lineKey: "galleta",
    item: {
        id: "item-1",
        item_name: "Cookie Mora",
        variants: [{ variant_id: "v-1", default_price: 3.5, stores: [{ store_id: "s-1", price: 3.5, available_for_sale: true }] }],
    } as unknown as IItem,
    quantity: 2,
};

const order = (fields: Partial<IDeliveryOrder>): IDeliveryOrder =>
    ({
        id: "CB1",
        status: "CONFIRMED",
        delivery: null,
        readyAt: null,
        outAt: null,
        ...fields,
    }) as IDeliveryOrder;

const DELIVERY = { address: "Villa Real 14", details: null, lat: 8.2, lng: -80.5, mapUrl: "" };

describe("pedido por WhatsApp", () => {
    test("el mensaje lleva el código, lo pedido, la entrega y el enlace", () => {
        const message = buildWhatsappOrderMessage(
            [line],
            { customerName: "Ana", note: "sin nueces", deliveryAddress: "Villa Real 14", deliveryDetails: "", deliveryLat: null, deliveryLng: null },
            "CB7K2M9Q4X",
            "https://www.ischunkybites.com/pedido/CB7K2M9Q4X"
        );
        expect(message).toBe(
            "¡Hola! Soy Ana. Quiero coordinar mi pedido CB7K2M9Q4X:\n\n- Cookie Mora x2\n\nTotal: $7.00\n\nEntrega en: Villa Real 14\n\nNota: sin nueces\n\nVer pedido: https://www.ischunkybites.com/pedido/CB7K2M9Q4X"
        );
    });

    test("sin dirección avisa que pasa a retirarlo", () => {
        const message = buildWhatsappOrderMessage([line], { customerName: "Ana", note: "" }, "CB1", "https://x/pedido/CB1");
        expect(message).toContain("Paso a retirarlo.");
    });

    test("el motivo de un pedido cancelado habla de WhatsApp, no de Yappy", () => {
        expect(getFailedOrderReason("EXPIRED", "whatsapp")).toMatch(/WhatsApp/);
        expect(getFailedOrderReason("CANCELLED", "yappy")).toMatch(/Yappy/);
    });
});

describe("pestaña Delivery", () => {
    test("agrupa por lo que falta hacer", () => {
        expect(getDeliveryStage(order({ status: "PENDING_CONFIRMATION" }))).toBe("por-confirmar");
        expect(getDeliveryStage(order({}))).toBe("en-cocina");
        expect(getDeliveryStage(order({ readyAt: "x", delivery: DELIVERY }))).toBe("listo-salir");
        expect(getDeliveryStage(order({ readyAt: "x" }))).toBe("listo-retirar");
        expect(getDeliveryStage(order({ readyAt: "x", outAt: "y", delivery: DELIVERY }))).toBe("en-camino");
    });

    test("distancia en metros entre dos puntos", () => {
        // Una milésima de grado de latitud son ~111 m
        expect(Math.round(getDistanceMeters({ lat: 8.247, lng: -80.55 }, { lat: 8.248, lng: -80.55 }))).toBe(111);
        expect(getDistanceMeters({ lat: 8.2, lng: -80.5 }, { lat: 8.2, lng: -80.5 })).toBe(0);
    });
});

describe("vuelto y distancia", () => {
    test("lee montos escritos de distintas formas", () => {
        expect(parseMoney("20")).toBe(20);
        expect(parseMoney("$20,50")).toBe(20.5);
        expect(parseMoney("veinte")).toBeNull();
        expect(parseMoney("")).toBeNull();
    });

    test("montos rápidos: el total justo y los billetes que alcanzan", () => {
        expect(getCashSuggestions(7)).toEqual([7, 10, 20, 50]);
        expect(getCashSuggestions(23.5)).toEqual([23.5, 50, 100]);
    });

    test("el vuelto a llevar sale de lo que dijo el cliente", () => {
        expect(getChangeToCarry({ cashTendered: 20, total: 7 })).toBe(13);
        expect(getChangeToCarry({ cashTendered: 7, total: 7 })).toBe(0);
        expect(getChangeToCarry({ cashTendered: null, total: 7 })).toBe(0);
    });

    test("distancia desde el local: normal, lejos y fuera de alcance", () => {
        const store = { location: { lat: 8.246417, lng: -80.538833 }, deliveryMaxKm: 20, deliveryFarKm: 15 };
        expect(getDeliveryReach(store, { lat: 8.2471, lng: -80.5496 })).toEqual({ km: 1.2, reach: "ok" });
        expect(getDeliveryReach(store, { lat: 8.4, lng: -80.54 })?.reach).toBe("far");
        expect(getDeliveryReach(store, { lat: 8.5186, lng: -80.3574 })?.reach).toBe("out");
        expect(getDeliveryReach(null, { lat: 8.2, lng: -80.5 })).toBeNull();
    });

    test("el mensaje de WhatsApp dice con cuánto paga", () => {
        const message = buildWhatsappOrderMessage([line], { customerName: "Ana", note: "" }, "CB1", "https://x/pedido/CB1", 20);
        expect(message).toContain("Total: $7.00\nPago en efectivo con $20.00");
    });
});

describe("pedido para otra persona", () => {
    test("el mensaje no manda la ubicación de quien pide y avisa que es para otra persona", () => {
        const message = buildWhatsappOrderMessage(
            [line],
            { customerName: "Ana", note: "", deliveryAddress: "Villa Real 14", deliveryLat: 8.9, deliveryLng: -79.5, isForSomeoneElse: true },
            "CB1",
            "https://x/pedido/CB1"
        );
        expect(message).toContain("Entrega en: Villa Real 14\nEs para otra persona: te paso su ubicación por aquí.");
        expect(message).not.toContain("8.9");
    });
});
