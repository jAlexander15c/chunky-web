import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchInventoryExitCatalog, fetchInventoryExits, prepareInventoryExitRequest, registerInventoryExit } from "./inventory-exits";

afterEach(() => vi.unstubAllGlobals());

describe("salidas de inventario", () => {
    const payload = { reason: "pruebas" as const, note: null, lines: [{ variantId: "v1", quantity: 2, modifierOptionIds: ["o1"] }] };

    test("mantiene la misma solicitud al reintentar y cambia al editar", () => {
        const first = prepareInventoryExitRequest(payload);
        expect(prepareInventoryExitRequest({ ...payload }, first).requestId).toBe(first.requestId);
        expect(prepareInventoryExitRequest({ ...payload, note: "otra" }, first).requestId).not.toBe(first.requestId);
    });

    test("envía el token de gestión y las líneas completas", async () => {
        const calls: { url: string; init: RequestInit }[] = [];
        vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return new Response(JSON.stringify(init.method === "GET" ? (url.endsWith("/catalogo") ? { items: [] } : { exits: [] }) : { exit: { id: 9 }, alreadyRegistered: false }), { headers: { "content-type": "application/json" } });
        });
        expect(await fetchInventoryExits("token")).toEqual({ exits: [] });
        expect(await fetchInventoryExitCatalog("token")).toEqual({ items: [] });
        const request = prepareInventoryExitRequest(payload);
        expect(await registerInventoryExit("token", request)).toEqual({ exit: { id: 9 }, alreadyRegistered: false });
        expect(calls.map((call) => new URL(call.url).pathname)).toEqual(["/gestion/caja/salidas", "/gestion/caja/salidas/catalogo", "/gestion/caja/salidas"]);
        expect(calls.map((call) => (call.init.headers as Record<string, string>)["x-gestion-token"])).toEqual(["token", "token", "token"]);
        expect(JSON.parse(calls[2].init.body as string)).toEqual({ ...payload, requestId: request.requestId });
    });
});
