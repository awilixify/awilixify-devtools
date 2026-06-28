import {
	ActionIcon,
	Alert,
	Button,
	Group,
	Modal,
	Stack,
	Textarea,
	Tooltip,
} from "@mantine/core";
import { useState } from "react";
import { type RequestPayload, stringifyTemplate } from "./json-utils";

type CurlImportRoute = {
	id: string;
	method: string;
	path: string;
};

type CurlImportModalProps = {
	routes: CurlImportRoute[];
	onApply: (routeId: string, payload: RequestPayload) => void;
};

export function CurlImportModal({ routes, onApply }: CurlImportModalProps) {
	const [opened, setOpened] = useState(false);
	const [curlText, setCurlText] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleClose = () => {
		setError(null);
		setOpened(false);
	};

	const importCurl = () => {
		setError(null);

		try {
			const request = parseCurlCommand(curlText);
			const match = matchRoute(routes, request);

			if (!match) {
				const url = new URL(request.url, "http://localhost");
				setError(`No route matches ${request.method} ${url.pathname}`);
				return;
			}

			onApply(match.route.id, buildPayload(request, match.params));
			setCurlText("");
			handleClose();
		} catch (parseError) {
			setError(
				parseError instanceof Error ? parseError.message : String(parseError),
			);
		}
	};

	return (
		<>
			<Tooltip label="Import from curl">
				<ActionIcon
					color="gray"
					onClick={() => setOpened(true)}
					size="sm"
					variant="subtle"
				>
					<ImportIcon />
				</ActionIcon>
			</Tooltip>

			<Modal
				onClose={handleClose}
				opened={opened}
				size="lg"
				title="Import from curl"
			>
				<Stack gap="md">
					<Textarea
						autosize
						maxRows={12}
						minRows={6}
						onChange={(event) => setCurlText(event.currentTarget.value)}
						placeholder="curl 'http://localhost:3000/users/42?full=true' -H 'content-type: application/json' -d '{...}'"
						spellCheck={false}
						styles={{
							input: {
								fontSize: 13,
								fontFamily:
									"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
							},
						}}
						value={curlText}
					/>

					{error && (
						<Alert color="red" title="Cannot import">
							{error}
						</Alert>
					)}

					<Group justify="flex-end">
						<Button disabled={!curlText.trim()} onClick={importCurl}>
							Import
						</Button>
					</Group>
				</Stack>
			</Modal>
		</>
	);
}

function ImportIcon() {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="7 10 12 15 17 10" />
			<line x1="12" y1="15" x2="12" y2="3" />
		</svg>
	);
}

type ParsedCurl = {
	method: string;
	url: string;
	headers: Record<string, string>;
	data?: string;
};

// Flags that take a value we don't use — their value must be consumed so it
// isn't mistaken for the URL.
const IGNORED_VALUE_FLAGS = new Set([
	"-o",
	"--output",
	"-m",
	"--max-time",
	"--connect-timeout",
	"--retry",
	"-w",
	"--write-out",
	"-c",
	"--cookie-jar",
	"-x",
	"--proxy",
	"--cacert",
	"-F",
	"--form",
]);

const DATA_FLAGS = new Set([
	"-d",
	"--data",
	"--data-raw",
	"--data-binary",
	"--data-ascii",
]);

// Parses curl commands as produced by browser devtools ("Copy as cURL"),
// Postman and our own "Copy as curl" button. Unknown flags are skipped
// instead of failing, so extra flags are harmless.
function parseCurlCommand(command: string): ParsedCurl {
	const tokens = tokenizeShellCommand(command);
	const curlIndex = tokens.indexOf("curl");

	if (curlIndex === -1) {
		throw new Error("This doesn't look like a curl command.");
	}

	let method: string | null = null;
	let url: string | null = null;
	const headers: Record<string, string> = {};
	const dataParts: string[] = [];

	const setHeader = (name: string, value: string) => {
		headers[name] = value;
	};

	for (let i = curlIndex + 1; i < tokens.length; i++) {
		const token = tokens[i];

		if (token === "-X" || token === "--request") {
			method = tokens[++i]?.toUpperCase() ?? null;
		} else if (token.startsWith("-X") && token.length > 2) {
			method = token.slice(2).toUpperCase();
		} else if (token === "-H" || token === "--header") {
			const header = tokens[++i] ?? "";
			const separatorIndex = header.indexOf(":");
			if (separatorIndex > 0) {
				setHeader(
					header.slice(0, separatorIndex).trim(),
					header.slice(separatorIndex + 1).trim(),
				);
			}
		} else if (DATA_FLAGS.has(token)) {
			dataParts.push(tokens[++i] ?? "");
		} else if (token === "-b" || token === "--cookie") {
			setHeader("cookie", tokens[++i] ?? "");
		} else if (token === "-u" || token === "--user") {
			setHeader("authorization", `Basic ${btoa(tokens[++i] ?? "")}`);
		} else if (token === "-A" || token === "--user-agent") {
			setHeader("user-agent", tokens[++i] ?? "");
		} else if (token === "-e" || token === "--referer") {
			setHeader("referer", tokens[++i] ?? "");
		} else if (token === "--url") {
			url = tokens[++i] ?? null;
		} else if (IGNORED_VALUE_FLAGS.has(token)) {
			i++;
		} else if (token.startsWith("-")) {
			// boolean flag we don't care about (--compressed, -s, -L, ...)
		} else if (!url) {
			url = token;
		}
	}

	if (!url) {
		throw new Error("No URL found in the curl command.");
	}

	return {
		method: method ?? (dataParts.length > 0 ? "POST" : "GET"),
		url,
		headers,
		data: dataParts.length > 0 ? dataParts.join("&") : undefined,
	};
}

