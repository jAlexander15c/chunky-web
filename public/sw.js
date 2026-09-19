// Service worker de la pantalla de cocina: muestra los avisos de pedidos nuevos
// aunque el iPad este bloqueado (web agregada a la pantalla de inicio).
// Tambien muestra los avisos al cliente de su pedido (aceptado y listo).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: "Nuevo pedido", body: event.data ? event.data.text() : "" };
    }

    event.waitUntil(
        self.registration.showNotification(data.title || "Nuevo pedido", {
            body: data.body || "",
            tag: data.tag,
            renotify: true,
            requireInteraction: true,
            icon: "/cocina-icon-192.png",
            badge: "/cocina-icon-192.png",
            data: { url: data.url || "/cocina" },
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || "/cocina";

    // Enfoca la pestana que ya tenga esa pagina (cocina o el pedido) o abre una nueva
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
            const open = clients.find((client) => new URL(client.url).pathname === url);
            return open ? open.focus() : self.clients.openWindow(url);
        })
    );
});
