// Service worker de los avisos push, aunque la web este cerrada o el telefono bloqueado:
// al cliente sobre su pedido (aceptado y listo) y a los admins sobre los insumos.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: "Chunky Bites", body: event.data ? event.data.text() : "" };
    }

    event.waitUntil(
        self.registration.showNotification(data.title || "Chunky Bites", {
            body: data.body || "",
            tag: data.tag,
            renotify: true,
            requireInteraction: true,
            icon: "/cocina-icon-192.png",
            badge: "/cocina-icon-192.png",
            data: { url: data.url || "/" },
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || "/";

    // Enfoca la ventana que ya tenga esa pagina (el pedido) o abre una nueva. En el tablero la
    // seccion va en ?s=: si la app ya esta abierta en otra seccion, se lleva a la del aviso.
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            const target = new URL(url, self.location.origin);
            const exact = clients.find((client) => {
                const current = new URL(client.url);
                return current.pathname === target.pathname && current.search === target.search;
            });
            if (exact) return exact.focus();

            const samePage = clients.find((client) => new URL(client.url).pathname === target.pathname);
            if (samePage && "navigate" in samePage) return samePage.focus().then(() => samePage.navigate(target.href));
            return self.clients.openWindow(url);
        })
    );
});
