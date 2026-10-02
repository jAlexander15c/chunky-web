/* Lógica del acceso del equipo (Face ID y elegir PIN), compartida por el tablero y /gestion. */
import { useCallback, useEffect, useState } from "react";

import {
    HttpError,
    activateFaceId,
    changeMyPin,
    fetchFaceIdLoginOptions,
    fetchFaceIdRegistrationOptions,
    hasUsedFaceIdHere,
    isFaceIdCancelled,
    isFaceIdOfferDismissed,
    isFaceIdSupported,
    isPinEasyToGuess,
    loginWithFaceId,
} from "@/helpers";
import type { FaceIdLoginOptions, FaceIdRegistrationOptions, IStaffLogin, StaffScope } from "@/helpers";

export const PIN_LENGTH = 6;

/** Las opciones de Face ID vencen en 5 minutos en el API: se renuevan antes. */
const FACE_ID_OPTIONS_REFRESH_MS = 4 * 60 * 1000;

export const PIN_MISMATCH_MESSAGE = "Los dos PIN no coinciden. Empieza de nuevo.";

export const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof HttpError && error.status < 500 ? error.message : fallback;

/** iOS dice que el equipo ya tiene la llave: para la persona, Face ID ya está activo. */
const isAlreadyRegistered = (error: unknown) =>
    (error as { code?: string } | null)?.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED";

/**
 * Face ID en la pantalla de acceso. Las opciones se piden antes: iOS solo abre Face ID si se
 * llama enseguida del toque, sin esperar a la red en el medio.
 */
export const useFaceIdLogin = (scope: StaffScope, onLogin: (login: IStaffLogin) => void) => {
    const [options, setOptions] = useState<FaceIdLoginOptions | null>(null);
    const [isAvailable, setIsAvailable] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState("");

    const loadOptions = useCallback(async () => {
        if (!(await isFaceIdSupported())) return;
        try {
            const next = await fetchFaceIdLoginOptions(scope);
            setOptions(next);
            setIsAvailable(Boolean(next));
        } catch {
            // Sin red o sin Face ID en el API: queda el PIN
            setOptions(null);
        }
    }, [scope]);

    useEffect(() => {
        void loadOptions();
        const timer = window.setInterval(() => void loadOptions(), FACE_ID_OPTIONS_REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [loadOptions]);

    const start = async () => {
        if (!options || isBusy) return;
        // Cada reto sirve una sola vez
        const used = options;
        setOptions(null);
        setIsBusy(true);
        setError("");

        try {
            onLogin(await loginWithFaceId(scope, used));
        } catch (loginError) {
            if (!isFaceIdCancelled(loginError)) {
                setError(getErrorMessage(loginError, "No pudimos entrar con Face ID. Usa tu PIN."));
            }
            void loadOptions();
        } finally {
            setIsBusy(false);
        }
    };

    return { isAvailable, isReady: Boolean(options), isBusy, error, start };
};

/**
 * Elegir PIN en dos pasos: escribirlo y repetirlo. Cada pantalla pone su forma de escribir
 * (teclado en gestión, campo en el tablero); aquí van el paso, la validación y el guardado.
 */
export const useChoosePin = (scope: StaffScope, token: string, onChanged: (login: IStaffLogin) => void) => {
    const [first, setFirst] = useState("");
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const step: "first" | "confirm" = first ? "confirm" : "first";

    const restart = (message: string) => {
        setFirst("");
        setPin("");
        setError(message);
    };

    const submit = async (value: string) => {
        if (value.length !== PIN_LENGTH || isSaving) return;
        if (!first) {
            if (isPinEasyToGuess(value)) {
                restart("Ese PIN es fácil de adivinar. Elige otro.");
                return;
            }
            setFirst(value);
            setPin("");
            setError("");
            return;
        }
        if (value !== first) {
            restart(PIN_MISMATCH_MESSAGE);
            return;
        }

        setIsSaving(true);
        try {
            onChanged(await changeMyPin(scope, token, value));
        } catch (saveError) {
            restart(getErrorMessage(saveError, "No pudimos guardar tu PIN. Revisa la conexión."));
        } finally {
            setIsSaving(false);
        }
    };

    return { step, pin, setPin, error, setError, isSaving, submit, pinLength: PIN_LENGTH };
};

/** Se ofrece una vez, después de entrar con PIN, si el equipo tiene Face ID y no se activó. */
export const shouldOfferFaceId = async (isFaceIdAvailable: boolean) =>
    isFaceIdAvailable && !hasUsedFaceIdHere() && !isFaceIdOfferDismissed() && (await isFaceIdSupported());

/** Pide las opciones de registro al montar, para que el toque abra Face ID sin esperar. */
export const useFaceIdRegistration = (scope: StaffScope, token: string) => {
    const [options, setOptions] = useState<FaceIdRegistrationOptions | null>(null);
    const [loadError, setLoadError] = useState("");

    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const next = await fetchFaceIdRegistrationOptions(scope, token);
                if (signal?.aborted) return;
                setOptions(next);
                setLoadError("");
            } catch (error) {
                if (signal?.aborted) return;
                setLoadError(getErrorMessage(error, "No pudimos preparar Face ID. Revisa la conexión."));
            }
        },
        [scope, token]
    );

    useEffect(() => {
        const controller = new AbortController();
        // load solo cambia el estado después de la respuesta del API, nunca en el mismo render
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load(controller.signal);
        const timer = window.setInterval(() => void load(controller.signal), FACE_ID_OPTIONS_REFRESH_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [load]);

    /** Devuelve true si quedó activo (o ya lo estaba en este equipo). */
    const activate = async () => {
        if (!options) return false;
        const used = options;
        setOptions(null);
        try {
            await activateFaceId(scope, token, used);
            return true;
        } catch (error) {
            if (isAlreadyRegistered(error)) return true;
            void load();
            if (isFaceIdCancelled(error)) return false;
            throw error;
        }
    };

    return { isReady: Boolean(options), loadError, activate };
};

