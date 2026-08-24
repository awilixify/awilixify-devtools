import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
	RecordSpanInput,
	RunInControllerTraceInput,
} from "awilixify/devtools";
import {
	AWILIXIFY_TRACE_CONTEXT_HEADER,
	getTracePropagationContext,
	isPromiseLike,
	isResultLike,
	parseTraceparent,
	runWithTracePropagationContext,
} from "awilixify/devtools";
import type {
	ConsoleEntry,
	ModuleGraphEntrypoint,
	Trace,
	TraceSpan,
} from "../dtos/index.js";
import { ResponseSanitizer } from "./response-sanitizer.js";
import type { ActiveTrace } from "./types.js";

// Resolves a traced controller method back to its non-HTTP entrypoint so the
// trace can carry the entrypoint kind/label instead of falling back to INVOKE.
export type EntrypointLookup = (
	className: string,
	methodName: string,
) => ModuleGraphEntrypoint | undefined;

const MAX_TRACES = 50;
const PLAYGROUND_TRACE_SPAN_KIND = {
	INVOKE: "provider",
	MIDDLEWARE: "prehandler",
} as const satisfies Record<string, TraceSpan["kind"]>;

export type TraceCreationListenerInput<T> = RunInControllerTraceInput<T> & {
	onTraceCreated?: (traceId: string) => void;
};

function getPlaygroundTraceSpanKind(method: string): TraceSpan["kind"] | null {
	return (
		PLAYGROUND_TRACE_SPAN_KIND[
			method as keyof typeof PLAYGROUND_TRACE_SPAN_KIND
		] ?? null
	);
}

function getPlaygroundTraceArgs(
	request: Trace["request"] | undefined,
	fallback: unknown[],
): unknown[] {
	const body = request?.body;

	if (body && typeof body === "object") {
		const args = (body as { args?: unknown }).args;
		if (Array.isArray(args)) return args;
	}

	return fallback;
}

export class DevtoolsTraceStore {
	private readonly storage = new AsyncLocalStorage<ActiveTrace>();
	private readonly responseSanitizer = new ResponseSanitizer();
	private readonly traces: Trace[] = [];
	private readonly traceExcludePaths: ReadonlySet<string>;
	private nextTraceId = 1;
	private pendingWrite: Promise<void> = Promise.resolve();

	constructor(
		private readonly serviceName: string,
		private readonly historyFile: string | null = null,
		private readonly findEntrypoint: EntrypointLookup = () => undefined,
		traceExcludePaths: readonly string[] = [],
	) {
		this.traceExcludePaths = new Set(
			traceExcludePaths.map((path) => normalizeRoutePath(path)),
		);
		this.loadPersistedTraces();
	}

	private readonly traceListeners = new Set<(trace: Trace) => void>();

	getTraces(): Trace[] {
		return [...this.traces];
	}

	// Notifies subscribers whenever a trace finishes, so a live stream (SSE) can
	// push new traces to the UI instead of relying on polling.
	subscribe(listener: (trace: Trace) => void): () => void {
		this.traceListeners.add(listener);

		return () => {
			this.traceListeners.delete(listener);
		};
	}

	private emitTrace(trace: Trace): void {
		for (const listener of this.traceListeners) {
			try {
				listener(trace);
			} catch {
				// A failing subscriber must not break trace recording.
			}
		}
	}

	getTrace(traceId: string): Trace | null {
		return this.traces.find((trace) => trace.id === traceId) ?? null;
	}

	clearTraces(): void {
		this.traces.length = 0;
		this.persistTraces();
	}

	deleteTrace(traceId: string): boolean {
		const index = this.traces.findIndex((trace) => trace.id === traceId);

		if (index === -1) return false;

		this.traces.splice(index, 1);
		this.persistTraces();

		return true;
	}

