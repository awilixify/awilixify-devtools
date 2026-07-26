# Awilixify DevTools

Developer tools for inspecting Awilixify module graphs, routes, traces, and
provider impact.

The `awilixify-devtools` npm package runs alongside an observed application and
exposes a DevTools API. It does not serve or contain the UI.

## Installation

```sh
pnpm add -D awilixify-devtools
```

Register `DevtoolsModule` as a global module in development:

```ts
import { DIContext } from "awilixify";

import { AppModule } from "./app.module.js";

const devtoolsModule =
	process.env.NODE_ENV === "development"
		? (await import("awilixify-devtools")).DevtoolsModule()
		: undefined;

const app = DIContext.create(AppModule, {
	globalModules: devtoolsModule ? [devtoolsModule] : [],
});

await app.init();
```

The DevTools API listens on `http://127.0.0.1:3221` by default. Its endpoints
are mounted under `/__devtools`, and its OpenAPI documentation is available at
`/api-docs`.

## Configuration

```ts
DevtoolsModule({
	host: "0.0.0.0",
	port: 3221,
	appUrl: "http://127.0.0.1:3000",
	traceHistoryFile: ".awilixify-devtools/traces.json",
});
```

- `host` defaults to `127.0.0.1`. Use `0.0.0.0` when the UI container must
  reach the API through the host.
- `port` defaults to `3221`.
- `appUrl` proxies non-DevTools requests to the observed application.
- `traceHistoryFile` defaults to `.awilixify-devtools/traces.json`. Set it to
  `false` to keep traces in memory.

The API exposes application structure and invocation capabilities. Keep it
disabled in production and do not expose it to untrusted networks.

## UI

The web interface is distributed independently as
`ghcr.io/wildstyles/awilixify-devtools-ui`. See the
[DevTools UI documentation](https://github.com/wildstyles/awilixify-devtools/blob/main/devtools-ui/README.md)
for Docker Compose and local development instructions.

## Development

Install dependencies:

```sh
pnpm install
```

Run the checks:

```sh
pnpm lint
pnpm check-types
pnpm build
```
