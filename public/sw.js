// Service worker de los avisos al cliente sobre su pedido (aceptado y listo),
// aunque tenga la web cerrada o el telefono bloqueado.

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

    // Enfoca la pestana que ya tenga esa pagina (el pedido) o abre una nueva
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            const open = clients.find((client) => new URL(client.url).pathname === url);
            return open ? open.focus() : self.clients.openWindow(url);
        })
    );
});
