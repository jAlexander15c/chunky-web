import { useSyncExternalStore } from "react";

import { httpGet } from "./getHttp";
import { DEFAULT_OPENING_HOURS } from "./hours";
import type { IWeekHours, StoreOverride } from "./hours";
import type { IPastaSettings } from "./pasta";

/** Ajustes publicos de chunky-api: dia de pasta, datos del armador y horario del local. */
export interface IPublicSettings {
    pastaMode: boolean;
    pasta: IPastaSettings | null;
    beveragesCategoryId: string | null;
    openingHours: IWeekHours;
    /** Abierto o cerrado a mano por hoy desde /tablero; null sigue el horario. */
    storeOverride: StoreOverride | null;
}

interface ISettingsState {
    settings: IPublicSettings;
    /** false hasta la primera respuesta (o el primer fallo). */
    isReady: boolean;
}

// Sin la respuesta del API se asume el menu y el horario de siempre: el servidor igual rechaza lo que no se vende hoy
const DEFAULT_SETTINGS: IPublicSettings = {
    pastaMode: false,
    pasta: null,
    beveragesCategoryId: null,
    openingHours: DEFAULT_OPENING_HOURS,
    storeOverride: null,
};

// Un cliente con la pagina abierta se entera del cambio de modo en menos de un minuto
const SETTINGS_REFRESH_MS = 60 * 1000;

let state: ISettingsState = { settings: DEFAULT_SETTINGS, isReady: false };
let request: Promise<void> | null = null;
let refreshTimer: number | undefined;
const listeners = new Set<() => void>();

const setState = (next: ISettingsState) => {
    state = next;
    listeners.forEach((listener) => listener());
};

/** Pide los ajustes al API. Las llamadas simultaneas comparten una sola peticion. */
export const loadSettings = () => {
    if (!request) {
        request = httpGet<IPublicSettings>("/settings/public")
            // Un API anterior a los cambios de horario no manda esos campos
            .then((settings) => setState({ settings: { ...DEFAULT_SETTINGS, ...settings }, isReady: true }))
            .catch((error) => {
                console.error("[settings] error:", error?.status, error?.message);
                // Conserva lo ultimo que se supo; solo deja de esperar
                setState({ settings: state.settings, isReady: true });
            })
            .finally(() => {
                request = null;
            });
    }

    return request;
};

const refreshWhenVisible = () => {
    if (document.visibilityState === "visible") void loadSettings();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    if (listeners.size === 1) {
        void loadSettings();
        refreshTimer = window.setInterval(refreshWhenVisible, SETTINGS_REFRESH_MS);
        document.addEventListener("visibilitychange", refreshWhenVisible);
    }

    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            window.clearInterval(refreshTimer);
            document.removeEventListener("visibilitychange", refreshWhenVisible);
        }
    };
};

const getSnapshot = () => state;

export const useSettings = () => useSyncExternalStore(subscribe, getSnapshot);
