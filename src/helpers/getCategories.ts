import { httpGet } from "./";
import type { ICategory } from "@/interfaces";

export const getCategories = (opts?: { signal?: AbortSignal }) => {
    return httpGet<ICategory[]>("/categories/get-categories", opts);
};
