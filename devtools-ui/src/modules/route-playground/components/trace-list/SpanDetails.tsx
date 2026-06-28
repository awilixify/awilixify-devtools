import { CodeHighlight } from "@mantine/code-highlight";
import { ScrollArea, Stack, Text } from "@mantine/core";
import type { TraceSpan } from "@/api/model/index.js";
import { formatSpanLabel } from "../trace-tree/traceFormatting";
import { formatMethodCall } from "./MethodName";
import { stringifyPretty } from "./stringifyPretty";

/**
 * For interceptor spans, filters out devtools-only field (decoratorName)
 * from the trace context to show clean data in the details view.
 */
export function getDisplayArgs(span: TraceSpan): unknown[] {
	if (span.kind !== "interceptor") {
		return span.args;
	}

	const context = span.args[0];

	if (!context || typeof context !== "object") {
		return span.args;
	}

	const { decoratorName, ...cleanContext } = context as Record<string, unknown>;

	return [cleanContext, ...span.args.slice(1)];
}

type ConsoleEntry = {
	level: "log" | "info" | "warn" | "error";
	args: unknown[];
};

type SpanDetailsProps = {
	isOriginError?: boolean;
	span: TraceSpan | null;
	traceError?: unknown;
};

function CodeSection({ title, code }: { title: string; code: string }) {
	return (
		<Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
			<Text c="dimmed" fw={700} size="xs" style={{ flexShrink: 0 }}>
				{title}
			</Text>
			<ScrollArea
				style={{
					flex: 1,
					minHeight: 0,
					background: "var(--mantine-color-gray-0)",
					borderRadius: 4,
				}}
				type="auto"
			>
				<CodeHighlight
					code={code}
					language="typescript"
					withCopyButton={false}
				/>
			</ScrollArea>
		</Stack>
	);
}

export function SpanDetails({
	isOriginError = false,
	span,
	traceError,
}: SpanDetailsProps) {
	if (!span) {
		return (
			<Stack gap={6} style={{ minWidth: 0, height: "100%" }}>
				<Text c="dimmed" size="sm">
					Select a span
				</Text>
			</Stack>
		);
	}

	const resultValue = span.result;
	const errorValue = span.error === undefined ? traceError : span.error;

	const consoleCode =
		span.console.length > 0
			? span.console.map(formatConsoleCall).join("\n")
			: "// No console output";

	return (
		<Stack gap="xs" style={{ minWidth: 0, height: "100%" }}>
			<Text fw={700} size="sm" style={{ flexShrink: 0 }}>
				{formatSpanLabel(span, span.moduleName ?? null)}
			</Text>
			<CodeSection
				title="Call"
				code={formatMethodCall(span.methodName, getDisplayArgs(span))}
			/>
			<CodeSection
				title={
					span.status === "ok"
						? "Result"
						: isOriginError
							? span.errorKind === "returned"
								? "Returned error"
								: "Thrown error"
							: "Propagated error"
				}
				code={
					span.status === "ok"
						? `return ${stringifyPretty(resultValue)}`
						: formatErrorCode(errorValue, isOriginError, span.errorKind)
				}
			/>
			<CodeSection
				title={`Console (${span.console.length})`}
				code={consoleCode}
			/>
		</Stack>
	);
}

// Failed spans either threw or returned the error as a value (Result.error);
// mirror that in the shown pseudo-code. Old traces predate errorKind and are
// rendered as thrown.
function formatErrorCode(
	errorValue: unknown,
	isOriginError: boolean,
	errorKind: TraceSpan["errorKind"],
): string {
	const isReturned = errorKind === "returned";

	if (isOriginError) {
		return isReturned
			? `return Result.error(${stringifyPretty(errorValue)})`
			: `throw ${stringifyPretty(errorValue)}`;
	}

	const error =
		errorValue && typeof errorValue === "object"
			? (errorValue as { message?: unknown; name?: unknown })
			: null;
	const name = typeof error?.name === "string" ? error.name : "Error";
	const message =
		typeof error?.message === "string" ? error.message : String(errorValue);

	return `// Error propagated from a child span.\n${
		isReturned
			? `return Result.error(${name}: ${message})`
			: `throw ${name}: ${message}`
	}`;
}

function formatConsoleCall(entry: ConsoleEntry): string {
	const args = entry.args.map((arg) => stringifyPretty(arg)).join(", ");
	return `console.${entry.level}(${args})`;
}