// Minimal shell tokenizer: single/double quotes, ANSI-C quoting ($'...',
// used by Chrome's "Copy as cURL" for bodies with special characters),
// backslash escapes and line continuations.
function tokenizeShellCommand(command: string): string[] {
	const text = command.replace(/\\\r?\n/g, " ");
	const tokens: string[] = [];
	let current = "";
	let hasCurrent = false;
	let quote: "'" | '"' | "ansi" | null = null;

	const ansiEscapes: Record<string, string> = {
		n: "\n",
		r: "\r",
		t: "\t",
		"\\": "\\",
		"'": "'",
		'"': '"',
	};

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (quote === "'") {
			if (char === "'") quote = null;
			else current += char;
			continue;
		}

		if (quote === "ansi") {
			if (char === "'") {
				quote = null;
			} else if (char === "\\") {
				const next = text[++i] ?? "";
				current += ansiEscapes[next] ?? `\\${next}`;
			} else {
				current += char;
			}
			continue;
		}

		if (quote === '"') {
			if (char === '"') {
				quote = null;
			} else if (char === "\\" && '"\\$`'.includes(text[i + 1] ?? "")) {
				current += text[++i];
			} else {
				current += char;
			}
			continue;
		}

		if (char === "$" && text[i + 1] === "'") {
			quote = "ansi";
			hasCurrent = true;
			i++;
			continue;
		}

		if (char === "'" || char === '"') {
			quote = char;
			hasCurrent = true;
			continue;
		}

		if (char === "\\") {
			current += text[++i] ?? "";
			hasCurrent = true;
			continue;
		}

		if (/\s/.test(char)) {
			if (hasCurrent) {
				tokens.push(current);
				current = "";
				hasCurrent = false;
			}
			continue;
		}

		current += char;
		hasCurrent = true;
	}

	if (hasCurrent) tokens.push(current);

	return tokens;
}

type RouteMatch = {
	route: CurlImportRoute;
	params: Record<string, string>;
	exactSegments: number;
};

function matchRoute(
	routes: CurlImportRoute[],
	request: ParsedCurl,
): RouteMatch | null {
	const url = new URL(request.url, "http://localhost");
	const pathSegments = url.pathname.split("/").filter(Boolean);

	let best: RouteMatch | null = null;

	for (const route of routes) {
		if (route.method.toUpperCase() !== request.method) continue;

		const routeSegments = route.path.split("/").filter(Boolean);
		if (routeSegments.length !== pathSegments.length) continue;

		const params: Record<string, string> = {};
		let exactSegments = 0;
		let matched = true;

		for (let i = 0; i < routeSegments.length; i++) {
			const routeSegment = routeSegments[i];

			if (routeSegment.startsWith(":")) {
				params[routeSegment.slice(1)] = decodeURIComponent(pathSegments[i]);
			} else if (routeSegment === pathSegments[i]) {
				exactSegments++;
			} else {
				matched = false;
				break;
			}
		}

		if (!matched) continue;

		// Prefer routes with more literal segments over param wildcards
		if (!best || exactSegments > best.exactSegments) {
			best = { route, params, exactSegments };
		}
	}

	return best;
}

function buildPayload(
	request: ParsedCurl,
	params: Record<string, string>,
): RequestPayload {
	return {
		params: stringifyTemplate(params),
		query: stringifyTemplate(extractQuery(request.url)),
		headers: stringifyTemplate(request.headers),
		body: stringifyTemplate(parseBody(request.data)),
	};
}

function extractQuery(rawUrl: string): Record<string, string | string[]> {
	const url = new URL(rawUrl, "http://localhost");
	const query: Record<string, string | string[]> = {};

	for (const [key, value] of url.searchParams.entries()) {
		const existing = query[key];
		if (existing === undefined) {
			query[key] = value;
		} else {
			query[key] = Array.isArray(existing)
				? [...existing, value]
				: [existing, value];
		}
	}

	return query;
}

function parseBody(data: string | undefined): unknown {
	if (data === undefined) return {};

	try {
		return JSON.parse(data);
	} catch {
		return data;
	}
}
