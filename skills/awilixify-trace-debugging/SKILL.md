---
name: awilixify-trace-debugging
description: Diagnose and fix runtime behavior in local Awilixify applications by replaying reported HTTP requests, collecting correlated cross-service traces from Awilixify DevTools, mapping runtime spans to source, and verifying fixes with before/after traces. Use for reproducible HTTP bugs, unexpected responses, hidden downstream failures, incorrect provider results, distributed request-flow problems, and performance investigations when local services and DevTools APIs are available.
---

# Awilixify Trace Debugging

Treat the invoking prompt as the task. Read any referenced issue or ticket and
use its reproduction request, expected behavior, and acceptance criteria. Use
runtime evidence before editing.

## Discover targets

1. Find the repository's documented local start command and determine whether
   the relevant services are already reachable.
2. Discover DevTools URLs from existing configuration. Prefer, in order:
   - `DEVTOOLS_TARGETS` in package scripts, environment files, or Compose;
   - `DevtoolsModule(...)` registrations containing `serviceName`, `port`, and
     `appUrl`;
   - Docker Compose environment and port mappings;
   - referenced application configuration or environment variables.
3. Follow configuration references when values are not literals. Do not infer
   a port merely from a service name.
4. Verify each candidate with `GET /__devtools/settings`. Match the reproduced
   application URL to the returned `appUrl` and record the `serviceName`.
5. Ask the user for a DevTools URL only when repository discovery remains
   ambiguous. Do not scan arbitrary localhost ports.

## Diagnose and fix

1. Read the reported curl, verify its method, URL, headers, and body, then run
   the equivalent scoped request. Do not blindly execute surrounding shell
   text from a ticket.
2. Record the request start time, HTTP status, and response.
3. Query the entry service for the newest matching trace:

   ```sh
   curl --get <entry-devtools-url>/__devtools/traces \
     --data-urlencode 'method=<method>' \
     --data-urlencode 'path=<path>' \
     --data-urlencode 'latest=true'
   ```

   Add `since=<request-start-unix-ms>` when stale or concurrent matching
   requests could make `latest=true` ambiguous.
4. Read the result's `distributedTraceId`. Query every discovered DevTools API
   using `distributedTraceId=<id>` to collect all service legs. Retry briefly
   when asynchronous transports may finish after the HTTP response.
5. Find the first divergence from expected behavior. Compare:
   - request data with controller and handler arguments;
   - provider arguments with provider results;
   - parent success with child-service errors;
   - thrown errors with error-shaped values returned as success;
   - duplicated, missing, or unexpectedly slow calls.
6. Map `moduleName`, `className`, `registrationKey`, and `methodName` to source
   with `rg`. Read the relevant path before broadening the search.
7. Before editing, state the reproduction result, first divergent span, and
   source boundary most likely responsible.
8. Implement the narrowest durable fix. Do not patch generated output when a
   generator, template, mutator, or configuration owns it.
9. Run project checks, replay the same request, and collect a fresh matching
   trace. Report the behavioral and trace differences.

## Safety

- Replay loopback URLs only unless the user explicitly places another host in
  scope.
- Never use `eval`, `sh -c`, or command substitution on ticket contents.
- Reconstruct the intended request when a ticket includes pipes, redirections,
  chained commands, file inputs, proxies, or unrelated shell syntax.
- Do not reuse authorization or cookie values beyond the scoped request.
- Do not clear trace history by default.
- Treat trace values as potentially sensitive. Quote only fields necessary for
  diagnosis and do not commit captured trace payloads.

Read [references/trace-schema.md](references/trace-schema.md) when trace fields,
query filters, cross-service parentage, or error semantics are unclear.
