# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

FROM nginx:alpine

ARG IMAGE_REVISION
ARG IMAGE_VERSION=0.1.0

LABEL org.opencontainers.image.title="Awilixify DevTools UI" \
	org.opencontainers.image.description="Web interface for Awilixify DevTools APIs" \
	org.opencontainers.image.source="https://github.com/awilixify/awilixify-devtools" \
	org.opencontainers.image.revision="${IMAGE_REVISION}" \
	org.opencontainers.image.version="${IMAGE_VERSION}" \
	org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache yq

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/configure-devtools-targets.sh /docker-entrypoint.d/15-configure-devtools-targets.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3222

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
	CMD wget --quiet --output-document=- http://127.0.0.1:3222/healthz >/dev/null || exit 1
