# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.build.json ./
COPY packages packages
COPY apps apps
COPY infra infra
COPY greenfield-studyagent greenfield-studyagent

RUN pnpm install --frozen-lockfile
RUN find . -name "*.tsbuildinfo" -type f -delete \
  && rm -rf packages/*/dist apps/*/dist \
  && pnpm exec tsc -b tsconfig.build.json \
  && pnpm --filter @studyagent/web exec vite build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /workspace

COPY --from=build /workspace /workspace

ENV NODE_ENV=production

FROM nginx:1.27-alpine AS web
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx-web.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
