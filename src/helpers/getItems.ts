import { httpGet } from "@/helpers";
import type { IItem } from "@/interfaces";

export const getItems = (
  params?: { categoryId?: string },
  opts?: { signal?: AbortSignal }
) => {
  // chunky-api filtra con category_id; categoryId se mantiene para el API desplegado
  const id = params?.categoryId ? encodeURIComponent(params.categoryId) : "";
  const q = id ? `?category_id=${id}&categoryId=${id}` : "";
  // Con categoria llega la lista; sin ella, { items }
  return httpGet<IItem[] | { items?: IItem[] }>(`/items/get-items${q}`, opts);
};
