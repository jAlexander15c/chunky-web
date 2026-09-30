import { describe, expect, test } from "vitest";

import { getDeliveryStage, getDistanceMeters } from "./delivery-orders";
import type { IDeliveryOrder } from "./delivery-orders";
import { buildWhatsappOrderMessage, getFailedOrderReason } from "./payment";
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
