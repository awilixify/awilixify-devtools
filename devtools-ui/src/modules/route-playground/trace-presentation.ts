import type { Trace } from "@/api/model";

const HTTP_METHODS = new Set([
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"HEAD",
	"OPTIONS",
]);

// Chip labels for non-HTTP traces mirror the trace-tree badge naming.
const TRACE_KIND_LABELS: Record<string, string> = {
	ENTRYPOINT: "Entrypoint",
	INVOKE: "Provider",
	QUERY: "Query",
	COMMAND: "Command",
	MIDDLEWARE: "Middleware",
};

export function isHttpTrace(trace: Trace): boolean {
	return HTTP_METHODS.has(trace.method.toUpperCase());
}

export function getTraceKindLabel(method: string): string {
	return TRACE_KIND_LABELS[method] ?? method;
}

export function isMiddlewareTrace(trace: Trace): boolean {
	return trace.method === "MIDDLEWARE";
}

export function isEntrypointTrace(trace: Trace): boolean {
	return trace.method === "ENTRYPOINT";
}

// Non-HTTP invocations have no meaningful status code; they end OK, with a
// returned error (Result.error), or with a thrown error.
export function getTraceOutcome(trace: Trace): {
	color: string;
	label: string;
} {
	if (trace.status === "ok") return { color: "green", label: "OK" };

	return trace.errorKind === "returned"
		? { color: "red", label: "Error" }
		: { color: "red", label: "Throw" };
}