	private loadPersistedTraces(): void {
		if (!this.historyFile) return;

		let persisted: unknown;

		try {
			persisted = JSON.parse(fs.readFileSync(this.historyFile, "utf8"));
		} catch {
			// Missing or corrupt history file - start with an empty history.
			return;
		}

		if (!Array.isArray(persisted)) return;

		this.traces.push(...(persisted as Trace[]).slice(0, MAX_TRACES));

		// Ids must keep growing past the persisted ones, otherwise a restarted
		// process would mint duplicates of trace ids already in the history.
		for (const trace of this.traces) {
			const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)--trace-(\d+)$/.exec(trace.id);
			if (match) {
				this.nextTraceId = Math.max(this.nextTraceId, Number(match[2]) + 1);
			}
		}
	}

	private persistTraces(): void {
		const historyFile = this.historyFile;

		if (!historyFile) return;

		const snapshot = JSON.stringify(this.traces);

		// Chain writes so concurrent requests never interleave file contents;
		// write to a temp file + rename so a killed process can't corrupt it.
		this.pendingWrite = this.pendingWrite.then(async () => {
			try {
				await fs.promises.mkdir(path.dirname(historyFile), {
					recursive: true,
				});
				await fs.promises.writeFile(`${historyFile}.tmp`, snapshot);
				await fs.promises.rename(`${historyFile}.tmp`, historyFile);
			} catch {
				// Persistence is best-effort; tracing must never break the app.
			}
		});
	}

	recordSpan<T>(input: RecordSpanInput<T>): T | Promise<T> {
		const activeTrace = this.storage.getStore();

		if (!activeTrace) return input.callback();

		const consoleEntries: ConsoleEntry[] = [];
		const span: TraceSpan = {
			id: `${activeTrace.trace.id}:span-${activeTrace.counter.nextSpanId++}`,
			parentId: activeTrace.currentSpanId,
			kind: input.kind,
			label: [input.moduleName, input.className, input.methodName].join("."),
			moduleId: input.moduleId ?? null,
			moduleName: input.moduleName,
			className: input.className,
			registrationKey: input.registrationKey,
			methodName: input.methodName,
			args: this.responseSanitizer.sanitize(input.args) as unknown[],
			result: null,
			error: null,
			startedAt: Date.now(),
			durationMs: 0,
			selfDurationMs: 0,
			status: "ok",
			console: consoleEntries,
		};

		activeTrace.trace.spans.push(span);

		const finish = () => {
			span.durationMs = Date.now() - span.startedAt;
			if (input.getProceedDurationMs) {
				activeTrace.proceedDurationMsBySpanId.set(
					span.id,
					input.getProceedDurationMs(),
				);
			}
		};

		return this.storage.run(
			{
				...activeTrace,
				currentSpanId: span.id,
				currentConsoleEntries: consoleEntries,
			},
			() => {
				try {
					const result = input.callback();

					if (isPromiseLike(result)) {
						return result
							.then(
								(value) => {
									this.applySpanResult(span, value);
									return value;
								},
								(error) => {
									span.status = "error";
									span.error = this.responseSanitizer.toTraceError(error);
									span.errorKind = "thrown";
									throw error;
								},
							)
							.finally(finish);
					}

					this.applySpanResult(span, result);
					finish();
					return result;
				} catch (error) {
					span.status = "error";
					span.error = this.responseSanitizer.toTraceError(error);
					span.errorKind = "thrown";
					finish();

					throw error;
				}
			},
		);
	}

	// Errors returned as values (Result.error) are failures just like thrown
	// errors, so spans surface them the same way.
	private applySpanResult(span: TraceSpan, value: unknown): void {
		span.result = this.responseSanitizer.sanitize(value);

		if (isResultLike(value) && !value.ok) {
			span.status = "error";
			span.error = this.responseSanitizer.toTraceError(value.error);
			span.errorKind = "returned";
		}
	}

	runInCurrentSpan<T>(callback: () => T | Promise<T>): T | Promise<T> {
		const activeTrace = this.storage.getStore();

		if (!activeTrace) return callback();

		const currentSpan = activeTrace.trace.spans.find(
			(span) => span.id === activeTrace.currentSpanId,
		);

		if (!currentSpan) return callback();

		return this.storage.run(
			{
				...activeTrace,
				currentConsoleEntries: currentSpan.console,
			},
			callback,
		);
	}

	/**
	 * Starts a controller trace context without recording a span.
	 * Used to wrap around interceptors so they can record spans before the controller span.
	 */
	runInControllerTrace<T>(input: RunInControllerTraceInput<T>): T | Promise<T> {
		// If already in a trace, just run the callback
		if (this.storage.getStore()) {
			return input.callback();
		}

		// Skip DevTools traffic and explicitly excluded application routes.
		const requestInfo = this.responseSanitizer.getRequestInfo(input.args);
		if (
			requestInfo.path?.startsWith("/__devtools") ||
			(requestInfo.path !== undefined &&
				this.traceExcludePaths.has(normalizeRoutePath(requestInfo.path)))
		) {
			return input.callback();
		}

		const activeTrace = this.createTraceContext(input);
		this.captureReplySend(activeTrace, input.args);

		return runWithTracePropagationContext(activeTrace.propagationContext, () =>
			this.storage.run(activeTrace, () => {
				try {
					const result = input.callback();

					if (isPromiseLike(result)) {
						return result.then(
							(value) => {
								this.finishTrace({ response: value, args: input.args });
								return value;
							},
							(error) => {
								this.finishTrace({ error, args: input.args });
								throw error;
							},
						);
					}

					this.finishTrace({ response: result, args: input.args });
					return result;
				} catch (error) {
					this.finishTrace({ error, args: input.args });
					throw error;
				}
			}),
		);
	}

	private createTraceContext(
		input: TraceCreationListenerInput<unknown>,
	): ActiveTrace {
		const requestInfo = this.responseSanitizer.getRequestInfo(input.args);
		const parentContext =
			parseTraceparent(getTraceContextHeader(requestInfo.request?.headers)) ??
			getTracePropagationContext();
		const label = `${input.moduleName}.${input.className}.${input.methodName}`;
		const rootConsoleEntries: ConsoleEntry[] = [];

		// A non-HTTP root invocation is either a plain provider call (playground)
		// or a decorated entrypoint firing (rabbit/cron/events). The args can't
		// tell them apart, so resolve it from the entrypoint the framework
		// registered for this controller method.
		const entrypoint =
			requestInfo.method === "INVOKE" || requestInfo.method === "ENTRYPOINT"
				? this.findEntrypoint(input.className, input.methodName)
				: undefined;
		const method = entrypoint ? "ENTRYPOINT" : requestInfo.method;

		const trace: Trace = {
			id: `${this.serviceName}--trace-${this.nextTraceId++}`,
			distributedTraceId: parentContext?.traceId ?? createTraceId(),
			spanId: createSpanId(),
			parentSpanId: parentContext?.spanId ?? null,
			serviceName: this.serviceName,
			method,
			...(entrypoint
				? { entrypoint: { type: entrypoint.type, label: entrypoint.label } }
				: {}),
			path: requestInfo.path ?? label,
			url: requestInfo.url ?? label,
			request: requestInfo.request ?? {
				args: this.responseSanitizer.sanitize(input.args),
			},
			response: null,
			error: null,
			statusCode: null,
			startedAt: Date.now(),
			durationMs: 0,
			status: "ok",
			spans: [],
			console: [],
		};
		input.onTraceCreated?.(trace.id);
		const counter = {
			nextSpanId: 1,
		};
		const playgroundSpanKind = getPlaygroundTraceSpanKind(method);
		const rootSpan: TraceSpan = {
			id: `${trace.id}:span-0`,
			parentId: null,
			kind: playgroundSpanKind ?? "controller",
			label:
				method === "INVOKE" || method === "ENTRYPOINT"
					? label
					: `${method} ${trace.path}`,
			moduleId: null,
			moduleName: input.moduleName,
			className: input.className,
			registrationKey: input.registrationKey,
			methodName: input.methodName,
			args: this.responseSanitizer.sanitize(
				playgroundSpanKind
					? getPlaygroundTraceArgs(requestInfo.request, input.args)
					: input.args,
			) as unknown[],
			result: null,
			error: null,
			startedAt: Date.now(),
			durationMs: 0,
			selfDurationMs: 0,
			status: "ok",
			console: rootConsoleEntries,
		};

		if (playgroundSpanKind) {
			trace.spans.push(rootSpan);
		}

		return {
			trace,
			propagationContext: {
				traceId: trace.distributedTraceId,
				spanId: trace.spanId,
				traceFlags: parentContext?.traceFlags ?? "01",
			},
			currentSpanId: playgroundSpanKind ? rootSpan.id : null,
			currentConsoleEntries: rootConsoleEntries,
			counter,
			proceedDurationMsBySpanId: new Map(),
			rootSpan,
			finished: false,
			restoreConsole: this.setupConsoleCapture(),
			replyCapture: {
				sent: false,
				payload: undefined,
			},
		};
	}

	/**
	 * The app's HTTP layer can send a different payload than the controller
	 * returned (e.g. a failed Result mapped to an HTTP error body), so record
	 * what actually goes through reply.send().
	 */
	private captureReplySend(activeTrace: ActiveTrace, args?: unknown[]): void {
		const reply = args?.[1] as { send?: unknown } | undefined;

		if (!reply || typeof reply.send !== "function") return;

		const originalSend = reply.send as (...sendArgs: unknown[]) => unknown;

		reply.send = (...sendArgs: unknown[]) => {
			activeTrace.replyCapture.sent = true;
			activeTrace.replyCapture.payload = sendArgs[0];

			return originalSend.apply(reply, sendArgs);
		};
	}

	private finishTrace(options: {
		error?: unknown;
		response?: unknown;
		args?: unknown[];
	}): void {
		const activeTrace = this.storage.getStore();

		if (!activeTrace || activeTrace.finished) return;

		const { rootSpan, trace } = activeTrace;

		activeTrace.finished = true;
		activeTrace.restoreConsole();
		rootSpan.durationMs = Date.now() - rootSpan.startedAt;
		rootSpan.selfDurationMs = rootSpan.durationMs;
		trace.durationMs = rootSpan.durationMs;
		this.finalizeSpanSelfDurations(
			trace,
			activeTrace.proceedDurationMsBySpanId,
		);

		// Errors returned as values (Result.error) fail the trace like thrown ones.
		const resultError =
			isResultLike(options.response) && !options.response.ok
				? options.response.error
				: undefined;
		const error = options.error !== undefined ? options.error : resultError;

		if (error !== undefined) {
			const traceError = this.responseSanitizer.toTraceError(error);
			const errorKind = options.error !== undefined ? "thrown" : "returned";

			rootSpan.status = "error";
			rootSpan.error = traceError;
			rootSpan.errorKind = errorKind;
			trace.status = "error";
			trace.error = traceError;
			trace.errorKind = errorKind;
			trace.response = this.responseSanitizer.sanitize(
				options.error !== undefined
					? (this.extractErrorResponse(options.error) ?? null)
					: options.response,
			);
		} else {
			rootSpan.result = this.responseSanitizer.sanitize(options.response);
			trace.response = this.responseSanitizer.sanitize(options.response);
		}

		trace.statusCode = this.extractStatusCode(
			options.args,
			options.response,
			error,
		);

		this.traces.unshift(trace);
		this.traces.splice(MAX_TRACES);
		this.trackFinalReply(activeTrace, options.args);
		this.persistTraces();
		this.emitTrace(trace);
	}

	/**
	 * The traced controller returns before the HTTP layer maps its return value
	 * onto the reply (e.g. a failed Result becoming a 404 with a mapped error
	 * body), so the status code and response read in finishTrace can be stale.
	 * Re-read them once the response was actually sent.
	 */
	private trackFinalReply(activeTrace: ActiveTrace, args?: unknown[]): void {
		const { replyCapture, trace } = activeTrace;
		const reply = args?.[1] as
			| {
					once?: unknown;
					raw?: {
						once?: (event: string, callback: () => void) => void;
						statusCode?: unknown;
						writableEnded?: boolean;
					};
					statusCode?: unknown;
			  }
			| undefined;
		// Fastify wraps the raw response in reply.raw; in Express-style
		// frameworks the reply itself is the raw http.ServerResponse.
		const raw =
			reply?.raw ??
			(typeof reply?.once === "function"
				? (reply as NonNullable<typeof reply>["raw"])
				: undefined);

		if (!raw || typeof raw.once !== "function") return;

		const updateFromReply = () => {
			const statusCode =
				typeof reply?.statusCode === "number"
					? reply.statusCode
					: raw.statusCode;
			let changed = false;

			if (typeof statusCode === "number" && statusCode !== trace.statusCode) {
				trace.statusCode = statusCode;
				changed = true;
			}

			if (replyCapture.sent) {
				trace.response = this.responseSanitizer.sanitize(replyCapture.payload);
				changed = true;
			}

			if (changed) this.persistTraces();
		};

		if (raw.writableEnded) {
			updateFromReply();
		} else {
			raw.once("finish", updateFromReply);
		}
	}

	private finalizeSpanSelfDurations(
		trace: Trace,
		proceedDurationMsBySpanId: Map<string, number>,
	): void {
		const childrenByParentId = new Map<string, TraceSpan[]>();

		for (const span of trace.spans) {
			if (!span.parentId) continue;

			const children = childrenByParentId.get(span.parentId) ?? [];
			children.push(span);
			childrenByParentId.set(span.parentId, children);
		}

		for (const span of trace.spans) {
			const proceedDurationMs = proceedDurationMsBySpanId.get(span.id);
			const nestedDurationMs =
				proceedDurationMs ??
				this.getChildIntervalDurationMs(span, childrenByParentId);

			span.selfDurationMs = Math.max(0, span.durationMs - nestedDurationMs);
		}
	}

	private getChildIntervalDurationMs(
		span: TraceSpan,
		childrenByParentId: Map<string, TraceSpan[]>,
	): number {
		const children = childrenByParentId.get(span.id);
		if (!children || children.length === 0) return 0;

		const spanStart = span.startedAt;
		const spanEnd = span.startedAt + span.durationMs;
		const intervals = children
			.map((child) => ({
				end: Math.min(spanEnd, child.startedAt + child.durationMs),
				start: Math.max(spanStart, child.startedAt),
			}))
			.filter((interval) => interval.end > interval.start)
			.sort((left, right) => left.start - right.start);

		let durationMs = 0;
		let currentStart: number | null = null;
		let currentEnd: number | null = null;

		for (const interval of intervals) {
			if (currentStart === null || currentEnd === null) {
				currentStart = interval.start;
				currentEnd = interval.end;
				continue;
			}

			if (interval.start <= currentEnd) {
				currentEnd = Math.max(currentEnd, interval.end);
				continue;
			}

			durationMs += currentEnd - currentStart;
			currentStart = interval.start;
			currentEnd = interval.end;
		}

		if (currentStart !== null && currentEnd !== null) {
			durationMs += currentEnd - currentStart;
		}

		return durationMs;
	}

	private extractStatusCode(
		args?: unknown[],
		response?: unknown,
		error?: unknown,
	): number | null {
		const errorStatusCode = this.extractErrorStatusCode(error);
		if (errorStatusCode !== null) return errorStatusCode;

		// Try to get status code from response object (e.g., Fastify reply)
		if (args?.[1] && typeof args[1] === "object") {
			const reply = args[1] as { statusCode?: unknown };
			if (typeof reply.statusCode === "number") {
				return reply.statusCode;
			}
		}

		// Try to get from response if it has statusCode
		if (response && typeof response === "object") {
			const resp = response as { statusCode?: unknown };
			if (typeof resp.statusCode === "number") {
				return resp.statusCode;
			}
		}

		return error === undefined ? null : 500;
	}

	private extractErrorStatusCode(error: unknown): number | null {
		if (!error || typeof error !== "object") return null;

		const errorObject = error as {
			getStatus?: unknown;
			status?: unknown;
			statusCode?: unknown;
		};

		if (typeof errorObject.getStatus === "function") {
			const status = errorObject.getStatus();
			if (typeof status === "number") return status;
		}

		if (typeof errorObject.statusCode === "number")
			return errorObject.statusCode;
		if (typeof errorObject.status === "number") return errorObject.status;

		return null;
	}

	private extractErrorResponse(error: unknown): unknown {
		if (!error || typeof error !== "object") return undefined;

		const errorObject = error as {
			getResponse?: unknown;
			message?: unknown;
		};

		if (typeof errorObject.getResponse === "function") {
			return errorObject.getResponse();
		}

		const statusCode = this.extractErrorStatusCode(error);
		if (statusCode !== null) {
			return {
				message:
					typeof errorObject.message === "string"
						? errorObject.message
						: "Request failed",
				statusCode,
			};
		}

		return undefined;
	}

	private setupConsoleCapture(): () => void {
		const original = {
			log: console.log,
			info: console.info,
			warn: console.warn,
			error: console.error,
		};

		const wrap =
			(level: ConsoleEntry["level"]) =>
			(...args: unknown[]) => {
				const activeTrace = this.storage.getStore();
				if (activeTrace) {
					activeTrace.currentConsoleEntries.push({
						level,
						args: args.map((arg) => this.responseSanitizer.sanitize(arg)),
					});
				}
				original[level](...args);
			};

		console.log = wrap("log");
		console.info = wrap("info");
		console.warn = wrap("warn");
		console.error = wrap("error");

		return () => {
			console.log = original.log;
			console.info = original.info;
			console.warn = original.warn;
			console.error = original.error;
		};
	}
}

function normalizeRoutePath(routePath: string): string {
	if (routePath === "/") return routePath;

	return routePath.replace(/\/+$/, "");
}

function getTraceContextHeader(
	headers: unknown,
): string | string[] | undefined {
	if (!headers || typeof headers !== "object") return undefined;

	const get = (headers as { get?: unknown }).get;
	if (typeof get === "function") {
		const value = get.call(headers, AWILIXIFY_TRACE_CONTEXT_HEADER);
		return typeof value === "string" ? value : undefined;
	}

	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() !== AWILIXIFY_TRACE_CONTEXT_HEADER) continue;
		if (typeof value === "string") return value;
		if (Array.isArray(value)) {
			return value.filter((item): item is string => typeof item === "string");
		}
	}

	return undefined;
}

function createTraceId(): string {
	return createNonZeroHexId(16);
}

function createSpanId(): string {
	return createNonZeroHexId(8);
}

function createNonZeroHexId(byteLength: number): string {
	let id: string;

	do {
		id = randomBytes(byteLength).toString("hex");
	} while (/^0+$/.test(id));

	return id;
}
