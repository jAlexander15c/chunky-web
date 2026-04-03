// src/lib/http.ts
export class HttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

//const API_BASE = "https://api.ischunkybites.com" as string;
const API_BASE = "https://kvrs5u1t83.execute-api.us-east-2.amazonaws.com" as string;

if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is not defined");
}

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
        },
        signal: options?.signal,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new HttpError(res.status, text || res.statusText);
    }

    return res.json() as Promise<T>;
}
