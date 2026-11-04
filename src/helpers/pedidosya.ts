import type { IPedidosYaConfigInput, IPedidosYaStatus, IPedidosYaTestResult } from "@/interfaces";

import { httpGet, httpPost, httpPut } from "./getHttp";

const getAdminHeaders = (token: string) => ({ "x-admin-token": token });

/** Estado de la conexión con PedidosYa. Nunca trae las claves, solo si están y sus últimos 4. */
export const getPedidosYaStatus = (token: string, signal?: AbortSignal) =>
    httpGet<IPedidosYaStatus>("/admin/integrations/pedidosya", { signal, headers: getAdminHeaders(token) });

/** Guarda lo que venga en el cuerpo (configuración y/o claves). Las claves se cifran en el API. */
export const savePedidosYaConfig = (token: string, body: IPedidosYaConfigInput) =>
    httpPut<IPedidosYaStatus>("/admin/integrations/pedidosya", body, { headers: getAdminHeaders(token) });

export const setPedidosYaEnabled = (token: string, enabled: boolean) =>
    httpPost<IPedidosYaStatus>("/admin/integrations/pedidosya/enabled", { enabled }, { headers: getAdminHeaders(token) });

/** Hace login a PedidosYa. Responde 200 también cuando falla (ok: false). */
export const testPedidosYaConnection = (token: string) =>
    httpPost<IPedidosYaTestResult>("/admin/integrations/pedidosya/test", {}, { headers: getAdminHeaders(token) });
