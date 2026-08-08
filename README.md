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
    ? (await import("awilixify-devtools")).DevtoolsModule({
        serviceName: "my-service",
      })
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
  serviceName: "orders",
  host: "0.0.0.0",
  port: 3221,
  appUrl: "http://127.0.0.1:3000",
  traceHistoryFile: ".awilixify-devtools/traces.json",
});
```

- `host` defaults to `127.0.0.1`. Use `0.0.0.0` when the UI container must
  reach the API through the host.
- `serviceName` is required. It identifies the service in multi-service views
  and qualifies graph module IDs and trace IDs (for example,
  `orders--trace-42`). Use lowercase letters, numbers, and hyphens.
- `port` defaults to `3221`.
- `appUrl` proxies non-DevTools requests to the observed application.
- `traceHistoryFile` defaults to `.awilixify-devtools/traces.json`. Set it to
  `false` to keep traces in memory.

The API exposes application structure and invocation capabilities. Keep it
disabled in production and do not expose it to untrusted networks.

## AI trace-debugging skill

Install the bundled trace-debugging workflow into a consuming repository:

```sh
npx awilixify-devtools init-ai
```

The command installs both `.agents/skills/awilixify-trace-debugging` for Codex
and `.claude/skills/awilixify-trace-debugging` for Claude Code. Use `--codex`
or `--claude` to install only one, `--root <path>` to select a different
repository, and `--force` to replace a locally modified installation. Without
`--force`, locally changed skill files are preserved.

Pass the concrete task as part of the invocation:

```text
$awilixify-trace-debugging Fix the issue described in tickets/order-failure.md
/awilixify-trace-debugging Fix the issue described in tickets/order-failure.md
```

The first form is for Codex and the second is for Claude Code. The task may
reference a ticket file or include the report, curl, expected behavior, and
acceptance criteria directly. The skill discovers DevTools targets from
`DEVTOOLS_TARGETS`, `DevtoolsModule(...)`, Docker Compose, and referenced
environment configuration, then verifies candidates through
`GET /__devtools/settings`.

## Cross-service traces

Every service keeps its own qualified trace record ID while related records
share a W3C-compatible distributed trace ID. Each record also carries a span ID
and its upstream parent span ID, allowing the UI to bind service traces into one
execution without relying on timestamps. Trace context is propagated through
the standard `traceparent` header.

## UI

The web interface is distributed independently as
`ghcr.io/awilixify/awilixify-devtools-ui`. See the
[DevTools UI repository](https://github.com/awilixify/awilixify-devtools-ui)
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
