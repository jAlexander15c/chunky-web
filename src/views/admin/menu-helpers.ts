import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { HttpError, formatMoney, getCategoryImageUrl } from "@/helpers";
import type { IMenuCategory, IMenuItem, IModifier } from "@/helpers";

/** Grupo de los productos que en Loyverse no tienen categoria (la web no los muestra). */
export const NO_CATEGORY_ID = "__sin-categoria__";

export interface INotice {
    text: string;
    tone: "ok" | "warn";
}

export type MenuDialog =
    | {kind:"recipe";editing:IMenuItem}
    | { kind: "category"; editing: IMenuCategory | null }
    | { kind: "item"; editing: IMenuItem | null }
    | { kind: "modifier"; editing: IModifier | null };

export const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof HttpError ? error.message : fallback;

export const getProductCountLabel = (count: number) => (count === 1 ? "1 producto" : `${count} productos`);

/** "Entera · Avena +0.50": lo que el cliente ve al elegir. */
export const getOptionsSummary = (modifier: IModifier) =>
    modifier.options.map((option) => (option.price > 0 ? `${option.name} +${formatMoney(option.price)}` : option.name)).join(" · ");

/* ============ Foto (producto y categoría) ============ */

/**
 * La foto elegida en el formulario y su vista previa. La vista previa vive lo que viva la foto;
 * sin foto nueva se muestra la que ya tenía.
 */
export const usePhotoDraft = (currentUrl: string, onError: (message: string) => void) => {
    const [photo, setPhoto] = useState<File | null>(null);

    const newPhotoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
    useEffect(() => () => {
        if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl);
    }, [newPhotoUrl]);

    const pickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            onError("Elige una foto (JPG o PNG).");
            return;
        }
        onError("");
        setPhoto(file);
    };

    return { photo, previewUrl: newPhotoUrl || currentUrl, pickPhoto };
};

/** La foto que ya tiene la categoría en nuestra API, o "" si no tiene. */
export const getMenuCategoryImageUrl = (category: IMenuCategory) =>
    getCategoryImageUrl({ id: category.id, image_version: category.imageVersion }) ?? "";

/** "3,50", "3.5" o "B/. 3.50" → 3.5. NaN si no es un número. */
export const parsePrice = (value: string) => Number(value.replace(/[^\d.,]/g, "").replace(",", "."));
