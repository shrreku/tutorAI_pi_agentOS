# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.0.0

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.build.json ./
COPY packages packages
COPY apps apps
COPY infra infra
COPY greenfield-studyagent greenfield-studyagent

ARG VITE_POSTHOG_API_KEY
ARG VITE_POSTHOG_HOST=https://us.i.posthog.com
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT=production
ARG VITE_SENTRY_RELEASE
ENV VITE_POSTHOG_API_KEY=$VITE_POSTHOG_API_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT
ENV VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE

RUN pnpm install --frozen-lockfile
RUN find . -name "*.tsbuildinfo" -type f -delete \
  && rm -rf packages/*/dist apps/*/dist \
  && pnpm exec tsc -b tsconfig.build.json \
  && pnpm --filter @studyagent/web exec vite build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.0.0

WORKDIR /workspace

COPY --from=build /workspace /workspace

ENV NODE_ENV=production

FROM nginx:1.27-alpine AS web
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx-web.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
