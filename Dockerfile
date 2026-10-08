# Node 24 (LTS). Node 20 ya no recibe parches de seguridad.
# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite incrusta las VITE_* al compilar. Railway pasa las variables del servicio
# como build args solo si se declaran aqui con ARG.
ARG VITE_API_BASE_URL
ARG VITE_API_KEY
ARG VITE_MAINTENANCE_MODE=false
ARG VITE_YAPPY_CDN_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_API_KEY=$VITE_API_KEY \
    VITE_MAINTENANCE_MODE=$VITE_MAINTENANCE_MODE \
    VITE_YAPPY_CDN_URL=$VITE_YAPPY_CDN_URL

RUN npm run build

# Stage 2: Serve
FROM node:24-alpine AS runner

WORKDIR /app

# server.mjs sirve igual que serve@14.2.6 (mismas librerias, versiones fijas) y ademas
# manda el dominio sin www a www con un 301. Un despliegue no debe cambiar de servidor sin que lo decidamos
RUN npm install --no-save --no-package-lock serve-handler@6.1.7 compression@1.8.1

COPY --chown=node:node server.mjs ./
COPY --from=builder --chown=node:node /app/dist ./dist

# Sin privilegios de root dentro del contenedor
USER node

EXPOSE 3000

CMD ["node", "server.mjs"]
