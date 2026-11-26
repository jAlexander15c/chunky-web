import { useSearchParams } from "react-router";

/** La pestaña va en la dirección (?s=menu&t=promos), igual que la sección: al recargar se queda donde estaba. */
const TAB_PARAM = "t";

export interface ISectionTab<T extends string> {
    id: T;
    label: string;
}

/** Lee la pestaña de la dirección. La primera es la de por defecto y no deja rastro en el enlace. */
export const useSectionTab = <T extends string>(tabs: ISectionTab<T>[]) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get(TAB_PARAM);
    const tab = tabs.find((one) => one.id === requested)?.id ?? tabs[0].id;

    const changeTab = (next: T) =>
        setSearchParams(
            (current) => {
                const params = new URLSearchParams(current);
                if (next === tabs[0].id) params.delete(TAB_PARAM);
                else params.set(TAB_PARAM, next);
                return params;
            },
            { replace: true }
        );

    return [tab, changeTab] as const;
};
