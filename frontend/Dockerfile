FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace frontend --include-workspace-root
COPY frontend frontend
COPY backend/src/shared/horarios backend/src/shared/horarios
RUN npm run build --workspace frontend

FROM nginx:stable-alpine AS runtime
RUN apk add --no-cache openssl
ENV API_UPSTREAM=nomina2-api:3000
RUN rm -rf /usr/share/nginx/html/*
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 frontend/40-tls.sh /docker-entrypoint.d/40-tls.sh
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80 443
