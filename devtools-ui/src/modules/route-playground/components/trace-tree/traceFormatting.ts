import type { TraceSpan } from "@/api/model/index.js";

export function formatSpanLabel(span: TraceSpan, moduleName: string | null) {
	if (!moduleName) return span.label;

	const modulePrefix = `${moduleName}.`;
	if (span.label.startsWith(modulePrefix)) {
		return span.label.slice(modulePrefix.length);
	}

	return span.label;
}

export function getSpanColor(kind: TraceSpan["kind"]) {
	switch (kind) {
		case "controller":
			return "teal";
		case "provider":
			return "blue";
		case "mediator":
			return "indigo";
		case "prehandler":
			return "violet";
		case "interceptor":
			return "orange";
		case "handler":
			return "cyan";
		default:
			return "gray";
	}
}
