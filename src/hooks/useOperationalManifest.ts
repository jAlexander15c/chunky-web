import { useEffect } from "react";
import { useLocation } from "react-router";

/** Cómo se llama y con qué ícono queda cada pantalla del equipo al agregarla a la pantalla de inicio. */
const APPS: Record<string, { manifest: string; title: string }> = {
    "/admin": { manifest: "/admin.webmanifest", title: "Chunky Admin" },
    "/gestion": { manifest: "/gestion.webmanifest", title: "Chunky Gestión" },
};

const APP_ICON = "/cocina-icon-180.png";

/** Pone (o cambia) una etiqueta del <head> y devuelve cómo dejarla como estaba. */
const setHeadTag = (selector: string, create: () => HTMLElement, attribute: string, value: string) => {
    let element = document.head.querySelector<HTMLElement>(selector);
    const isNew = !element;
    if (!element) {
        element = create();
        document.head.appendChild(element);
    }
    const previous = element.getAttribute(attribute);
    element.setAttribute(attribute, value);

    return () => {
        if (isNew) element.remove();
        else if (previous === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, previous);
    };
};

const createLink = (rel: string) => () => {
    const link = document.createElement("link");
    link.rel = rel;
    return link;
};

const createMeta = (name: string) => () => {
    const meta = document.createElement("meta");
    meta.name = name;
    return meta;
};

/**
 * /admin y /gestion se instalan como apps aparte en el iPhone: cada una con su manifiesto, su
 * nombre y el ícono de la cocina. iOS lee estas etiquetas al tocar "Agregar a inicio", así que
 * deben estar puestas mientras se ve la pantalla. El sitio del cliente no las lleva.
 */
export const useOperationalManifest = () => {
    const { pathname } = useLocation();
    const app = APPS[pathname];

    useEffect(() => {
        if (!app) return;

        const restores = [
            setHeadTag('link[rel="manifest"]', createLink("manifest"), "href", app.manifest),
            setHeadTag('link[rel="apple-touch-icon"]', createLink("apple-touch-icon"), "href", APP_ICON),
            setHeadTag('meta[name="mobile-web-app-capable"]', createMeta("mobile-web-app-capable"), "content", "yes"),
            setHeadTag('meta[name="apple-mobile-web-app-capable"]', createMeta("apple-mobile-web-app-capable"), "content", "yes"),
            setHeadTag('meta[name="apple-mobile-web-app-title"]', createMeta("apple-mobile-web-app-title"), "content", app.title),
            setHeadTag('meta[name="theme-color"]', createMeta("theme-color"), "content", "#fcfae9"),
        ];
        return () => restores.reverse().forEach((restore) => restore());
    }, [app]);
};
