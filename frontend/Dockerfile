FROM node:18 AS builder

WORKDIR /app

COPY package*.json .
RUN npm ci

ENV VITE_SOCKET_URL=

COPY . .
RUN npm run build

FROM caddy:2.7-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/dist /srv