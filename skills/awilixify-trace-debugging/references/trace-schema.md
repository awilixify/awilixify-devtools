# Awilixify trace reference

## Discovery and endpoints

- `GET /__devtools/settings`: return the service identity and configured
  application URL. Use it to verify a discovered DevTools target.
- `GET /__devtools/traces`: return trace records newest-first. Filters:
  - `distributedTraceId`: exact distributed execution ID;
  - `method`: case-insensitive entrypoint method;
  - `path`: exact entrypoint path;
  - `status`: `ok` or `error`;
  - `since`: minimum `startedAt` Unix timestamp in milliseconds;
  - `limit`: return at most 1–100 entries;
  - `latest=true`: return only the newest matching entry.
- `GET /__devtools/traces/:traceId`: return one record as `{ "data": trace }`.
- `GET /__devtools/graph`: return modules, providers, routes, and operations.
- `DELETE /__devtools/traces`: clear history. Do not use during diagnosis unless
  the user explicitly requests destructive cleanup.

The DevTools URL is separate from the observed application URL. Awilixify
creates a distributed trace identifier when an incoming request has no
`traceparent`. Select the newest matching entry after replay, then filter every
involved service by its `distributedTraceId`.

## Trace record

- `id`: service-qualified record ID.
- `distributedTraceId`: shared by every service leg of one execution.
- `spanId`: service-entry span ID.
- `parentSpanId`: upstream span that caused this service entry, or `null`.
- `serviceName`: service that recorded the trace.
- `method`, `path`, `url`: entrypoint identity.
- `request`, `response`: captured boundary values.
- `statusCode`: HTTP status when applicable.
- `status`: `ok` or `error`.
- `error`, `errorKind`: serialized failure and whether it was thrown or returned.
- `console`: console calls captured during this trace.
- `startedAt`, `durationMs`: wall-clock timing.
- `spans`: provider-level execution records.

## Span record

- `id`, `parentId`: local call-tree relationship.
- `kind`: controller, handler, interceptor, mediator, prehandler, or provider.
- `moduleId`, `moduleName`: DI scope owning the call.
- `className`, `registrationKey`, `methodName`: source lookup coordinates.
- `args`, `result`: captured call boundary values.
- `status`, `error`, `errorKind`: outcome and failure semantics.
- `durationMs`, `selfDurationMs`: total and exclusive duration.
- `console`: console calls captured inside the span.

## Diagnostic patterns

### Hidden downstream failure

A parent service is `ok` while a child service sharing the distributed trace is
`error`. Inspect the upstream provider result: a transport adapter may have
converted a failed response into an ordinary value.

### Wrong value transition

Find the earliest span whose input matches expectations but whose result does
not. Map that span to its class and method before inspecting later consumers.

### Duplicate side effect

Repeated sibling service traces or repeated provider spans with equivalent
arguments can indicate retrying, redelivery, or missing idempotency.

### Returned error

`errorKind: returned` means the method returned an error value rather than
throwing. Callers may need explicit branching even though normal control flow
continued.

### Performance

Use `selfDurationMs` to distinguish slow work inside a provider from time spent
awaiting traced children. Compare like-for-like traces before changing code.
