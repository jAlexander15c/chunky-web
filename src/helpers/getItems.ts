import { httpGet } from "@/helpers";
import type { IItem } from "@/interfaces";

export const getItems = (
  params?: { categoryId?: string },
  opts?: { signal?: AbortSignal }
) => {
  const q = params?.categoryId
    ? `?categoryId=${encodeURIComponent(params.categoryId)}`
    : "";
  return httpGet<IItem[]>(`/items/get-items${q}`, opts);
};
