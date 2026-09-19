// src/lib/http.ts
export class HttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

// chunky-api en Railway (produccion). Para apuntar a otra API usa VITE_API_BASE_URL (ej. http://localhost:3000 en .env.local)
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://chunky-api-production.up.railway.app") as string;
// Llave que pide chunky-api en el header x-api-key (VITE_API_KEY en .env.local)
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is not defined");
}

/** POST JSON a chunky-api. Si falla, el HttpError trae el `message` del API cuando existe. */
export const httpPost = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(API_KEY ? { "x-api-key": API_KEY } : {}),
        },
        body: JSON.stringify(body),
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
    }
): Promise<T> {
    const url = `${API_BASE}${path}`;

    const res = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            ...(API_KEY ? { "x-api-key": API_KEY } : {}),
        },
        signal: options?.signal,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new HttpError(res.status, text || res.statusText);
    }

    return res.json() as Promise<T>;
}
