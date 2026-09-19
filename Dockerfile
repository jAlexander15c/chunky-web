# Stage 1: Build
FROM node:20-alpine AS builder

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
FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
