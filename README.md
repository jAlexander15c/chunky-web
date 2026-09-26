# chunky-web

Web de Chunky Bites: menú, carrito y pago con Yappy, cotizador de cakes, estado del pedido,
tablero (`/admin`) y gestión del equipo (`/gestion`). React + Vite; se sirve como sitio estático
con `serve` en Railway. Los datos vienen de [chunky-api](https://github.com/jAlexander15c/chunky-api).

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar los valores
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en `localhost:5173` (el CORS del API lo admite). |
| `npm run lint` | ESLint. |
| `npm test` | Pruebas con Vitest (`src/**/*.test.ts`). |
| `npx tsc -b` | Revisión de tipos (no usar `tsc --noEmit`). |
| `npm run build` | Build con `.env.local`. |
| `npm run build:prod` | Build con `.env.prod.local` por encima de `.env.local` (modo `prod` de Vite). |

## Variables

Todas son `VITE_*`: **Vite las copia dentro del JavaScript público**, así que ninguna puede ser secreta.

| Variable | Uso |
|---|---|
| `VITE_API_BASE_URL` | URL de chunky-api. Sin ella se usa producción. |
| `VITE_API_KEY` | Identifica a esta web ante el API (`x-api-key`). Es pública: cualquiera la ve en el navegador. La seguridad real está en el API (sesiones con PIN, límites, validaciones). |
| `VITE_MAINTENANCE_MODE` | `true` muestra solo la vista de mantenimiento. |
| `VITE_YAPPY_CDN_URL` | Script del botón de Yappy. Sin ella, el de producción. |

Qué archivo usa cada build: `vite build` (modo `production`) lee `.env` y `.env.local`;
`--mode prod` lee además `.env.prod.local`, que tiene prioridad. En Railway las variables llegan
como build args (ver `Dockerfile`) y no se usa ningún archivo `.env`.

## Despliegue

- **Ramas:** `dev` para desarrollo y `main` para producción. Solo pasa a `main` lo que ya se probó en `dev`.
- **Orden:** si un cambio toca el API y la web, se despliega **primero el API** y después la web.
- **Imagen:** `Dockerfile` en dos etapas con Node 24; el sitio lo sirve `serve@14.2.6` sin privilegios de root.
- **Encabezados:** están en `public/serve.json` (nosniff, Referrer-Policy, X-Frame-Options, HSTS,
  Permissions-Policy y CSP en modo solo reporte). Tras desplegar, revisarlos con:

  ```bash
  curl -sI https://www.ischunkybites.com/ | grep -iE "content-security|x-frame|referrer|strict|nosniff"
  ```

  La CSP está en `Content-Security-Policy-Report-Only`: no bloquea nada, solo avisa en la consola
  del navegador. Cuando pase un tiempo sin avisos en el menú, el checkout con Yappy, `/pedido`,
  `/admin` y `/gestion`, se cambia a `Content-Security-Policy`.
- **CI:** `.github/workflows/ci.yml` corre lint, pruebas, build y `npm audit` en cada push a `dev` o `main`.

## Rotar la llave del API

1. Generar una `API_KEY` nueva y ponerla en el servicio del API en Railway.
2. Poner el mismo valor en `VITE_API_KEY` del servicio de la web.
3. Desplegar el API y enseguida la web: entre los dos despliegues la web vieja recibe 401.

Los secretos de verdad (`SESSION_SECRET`, `COLLABORATOR_PIN_SECRET`) viven solo en el API; ver su README.

## Volver a una versión anterior

Railway guarda los despliegues anteriores: en el servicio, *Deployments* → el último que
funcionaba → *Redeploy*. Si el problema vino de un cambio del API, revertir primero el API.
La base de datos no tiene migraciones destructivas: el API solo agrega tablas y columnas al arrancar.
