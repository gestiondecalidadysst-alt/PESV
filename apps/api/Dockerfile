# Construir desde la raíz del repositorio: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @pesv/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @pesv/shared build && pnpm --filter @pesv/api build
RUN pnpm deploy --legacy --filter @pesv/api --prod /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
RUN mkdir -p /data/storage && chown node:node /data/storage
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
