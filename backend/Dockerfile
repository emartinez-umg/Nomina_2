FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace backend --include-workspace-root
COPY backend backend
RUN npm run build --workspace backend

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace backend --include-workspace-root && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
COPY backend/scripts backend/scripts
COPY db/migrations db/migrations
USER node
EXPOSE 3000
CMD ["sh", "-c", "node backend/dist/shared/db/migrate-cli.js && exec node backend/dist/server.js"]
