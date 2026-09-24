// src/lib/http.ts
export class HttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

/**
 * Normaliza la URL del API: sin protocolo el navegador la toma como ruta del mismo sitio
 * (ischunkybites.com/chunky-api...), el servidor responde index.html con 200 y no hay datos.
 * localhost usa http, el resto https. Sin "/" final para no duplicarla al unir rutas.
 */
const getApiBaseUrl = (value?: string) => {
    const url = (value || "https://chunky-api-production.up.railway.app").trim().replace(/\/+$/, "");
    if (/^https?:\/\//i.test(url)) return url;
    return /^(localhost|127\.0\.0\.1)(:|$)/.test(url) ? `http://${url}` : `https://${url}`;
};

// chunky-api en Railway (produccion). Para apuntar a otra API usa VITE_API_BASE_URL (ej. http://localhost:3000 en .env.local)
const API_BASE = getApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
console.log("[api] base:", API_BASE);
// Llave que pide chunky-api en el header x-api-key (VITE_API_KEY en .env.local)
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is not defined");
}

/** URL completa de una ruta del API, para lo que pide el navegador por su cuenta (ej. un <img>). */
export const getApiUrl = (path: string) => `${API_BASE}${path}`;

const sendJson = async <T>(
    method: "POST" | "PUT" | "DELETE",
    path: string,
    body: unknown,
    options?: { headers?: Record<string, string> }
): Promise<T> => {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(API_KEY ? { "x-api-key": API_KEY } : {}),
            ...options?.headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new HttpError(res.status, data?.message || res.statusText);
    }

    return res.json() as Promise<T>;
};

/** POST JSON a chunky-api. Si falla, el HttpError trae el `message` del API cuando existe. */
export const httpPost = <T>(path: string, body: unknown, options?: { headers?: Record<string, string> }) =>
    sendJson<T>("POST", path, body, options);

export const httpPut = <T>(path: string, body: unknown, options?: { headers?: Record<string, string> }) =>
    sendJson<T>("PUT", path, body, options);

export const httpDelete = <T>(path: string, options?: { headers?: Record<string, string> }) =>
    sendJson<T>("DELETE", path, undefined, options);

/**
 * POST JSON que sobrevive al cierre de la pestaña (keepalive). No usa sendBeacon porque el API
 * pide el header x-api-key. No lee la respuesta: es para envios que no deben frenar nada.
 */
export const httpPostKeepalive = (path: string, body: unknown) =>
    fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(API_KEY ? { "x-api-key": API_KEY } : {}),
        },
        body: JSON.stringify(body),
        keepalive: true,
    });

/** POST de un archivo tal cual (ej. la foto de un producto), con su propio Content-Type. */
export const httpPostBinary = async <T>(path: string, file: Blob, options?: { headers?: Record<string, string> }): Promise<T> => {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": file.type,
            ...(API_KEY ? { "x-api-key": API_KEY } : {}),
            ...options?.headers,
        },
        body: file,
    });

    if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new HttpError(res.status, data?.message || res.statusText);
    }

    return res.json() as Promise<T>;
};

export async function httpGet<T>(
    path: string,
    options?: {
        signal?: AbortSignal;
        headers?: Record<string, string>;
    }
): Promise<T> {
    const url = `${API_BASE}${path}`;

    const res = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            ...(API_KEY ? { "x-api-key": API_KEY } : {}),
            ...options?.headers,
        },
        signal: options?.signal,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new HttpError(res.status, text || res.statusText);
    }

    // Un 200 con HTML suele ser la URL del API mal configurada (responde la propia web)
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        const text = await res.text().catch(() => "");
        console.error(`[api] ${url} respondio ${res.status} sin JSON (${contentType}):`, text.slice(0, 200));
        throw new HttpError(res.status, "La respuesta del API no es JSON");
    }

    return res.json() as Promise<T>;
}
