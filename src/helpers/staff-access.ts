/* Acceso del equipo al tablero y a /gestion: PIN propio, Face ID (passkeys) y avisos de insumos. */
import { platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

import type { CollaboratorRole } from "./admin";
import { HttpError, httpDelete, httpGet, httpPost } from "./getHttp";

export type StaffScope = "admin" | "gestion";

/** Quien entró. En el tablero puede ser null: la llave de recuperación (ADMIN_PIN) no es una persona. */
export interface IStaffPerson {
    id: number;
    name: string;
    roles: CollaboratorRole[];
}

export interface IStaffLogin {
    token: string;
    collaborator: IStaffPerson | null;
    /** Entró con el PIN que generó el sistema: antes de seguir elige el suyo. */
    mustChangePin: boolean;
}

export interface IStaffMe {
    collaborator: IStaffPerson | null;
    mustChangePin: boolean;
    isFaceIdAvailable: boolean;
}

export interface IPasskeyDevice {
    id: string;
    label: string;
    createdAt: string;
    lastUsedAt: string | null;
}

export type FaceIdLoginOptions = PublicKeyCredentialRequestOptionsJSON;
export type FaceIdRegistrationOptions = PublicKeyCredentialCreationOptionsJSON;

const getScopeHeaders = (scope: StaffScope, token: string): Record<string, string> =>
    scope === "admin" ? { "x-admin-token": token } : { "x-gestion-token": token };

export const fetchStaffMe = (scope: StaffScope, token: string, signal?: AbortSignal) =>
    httpGet<IStaffMe>(`/${scope}/me`, { signal, headers: getScopeHeaders(scope, token) });

/** Guarda el PIN elegido. Responde con un token nuevo: las otras sesiones de la persona se cierran. */
export const changeMyPin = (scope: StaffScope, token: string, newPin: string) =>
    httpPost<IStaffLogin>(`/${scope}/me/pin`, { newPin }, { headers: getScopeHeaders(scope, token) });

/**
 * PIN que se adivina en pocos intentos: todos iguales, escaleras (123456, 654321) o un par o
 * trío repetido (121212, 123123). Es la misma regla de pin.rules del API, que es quien decide;
 * aquí solo sirve para avisar en el primer paso y no después de repetirlo.
 */
export const isPinEasyToGuess = (pin: string) => {
    const digits = pin.split("").map(Number);
    const steps = digits.slice(1).map((digit, index) => digit - digits[index]);

    const isSameDigit = steps.every((step) => step === 0);
    const isLadder = steps.every((step) => step === 1) || steps.every((step) => step === -1);
    const isRepeatedPair = pin === pin.slice(0, 2).repeat(3);
    const isRepeatedTriple = pin === pin.slice(0, 3).repeat(2);

    return isSameDigit || isLadder || isRepeatedPair || isRepeatedTriple;
};

/* ============ Face ID ============ */

const FACE_ID_FLAG_KEY = "chunky-faceid";
const FACE_ID_OFFER_KEY = "chunky-faceid-offer-dismissed";

const readFlag = (key: string) => {
    try {
        return window.localStorage.getItem(key) === "1";
    } catch {
        return false;
    }
};

const writeFlag = (key: string, isOn: boolean) => {
    try {
        if (isOn) window.localStorage.setItem(key, "1");
        else window.localStorage.removeItem(key);
    } catch {
        return;
    }
};

/** Este equipo ya entró o activó Face ID: el botón de Face ID va primero en la pantalla de acceso. */
export const hasUsedFaceIdHere = () => readFlag(FACE_ID_FLAG_KEY);

export const isFaceIdOfferDismissed = () => readFlag(FACE_ID_OFFER_KEY);

export const dismissFaceIdOffer = () => writeFlag(FACE_ID_OFFER_KEY, true);

/** El iPhone tiene Face ID (o Touch ID) que la web puede usar. */
export const isFaceIdSupported = async () => {
    try {
        return await platformAuthenticatorIsAvailable();
    } catch {
        return false;
    }
};

/**
 * Las opciones se piden antes del toque: iOS solo abre Face ID si se llama justo después de que la
 * persona toca el botón, sin esperar a la red en el medio. Null si el API no tiene Face ID activo.
 */
export const fetchFaceIdLoginOptions = async (scope: StaffScope) => {
    try {
        const { options } = await httpPost<{ options: FaceIdLoginOptions }>(`/${scope}/passkeys/login/options`, {});
        return options;
    } catch (error) {
        if (error instanceof HttpError && error.status === 503) return null;
        throw error;
    }
};

/** Cancelar Face ID no es un error que haya que mostrar. */
export const isFaceIdCancelled = (error: unknown) =>
    error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError");

export const loginWithFaceId = async (scope: StaffScope, options: FaceIdLoginOptions) => {
    const response = await startAuthentication({ optionsJSON: options });
    const session = await httpPost<IStaffLogin>(`/${scope}/passkeys/login/verify`, { response });
    writeFlag(FACE_ID_FLAG_KEY, true);
    return session;
};

export const fetchFaceIdRegistrationOptions = async (scope: StaffScope, token: string) => {
    const { options } = await httpPost<{ options: FaceIdRegistrationOptions }>(
        `/${scope}/passkeys/register/options`,
        {},
        { headers: getScopeHeaders(scope, token) }
    );
    return options;
};

export const activateFaceId = async (scope: StaffScope, token: string, options: FaceIdRegistrationOptions) => {
    const response = await startRegistration({ optionsJSON: options });
    const result = await httpPost<{ passkey: { id: string; label: string } }>(
        `/${scope}/passkeys/register/verify`,
        { response },
        { headers: getScopeHeaders(scope, token) }
    );
    writeFlag(FACE_ID_FLAG_KEY, true);
    return result.passkey;
};

export const fetchMyPasskeys = (scope: StaffScope, token: string, signal?: AbortSignal) =>
    httpGet<{ passkeys: IPasskeyDevice[] }>(`/${scope}/me/passkeys`, { signal, headers: getScopeHeaders(scope, token) });

export const removeMyPasskey = (scope: StaffScope, token: string, id: string) =>
    httpDelete<void>(`/${scope}/me/passkeys/${encodeURIComponent(id)}`, { headers: getScopeHeaders(scope, token) });

/* ============ Avisos de insumos (solo admins) ============ */

export const fetchSupplyAlerts = (token: string, endpoint: string | null, signal?: AbortSignal) =>
    httpGet<{ publicKey: string | null; isSubscribed: boolean }>(
        `/admin/supply-alerts${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`,
        { signal, headers: getScopeHeaders("admin", token) }
    );

export const subscribeSupplyAlerts = (token: string, subscription: PushSubscription) =>
    httpPost<{ isSubscribed: boolean }>(
        "/admin/supply-alerts",
        { subscription: subscription.toJSON() },
        { headers: getScopeHeaders("admin", token) }
    );

export const unsubscribeSupplyAlerts = (token: string, endpoint: string) =>
    httpDelete<{ isSubscribed: boolean }>(`/admin/supply-alerts?endpoint=${encodeURIComponent(endpoint)}`, {
        headers: getScopeHeaders("admin", token),
    });
