// Sirve dist/ igual que `serve -s dist -l 3000` (mismas librerias y versiones que serve@14.2.6),
// con un paso antes: quien entra por el dominio sin www recibe un 301 a www. Asi el navegador no
// carga la web dos veces ni pide nada al API desde un origen que el CORS no admite.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { promisify } from "node:util";

import compression from "compression";
import handler from "serve-handler";

const PORT = 3000;
const APEX_HOST = "ischunkybites.com";
const CANONICAL_ORIGIN = "https://www.ischunkybites.com";

// Lo mismo que arma serve: serve.json, ETag y toda ruta desconocida a index.html (-s)
const config = {
    ...JSON.parse(await readFile("dist/serve.json", "utf8")),
    public: "dist",
    etag: true,
    rewrites: [{ source: "**", destination: "/index.html" }],
};

const compress = promisify(compression());

/** Railway pasa el dominio original en Host; x-forwarded-host por si algun proxy lo cambia. */
const getRequestHost = (request) =>
    String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "").split(":")[0].toLowerCase();

const isApexRequest = (request) => getRequestHost(request) === APEX_HOST;

const server = createServer(async (request, response) => {
    try {
        if (isApexRequest(request)) {
            response.writeHead(301, { Location: `${CANONICAL_ORIGIN}${request.url ?? "/"}` });
            response.end();
            return;
        }
        await compress(request, response);
        await handler(request, response, config);
    } catch (error) {
        console.error("[web] error al servir", request.url, error);
        if (!response.headersSent) response.statusCode = 500;
        response.end();
    }
});

server.listen(PORT, () => console.log(`[web] sirviendo dist en el puerto ${PORT}`));
