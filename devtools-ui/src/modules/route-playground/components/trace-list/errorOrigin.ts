import type { TraceSpan } from "@/api/model/index.js";

// Failed spans either threw or returned the error as a value (Result.error).
// Old persisted traces predate errorKind, so treat missing as thrown.
export function getErrorBadgeLabel(
	errorTone: "origin" | "propagated",
	errorKind: TraceSpan["errorKind"],
): string {
	if (errorTone === "origin") {
		return errorKind === "returned" ? "returns error" : "throws";
	}

	return errorKind === "returned" ? "propagated return" : "propagated";
}

export function getOriginErrorSpanIds(spans: TraceSpan[]): Set<string> {
	const spansByParentId = new Map<string, TraceSpan[]>();

	for (const span of spans) {
		if (!span.parentId) continue;

		const children = spansByParentId.get(span.parentId) ?? [];
		children.push(span);
		spansByParentId.set(span.parentId, children);
	}

	return new Set(
		spans
			.filter(
				(span) =>
					span.status === "error" && !hasErrorDescendant(span, spansByParentId),
			)
			.map((span) => span.id),
	);
}

function hasErrorDescendant(
	span: TraceSpan,
	spansByParentId: Map<string, TraceSpan[]>,
): boolean {
	const children = spansByParentId.get(span.id) ?? [];

	for (const child of children) {
		if (
			child.status === "error" ||
			hasErrorDescendant(child, spansByParentId)
		) {
			return true;
		}
	}

	return false;
}
