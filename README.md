# Awilixify DevTools

Developer tools for inspecting Awilixify module graphs, routes, traces, and
provider impact.

The repository contains two independently delivered parts:

- `devtools`: the API package published as `awilixify-devtools`.
- `devtools-ui`: the Vite application, developed locally and distributed as a
  container image.

The npm package does not serve or contain the UI.

## Develop the UI with the Fastify example

Build Awilixify and start the Fastify example:

```sh
cd ../awilixify
pnpm build

cd examples/fastify-cqrs
docker compose up -d
pnpm install
pnpm dev
```

The application runs at `http://localhost:3000` and its DevTools API runs at
`http://127.0.0.1:3221`.

From the `awilixify-devtools` repository, start the UI in another terminal:

```sh
pnpm install
pnpm build:devtools
pnpm dev
```

Open `http://localhost:3222`. Vite proxies relative `/__devtools` requests to
`http://127.0.0.1:3221`, preserving hot reload, source maps, browser
breakpoints, and React DevTools.

To use another DevTools API:

```sh
DEVTOOLS_API_URL=http://127.0.0.1:4001 pnpm dev
```

Run API generation from the UI package:

```sh
cd devtools-ui
DEVTOOLS_API_URL=http://127.0.0.1:4001 pnpm generate:api
```

## Checks

```sh
pnpm lint
pnpm check-types
pnpm build
```
