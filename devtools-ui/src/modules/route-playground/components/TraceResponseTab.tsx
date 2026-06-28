import { CodeHighlight } from "@mantine/code-highlight";
import { Alert, SimpleGrid, Stack, Text } from "@mantine/core";
import type { Trace } from "@/api/model";
import { isHttpTrace } from "../trace-presentation";
import styles from "./TraceResponseTab.module.css";

type ProviderCall = {
	args: unknown[];
	methodName: string;
	providerKey: string;
	scopeModuleId: string;
};

type TraceRequestSection = {
	code: string;
	language: "json" | "typescript";
	title: string;
};

type TraceResponseTabProps = {
	trace: Trace;
	noTraceWarning: boolean;
};

export function TraceResponseTab({
	trace,
	noTraceWarning,
}: TraceResponseTabProps) {
	const displayBody = trace.response;
	const requestSections = getTraceRequestSections(trace);
	const requestColumns = isHttpTrace(trace) ? 2 : 1;

	return (
		<Stack className={styles.tab} gap="md">
			{noTraceWarning && (
				<Alert color="yellow" title="No trace captured">
					Request completed but no trace was created. This can happen when fails
					happens before framework tracing monitoring start. In some HTTP native
					middlewares like schema validation.
				</Alert>
			)}

			<div className={styles.content}>
				<div className={styles.request}>
					<Text fw={700} size="sm">
						Request
					</Text>
					{requestSections.length > 0 ? (
						<SimpleGrid
							className={styles.requestGrid}
							cols={requestColumns}
							spacing="sm"
							style={{
								gridTemplateRows: `repeat(${Math.ceil(
									requestSections.length / requestColumns,
								)}, minmax(0, 1fr))`,
							}}
						>
							{requestSections.map((section) => (
								<CodeSection
									code={section.code}
									key={section.title}
									language={section.language}
									title={section.title}
								/>
							))}
						</SimpleGrid>
					) : (
						<Text c="dimmed" size="sm">
							No request input captured
						</Text>
					)}
				</div>

				<div className={styles.response}>
					<Text fw={700} size="sm">
						Response
					</Text>
					<CodeSection
						code={
							displayBody !== undefined
								? stringifyJson(displayBody)
								: "No response"
						}
						language="json"
						title="Body"
					/>
				</div>
			</div>
		</Stack>
	);
}

function CodeSection({
	code,
	language,
	title,
}: {
	code: string;
	language: "json" | "typescript";
	title: string;
}) {
	return (
		<div className={styles.codeSection}>
			<Text c="dimmed" fw={700} size="xs">
				{title}
			</Text>
			<CodeHighlight
				withLineNumbers
				className={styles.codeHighlight}
				code={code}
				language={language}
				styles={{
					codeWrapper: { minHeight: "100%" },
					scrollarea: { flex: 1, minHeight: 0 },
				}}
				withCopyButton={false}
			/>
		</div>
	);
}

function getTraceRequestSections(trace: Trace): TraceRequestSection[] {
	if (isHttpTrace(trace)) {
		return getHttpRequestSections(trace);
	}

	const call = getProviderCall(trace);

	if (call) {
		return [
			{
				code: formatProviderInvocation(call),
				language: "typescript",
				title: "Invocation",
			},
		];
	}

	return [
		{
			code: formatFallbackInvocation(trace),
			language: "typescript",
			title: "Invocation",
		},
	];
}

function getHttpRequestSections(trace: Trace): TraceRequestSection[] {
	return [
		getRequestSection(trace, "Params", "params"),
		getRequestSection(trace, "Query", "query"),
		getRequestSection(trace, "Body", "body"),
		getRequestSection(trace, "Headers", "headers"),
	].filter((section): section is TraceRequestSection => section !== null);
}

function formatProviderInvocation(call: ProviderCall): string {
	return formatInvocation(`${call.providerKey}.${call.methodName}`, call.args);
}

function formatFallbackInvocation(trace: Trace): string {
	const args = Array.isArray(trace.request.args) ? trace.request.args : [];
	return formatInvocation(trace.url, args);
}

function formatInvocation(target: string, args: unknown[]): string {
	if (args.length === 0) return `${target}()`;

	return `${target}(\n${args
		.map((arg) => `  ${indentTail(formatInvocationValue(arg), "  ")}`)
		.join(",\n")}\n)`;
}

function formatInvocationValue(value: unknown): string {
	return value === undefined ? "undefined" : JSON.stringify(value, null, 2);
}

function indentTail(value: string, indent: string): string {
	return value.replaceAll("\n", `\n${indent}`);
}

function getRequestSection(
	trace: Trace,
	title: string,
	key: keyof Trace["request"],
): TraceRequestSection | null {
	if (!hasOwn(trace.request, key)) return null;

	return {
		title,
		code: stringifyJson(trace.request[key]),
		language: "json",
	};
}

function getProviderCall(trace: Trace): ProviderCall | null {
	const body = trace.request?.body;

	if (!body || typeof body !== "object") return null;

	const call = body as Partial<ProviderCall>;

	if (
		!Array.isArray(call.args) ||
		typeof call.methodName !== "string" ||
		typeof call.providerKey !== "string" ||
		typeof call.scopeModuleId !== "string"
	) {
		return null;
	}

	return call as ProviderCall;
}

function hasOwn<T extends object, K extends PropertyKey>(
	value: T,
	key: K,
): value is T & Record<K, unknown> {
	return Object.hasOwn(value, key);
}

function stringifyJson(value: unknown): string {
	if (value === undefined) return "undefined";

	return JSON.stringify(value, null, 2);
}
