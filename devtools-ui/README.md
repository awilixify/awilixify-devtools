# Awilixify DevTools UI

Web interface for inspecting applications that expose the
`awilixify-devtools` API.

The UI is distributed independently from the npm package as a container image:

```text
ghcr.io/wildstyles/awilixify-devtools-ui
```

Versioned tags such as `0.1.0` are intended for deployments. The `latest` tag
points to the most recently published version.

## Docker Compose

The DevTools API must be running and reachable from the UI container.

```yaml
services:
  devtools-ui:
    image: ghcr.io/wildstyles/awilixify-devtools-ui:0.1.0
    environment:
      DEVTOOLS_API_URL: http://host.docker.internal:3221
    ports:
      - "3222:3222"
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Start the UI:

```sh
docker compose up -d
```

Open `http://localhost:3222`. The container proxies `/__devtools` requests to
`DEVTOOLS_API_URL`.

When the observed application is another service in the same Compose project,
use its service name instead:

```yaml
environment:
  DEVTOOLS_API_URL: http://application:3221
```

The container exposes a health endpoint at `http://localhost:3222/healthz`.

## Local Development

Start an application with its DevTools API listening on port `3221`, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3222`. To use a different API address:

```sh
DEVTOOLS_API_URL=http://127.0.0.1:4001 pnpm dev
```
