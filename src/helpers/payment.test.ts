import { beforeEach, describe, expect, test, vi } from "vitest";

import { clearCheckoutDraft, formatPhone, getCheckoutErrors, getPhoneDigits, readCheckoutDraft, saveCheckoutDraft } from "./payment";
import type { ICheckoutForm } from "./payment";

const FORM: ICheckoutForm = {
    customerName: "Ana Pérez",
    customerPhone: "6123-4567",
    hasOtherWhatsapp: false,
    whatsappPhone: "",
    note: "sin nueces",
    fulfillment: "delivery",
    deliveryAddress: "Calle 5, casa 12",
    deliveryDetails: "portón verde",
    deliveryLat: 8.24,
    deliveryLng: -80.47,
    privacyConsent: true,
};

/** sessionStorage en memoria: las pruebas corren en Node, sin navegador. */
const createStorage = () => {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
    };
};

describe("celular", () => {
    test("solo dígitos y con guion para mostrar", () => {
        expect(getPhoneDigits("+507 6123-4567")).toBe("50761234");
        expect(getPhoneDigits("6123-4567")).toBe("61234567");
        expect(formatPhone("61234567")).toBe("6123-4567");
    });
});

describe("errores del checkout", () => {
    test("un formulario completo no tiene errores", () => {
        expect(getCheckoutErrors(FORM, true)).toEqual({});
    });

    test("la casilla del aviso es obligatoria siempre", () => {
        expect(getCheckoutErrors({ ...FORM, privacyConsent: false }).privacyConsent).toBeTruthy();
    });

    test("la dirección solo se exige con delivery", () => {
        const withoutAddress = { ...FORM, deliveryAddress: "" };
        expect(getCheckoutErrors(withoutAddress, true).deliveryAddress).toBeTruthy();
        expect(getCheckoutErrors(withoutAddress, false).deliveryAddress).toBeUndefined();
    });

    test("celular y WhatsApp de Panamá", () => {
        expect(getCheckoutErrors({ ...FORM, customerPhone: "2123-4567" }).customerPhone).toBeTruthy();
        expect(getCheckoutErrors({ ...FORM, hasOtherWhatsapp: true, whatsappPhone: "612" }).whatsappPhone).toBeTruthy();
    });
});

describe("borrador del checkout", () => {
    beforeEach(() => {
        vi.stubGlobal("window", { sessionStorage: createStorage() });
    });

    test("solo guarda nombre, celulares y forma de entrega", () => {
        saveCheckoutDraft(FORM);
        const draft = readCheckoutDraft();
        expect(draft).toEqual({
            customerName: "Ana Pérez",
            customerPhone: "6123-4567",
            hasOtherWhatsapp: false,
            whatsappPhone: "",
            fulfillment: "delivery",
        });
        // Nada de dirección, ubicación, nota ni casilla
        expect(JSON.stringify(draft)).not.toMatch(/Calle|verde|8\.24|nueces|privacy/);
    });

    test("ignora lo que no tiene la forma esperada y se borra al pagar", () => {
        window.sessionStorage.setItem("chunky-checkout", JSON.stringify({ customerName: 5, fulfillment: "avión", deliveryAddress: "x" }));
        expect(readCheckoutDraft()).toEqual({});

        saveCheckoutDraft(FORM);
        clearCheckoutDraft();
        expect(readCheckoutDraft()).toEqual({});
    });
});
