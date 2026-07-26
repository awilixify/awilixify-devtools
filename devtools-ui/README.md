# Awilixify DevTools UI

Web interface for inspecting applications that expose the
`awilixify-devtools` API.

The UI is distributed independently from the npm package as a container image:

```text
ghcr.io/awilixify/awilixify-devtools-ui
```

Versioned tags such as `0.1.0` are intended for deployments. The `latest` tag
points to the most recently published version.

## Docker Compose

The DevTools APIs must be running and reachable from the UI container.

```yaml
services:
  devtools-ui:
    image: ghcr.io/awilixify/awilixify-devtools-ui:0.1.0
    environment:
      DEVTOOLS_TARGETS: |
        - serviceName: orders
          url: http://host.docker.internal:3221
        - serviceName: warehouse
          url: http://host.docker.internal:3223
    ports:
      - "3222:3222"
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Start the UI:

```sh
docker compose up -d
```

Open `http://localhost:3222`. The browser receives service names, while
Nginx keeps their internal URLs inside the container and proxies scoped
`/__devtools/:serviceName/api/*` and
`/__devtools/:serviceName/app/*` requests.

Each configured `serviceName` must match the observed application's required
DevTools `serviceName`. The UI validates this when connecting.

When observed applications are services in the same Compose project, use their
service names and keep their DevTools ports private:

```yaml
environment:
  DEVTOOLS_TARGETS: |
    - serviceName: orders
      url: http://orders:3221
    - serviceName: warehouse
      url: http://warehouse:3221
```

The container exposes a health endpoint at `http://localhost:3222/healthz`.

## Local Development

Start the applications and their DevTools APIs, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3222`. Configure multiple local targets with:

```sh
DEVTOOLS_TARGETS='
- serviceName: orders
  url: http://127.0.0.1:3221
- serviceName: warehouse
  url: http://127.0.0.1:3223
' pnpm dev
```

`DEVTOOLS_TARGETS` is required when starting the development server or
container.
