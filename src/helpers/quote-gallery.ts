import { useEffect, useState } from "react";

import { getApiUrl, httpGet } from "./getHttp";

/** Una foto de la galería del cotizador, tal como la ve el cliente. Se duplica a mano el tipo del API. */
export interface IQuoteGalleryPhoto {
    id: string;
    title: string;
    tag: string | null;
    /** Ruta relativa al API, con ?v= para no ver una foto vieja en caché. */
    imageUrl: string;
}

/** Una foto en el tablero (/admin › Web › Cotizador). */
export interface IGalleryPhoto {
    id: string;
    title: string;
    tag: string | null;
    active: boolean;
    position: number;
    /** Cambia al subir otra foto; null si no tiene. */
    imageVersion: number | null;
    updatedByName: string | null;
    updatedAt: string;
}

/** Lo que se manda al crear o editar. Mismos topes que el API. */
export interface IGalleryPhotoInput {
    title: string;
    tag?: string;
    active: boolean;
}

export const QUOTE_GALLERY_LIMITS = { title: 80, tag: 30 } as const;
/** Cuántas fotos puede tener la galería, prendidas o no. */
export const QUOTE_GALLERY_MAX_PHOTOS = 12;

// Cuánto se reutiliza la galería antes de volver a pedirla
const GALLERY_TTL_MS = 5 * 60 * 1000;

let galleryCache: { value: IQuoteGalleryPhoto[]; savedAt: number } | null = null;
let galleryRequest: Promise<IQuoteGalleryPhoto[]> | null = null;

const getFreshGallery = () => (galleryCache && Date.now() - galleryCache.savedAt < GALLERY_TTL_MS ? galleryCache.value : null);

/** Fotos visibles hoy, en orden. Si falla, el error sube a quien llama. */
export const fetchQuoteGallery = () => {
    const fresh = getFreshGallery();
    if (fresh) return Promise.resolve(fresh);

    if (!galleryRequest) {
        galleryRequest = httpGet<{ data: { photos: IQuoteGalleryPhoto[] } }>("/quotes/gallery")
            .then((response) => {
                const photos = response.data.photos;
                galleryCache = { value: photos, savedAt: Date.now() };
                return photos;
            })
            .finally(() => {
                galleryRequest = null;
            });
    }

    return galleryRequest;
};

/** La galería del cotizador. Si el API falla queda la lista vacía y el cotizador se ve como siempre. */
export const useQuoteGallery = () => {
    const [photos, setPhotos] = useState<IQuoteGalleryPhoto[]>(() => getFreshGallery() ?? []);

    useEffect(() => {
        let cancelled = false;
        fetchQuoteGallery()
            .then((next) => {
                if (!cancelled) setPhotos(next);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, []);

    return { photos };
};

/** Foto de la galería, de nuestro API (sin api key: la pide un <img>). */
export const getQuoteGalleryPhotoUrl = (photo: Pick<IQuoteGalleryPhoto, "imageUrl">) => getApiUrl(photo.imageUrl);

/** Foto de una entrada del tablero; la versión evita una foto vieja en caché. */
export const getGalleryPhotoUrl = (photo: Pick<IGalleryPhoto, "id" | "imageVersion">) =>
    photo.imageVersion ? getApiUrl(`/quotes/gallery/${encodeURIComponent(photo.id)}/image?v=${photo.imageVersion}`) : null;
