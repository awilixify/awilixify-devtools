import { isResultLike } from "awilixify/devtools";
import type { Trace, TraceError } from "../dtos/index.js";

const MAX_DEPTH = 5;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 40;
const MAX_STRING_LENGTH = 2_000;

// Trace payloads are returned as JSON and rendered in the UI, so values must be
// bounded and serializable even when user code returns errors, cycles, or Result.
export class ResponseSanitizer {
	getRequestInfo(args: unknown[]): {
		method: string;
		path?: string;
		request?: Trace["request"];
		url?: string;
	} {
		const request = args[0];

		if (!request || typeof request !== "object") {
			return { method: "INVOKE" };
		}

		const requestObject = request as {
			body?: unknown;
			headers?: unknown;
			host?: unknown;
			method?: unknown;
			params?: unknown;
			protocol?: unknown;
			query?: unknown;
			routeOptions?: {
				url?: unknown;
			};
			routerPath?: unknown;
			url?: unknown;
		};

		if (typeof requestObject.method !== "string") {
			return { method: "INVOKE" };
		}

		const url =
			typeof requestObject.url === "string" ? requestObject.url : undefined;
		const fullUrl =
			url &&
			typeof requestObject.protocol === "string" &&
			typeof requestObject.host === "string"
				? `${requestObject.protocol}://${requestObject.host}${url}`
				: url;

		return {
			method: requestObject.method,
			path:
				typeof requestObject.routeOptions?.url === "string"
					? requestObject.routeOptions.url
					: typeof requestObject.routerPath === "string"
						? requestObject.routerPath
						: url,
			url: fullUrl,
			request: {
				body: requestObject.body,
				headers: requestObject.headers,
				params: requestObject.params,
				query: requestObject.query,
			},
		};
	}

	toTraceError(error: unknown): TraceError {
		if (error instanceof Error) {
			return {
				name: error.name,
				message: error.message,
				stack: error.stack,
			};
		}

		return {
			name: "Error",
			message: String(error),
		};
	}

	sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
		if (isResultLike(value)) {
			return this.sanitize(value.ok ? value.value : value.error, depth, seen);
		}

		if (value === undefined) return undefined;
		if (value === null) return null;

		if (typeof value === "string") {
			return value.length > MAX_STRING_LENGTH
				? `${value.slice(0, MAX_STRING_LENGTH)}...`
				: value;
		}

		if (
			typeof value === "number" ||
			typeof value === "boolean" ||
			typeof value === "bigint"
		) {
			return typeof value === "bigint" ? `${value}n` : value;
		}

		if (typeof value === "symbol" || typeof value === "function") {
			return String(value);
		}

		if (depth >= MAX_DEPTH) {
			return getPreview(value);
		}

		if (typeof value !== "object") return value;

		if (seen.has(value)) return "[Circular]";
		seen.add(value);

		if (Array.isArray(value)) {
			return value
				.slice(0, MAX_ARRAY_LENGTH)
				.map((item) => this.sanitize(item, depth + 1, seen));
		}

		if (value instanceof Error) return this.toTraceError(value);
		if (value instanceof Date) return value.toISOString();

		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([key]) => key !== "raw" && key !== "log")
				.slice(0, MAX_OBJECT_KEYS)
				.map(([key, entryValue]) => [
					key,
					this.sanitize(entryValue, depth + 1, seen),
				]),
		);
	}
}

function getPreview(value: unknown): string {
	if (Array.isArray(value)) return `[Array(${value.length})]`;
	if (value && typeof value === "object") {
		return `[${value.constructor?.name ?? "Object"}]`;
	}

	return String(value);
}
