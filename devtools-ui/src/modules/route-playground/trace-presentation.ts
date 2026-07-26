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

// Entrypoint kinds are sourced from the triggering decorator, whose type is a
// free-form description (e.g. "RabbitMQ listeners"). Normalize to a stable key
// so badge label and color stay consistent regardless of the exact wording.
function normalizeEntrypointKind(type: string): string {
	const value = type.toLowerCase();

	if (value.includes("rabbit") || value.includes("amqp")) return "rabbit";
	if (value.includes("cron") || value.includes("schedule")) return "cron";
	if (value.includes("event")) return "event";

	return value;
}

const ENTRYPOINT_KIND_LABELS: Record<string, string> = {
	rabbit: "RabbitMQ",
	cron: "Cron",
	event: "Events",
};

const ENTRYPOINT_KIND_COLORS: Record<string, string> = {
	rabbit: "orange",
	cron: "grape",
	event: "cyan",
};

// Badge text for a trace's origin: the decorator-derived entrypoint kind when
// present, otherwise the generic trace-kind label (Provider/Query/…).
export function getEntrypointBadgeLabel(trace: Trace): string {
	if (!trace.entrypoint) return getTraceKindLabel(trace.method);

	const kind = normalizeEntrypointKind(trace.entrypoint.type);

	return (
		ENTRYPOINT_KIND_LABELS[kind] ??
		`${trace.entrypoint.type.charAt(0).toUpperCase()}${trace.entrypoint.type.slice(1)}`
	);
}

// Badge color for entrypoint traces; undefined lets callers fall back to their
// default (provider) color for non-entrypoint traces.
export function getEntrypointBadgeColor(trace: Trace): string | undefined {
	if (!trace.entrypoint) return undefined;

	return ENTRYPOINT_KIND_COLORS[normalizeEntrypointKind(trace.entrypoint.type)];
}

// Listener name recorded on the entrypoint decorator (queue/routing key), shown
// as supplementary context alongside the badge.
export function getEntrypointListenerName(trace: Trace): string | null {
	return trace.entrypoint?.label || null;
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
