export function getMethodColor(method: string): string {
	switch (method) {
		case "GET":
			return "blue";
		case "POST":
			return "green";
		case "PUT":
			return "orange";
		case "PATCH":
			return "yellow";
		case "DELETE":
			return "red";
		// Non-HTTP traces reuse the span-kind palette from the trace tree:
		// provider calls are blue, queries cyan (handler), commands indigo
		// (mediator).
		case "INVOKE":
			return "blue";
		case "QUERY":
			return "cyan";
		case "COMMAND":
			return "indigo";
		case "ENTRYPOINT":
			return "grape";
		default:
			return "gray";
	}
}

export function getStatusCodeColor(statusCode: number | null) {
	if (!statusCode) return "dimmed";
	if (statusCode >= 400) return "red";
	if (statusCode >= 300) return "yellow";

	return "green";
}
