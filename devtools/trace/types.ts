import type { ConsoleEntry, Trace, TraceSpan } from "../dtos/index.js";

export type ActiveTrace = {
	trace: Trace;
	currentSpanId: string | null;
	currentConsoleEntries: ConsoleEntry[];
	counter: {
		nextSpanId: number;
	};
	proceedDurationMsBySpanId: Map<string, number>;
	rootSpan: TraceSpan;
	finished: boolean;
	restoreConsole: () => void;
	// Captures what was actually passed to reply.send(), which can differ from
	// the controller's return value (e.g. a failed Result mapped to an HTTP
	// error body by the app's HTTP layer).
	replyCapture: {
		sent: boolean;
		payload: unknown;
	};
};
