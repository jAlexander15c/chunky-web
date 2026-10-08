import { useEffect, useState } from "react";

import { getApiUrl, httpGet } from "./getHttp";

import type { ICategory } from "@/interfaces";

/** A dónde lleva el botón de una lámina. Misma lista que chunky-api (home-slides). */
export type HomeSlideDestination = "menu" | "cotizador" | "category" | "pasta";

/** Estilo visual de la lámina: color de fondo, textos de la estampilla y sello. */
export type HomeSlideTheme = "jp" | "ny" | "it" | "cake";

/** Una lámina del carrusel del inicio. Se duplica a mano el tipo del API. */
export interface IHomeSlide {
    id: string;
    title: string;
    /** Remate en letra de mano, bajo el título. */
    script: string;
    tag: string | null;
    text: string;
    buttonLabel: string;
    destination: HomeSlideDestination;
    categoryId: string | null;
    theme: HomeSlideTheme;
    active: boolean;
    /** YYYY-MM-DD en hora de Panamá. */
    startsOn: string | null;
    endsOn: string | null;
    position: number;
    /** Cambia al subir otra foto; null si no tiene. */
    imageVersion: number | null;
    updatedByName: string | null;
    updatedAt: string;
}

/** Lo que se manda al crear o editar. Mismos topes que el API. */
export interface IHomeSlideInput {
    title: string;
    script: string;
    tag?: string;
    text: string;
    buttonLabel: string;
    destination: HomeSlideDestination;
    categoryId?: string;
    theme: HomeSlideTheme;
    active: boolean;
    startsOn?: string;
    endsOn?: string;
}

export const HOME_SLIDE_LIMITS = { title: 40, script: 40, tag: 40, text: 140, buttonLabel: 24 } as const;
/** Cuántas láminas pueden estar prendidas a la vez. */
export const HOME_SLIDES_MAX_ACTIVE = 6;

export const HOME_SLIDE_THEMES: { id: HomeSlideTheme; label: string; captionLeft: string; captionRight: string }[] = [
    { id: "jp", label: "Japón", captionLeft: "Japón", captionRight: "Matcha" },
    { id: "ny", label: "NY", captionLeft: "New York", captionRight: "Galletas" },
    { id: "it", label: "Italia", captionLeft: "Italia", captionRight: "Salados" },
    { id: "cake", label: "Cakes", captionLeft: "Cakes", captionRight: "Por encargo" },
];

export const HOME_SLIDE_DESTINATION_LABEL: Record<HomeSlideDestination, string> = {
    cotizador: "Cotizador de cakes",
    menu: "Menú completo",
    category: "Una categoría",
    pasta: "Arma tu pasta",
};

// Cuánto se reutilizan las láminas antes de volver a pedirlas (una promo nueva aparece sin recargar)
const SLIDES_TTL_MS = 5 * 60 * 1000;

let slidesCache: { value: IHomeSlide[]; savedAt: number } | null = null;
let slidesRequest: Promise<IHomeSlide[]> | null = null;

const getFreshSlides = () => (slidesCache && Date.now() - slidesCache.savedAt < SLIDES_TTL_MS ? slidesCache.value : null);

/** Láminas visibles hoy, en orden. Con `force` se ignora la caché. Si falla, el error sube a quien llama. */
export const fetchHomeSlides = (force = false) => {
    const fresh = force ? null : getFreshSlides();
    if (fresh) return Promise.resolve(fresh);

    if (!slidesRequest) {
        slidesRequest = httpGet<{ data: { slides: IHomeSlide[] } }>("/home-slides")
            .then((response) => {
                const slides = response.data.slides;
                slidesCache = { value: slides, savedAt: Date.now() };
                return slides;
            })
            .catch((error) => {
                console.error("[home-slides] error:", error?.status, error?.message);
                throw error;
            })
            .finally(() => {
                slidesRequest = null;
            });
    }

    return slidesRequest;
};

/** Las promos del carrusel. Si el API falla queda la lista vacía y el inicio se ve como siempre. */
export const useHomeSlides = () => {
    const [slides, setSlides] = useState<IHomeSlide[]>(() => getFreshSlides() ?? []);

    useEffect(() => {
        let cancelled = false;
        fetchHomeSlides()
            .then((next) => {
                if (!cancelled) setSlides(next);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, []);

    return { slides };
};

/** Foto de la lámina, de nuestro API (sin api key: la pide un <img>). La versión evita una foto vieja en caché. */
export const getHomeSlideImageUrl = (slide: Pick<IHomeSlide, "id" | "imageVersion">) =>
    slide.imageVersion ? getApiUrl(`/home-slides/${encodeURIComponent(slide.id)}/image?v=${slide.imageVersion}`) : null;

export interface IHomeSlideLink {
    to: string;
    state: { categoryName: string } | undefined;
}

/**
 * A dónde va el botón. Null para "pasta": no navega, abre el armador. Si la categoría ya no existe
 * (se borró del menú) el botón lleva al menú completo.
 */
export const getSlideLink = (
    slide: Pick<IHomeSlide, "destination" | "categoryId">,
    categories: Pick<ICategory, "id" | "name">[]
): IHomeSlideLink | null => {
    if (slide.destination === "pasta") return null;
    if (slide.destination === "cotizador") return { to: "/cotizador", state: undefined };
    if (slide.destination === "category") {
        const category = categories.find((entry) => entry.id === slide.categoryId);
        if (category) return { to: `/items?categoryId=${category.id}`, state: { categoryName: category.name } };
    }
    return { to: "/menu", state: undefined };
};

/**
 * El día de pasta el menú no se vende (solo bebidas y pasta): se esconden las láminas que llevan al
 * menú o a una categoría. La de pasta solo se ve ese día, y si el armador está configurado.
 */
export const isSlideVisible = (
    slide: Pick<IHomeSlide, "destination">,
    settings: { pastaMode: boolean; pasta?: unknown | null }
) => {
    if (slide.destination === "pasta") return settings.pastaMode && settings.pasta !== null;
    if (settings.pastaMode) return slide.destination !== "menu" && slide.destination !== "category";
    return true;
};

export type HomeSlideStatus = "live" | "scheduled" | "expired" | "off";

/** Estado de una lámina para el tablero, con `today` en hora de Panamá (YYYY-MM-DD). */
export const getSlideStatus = (slide: Pick<IHomeSlide, "active" | "startsOn" | "endsOn">, today: string): HomeSlideStatus => {
    if (!slide.active) return "off";
    if (slide.endsOn && slide.endsOn < today) return "expired";
    if (slide.startsOn && slide.startsOn > today) return "scheduled";
    return "live";
};
