import {
	ActionIcon,
	Alert,
	Badge,
	Button,
	Code,
	type ComboboxItem,
	Group,
	Paper,
	Select,
	Stack,
	Tabs,
	Text,
	Tooltip,
} from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import fetchToCurl from "fetch-to-curl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGetDevtoolsGraphSuspense } from "@/api/graph/graph";
import type { ModuleGraphRoute } from "@/api/model";
import { useGetDevtoolsSettings } from "@/api/settings/settings";
import { getMethodColor } from "../../http-method-color";
import type { RoutePlaygroundSearch } from "../../route";
import {
	formatStateField,
	isDefaultStateField,
	packUrlState,
	unpackUrlState,
} from "../../url-state";
import { useRoutePlaygroundSettings } from "../../use-route-playground-settings";
import { CopyIcon } from "../CopyIcon";
import { CurlImportModal } from "./CurlImportModal";
import { JsonEditor } from "./JsonEditor";
import {
	createSchemaTemplate,
	parseJsonObject,
	parseJsonValue,
	parsePayload,
	type RequestPayload,
	stringifyTemplate,
} from "./json-utils";
import { useInvocationTrace } from "./use-invocation-trace";
import type { RouteOccurrence } from "./use-provider-select-options";

export type PreparedFetchData = {
	url: string;
	method: string;
	body: string | undefined;
	headers: HeadersInit;
};

export type RoutePlaygroundResponse = {
	body: unknown;
	headers: Record<string, string>;
	ok: boolean;
	status: number;
	statusText: string;
};

const emptyPayload: RequestPayload = {
	params: "{}",
	query: "{}",
	headers: "{}",
	body: "{}",
};

export function RouteInvocationPaper() {
	const routeSearch = useSearch({ from: "/routes" });
	const navigate = useNavigate({ from: "/routes" });
	const { selectedRouteId, setSelectedRouteId } = useRoutePlaygroundSettings();
	const { data: graph } = useGetDevtoolsGraphSuspense();

	const updateRouteSearch = useCallback(
		(next: Partial<RoutePlaygroundSearch>) => {
			navigate({
				replace: true,
				search: (previous) => ({ ...previous, ...next }),
			});
		},
		[navigate],
	);
	const { startInvocation, finishInvocation } = useInvocationTrace();
	const { data: settings } = useGetDevtoolsSettings();
	const appUrl = settings?.appUrl?.replace(/\/$/, "") ?? "";

	const mutation = useMutation<
		RoutePlaygroundResponse,
		Error,
		PreparedFetchData
	>({
		mutationFn: async (fetchData) => {
			const response = await fetch(fetchData.url, {
				body: fetchData.body,
				headers: fetchData.headers,
				method: fetchData.method,
			});

			const text = await response.text();
			const isJson = response.headers
				.get("content-type")
				?.includes("application/json");

			return {
				body: isJson && text ? JSON.parse(text) : text,
				headers: Object.fromEntries(response.headers.entries()),
				ok: response.ok,
				status: response.status,
				statusText: response.statusText,
			};
		},
		onMutate: startInvocation,
		onSuccess: (data, fetchData) =>
			finishInvocation({
				method: fetchData.method,
				url: `${appUrl}${fetchData.url}`,
				statusCode: data.status,
				response: data.body,
				ok: data.ok,
			}),
	});

	const error = mutation.error
		? mutation.error instanceof Error
			? mutation.error.message
			: String(mutation.error)
		: null;

	const routes = useMemo(() => {
		return graph.modules
			.flatMap((module) =>
				(module.routes ?? []).map((route) => ({
					...route,
					id: `${module.id}:${route.method}:${route.path}:${route.controller}:${route.handler}`,
					value: `${module.id}:${route.method}:${route.path}:${route.controller}:${route.handler}`,
					moduleId: module.id,
					label: route.path,
					moduleName: module.name,
				})),
			)
			.sort((a, b) => formatRouteLabel(a).localeCompare(formatRouteLabel(b)));
	}, [graph]);

	const selectedRoute =
		routes.find((route) => route.id === selectedRouteId) ?? null;

	// The editors live in the URL as one packed `state` param so a request can
	// be shared as a link and replayed from trace history. Local state only
	// keeps the caret stable while typing.
	const editorsRef = useRef<HTMLDivElement>(null);
	const [payload, setPayload] = useState<RequestPayload>(
		() =>
			unpackRequestPayload(routeSearch.state) ??
			(selectedRoute ? createRequestPayload(selectedRoute) : emptyPayload),
	);

	useEffect(() => {
		if (editorsRef.current?.contains(document.activeElement)) return;

		setPayload(
			unpackRequestPayload(routeSearch.state) ??
				createRequestPayload(selectedRoute),
		);
	}, [routeSearch.state, selectedRoute]);

	const fieldErrors = useMemo(() => {
		const errors: Partial<Record<keyof RequestPayload, boolean>> = {};
		for (const key of ["params", "query", "headers", "body"] as const) {
			try {
				if (key === "body") {
					parseJsonValue(payload[key], key);
				} else {
					parseJsonObject(payload[key], key);
				}
			} catch {
				errors[key] = true;
			}
		}
		return errors;
	}, [payload]);

	const hasFieldErrors = Object.keys(fieldErrors).length > 0;

	const updatePayload = (key: keyof RequestPayload, value: string) => {
		const next = { ...payload, [key]: value };
		setPayload(next);

		// Invalid JSON keeps the last valid URL state; it syncs again once fixed.
		const packed = packRequestPayload(next);
		if (packed !== null) {
			updateRouteSearch({ state: packed });
		}
	};

	// Clear selectedRouteId if graph loaded and route not found
	useEffect(() => {
		if (!selectedRouteId) return;
		if (routes.some((route) => route.id === selectedRouteId)) return;

		setSelectedRouteId(null);
	}, [routes, selectedRouteId, setSelectedRouteId]);

	const handleRouteChange = (routeId: string | null) => {
		mutation.reset();

		const route = routes.find((candidate) => candidate.id === routeId) ?? null;
		setPayload(createRequestPayload(route));
		updateRouteSearch({ route: routeId ?? undefined, state: undefined });
	};

	const requestPreview = useMemo(() => {
		if (!selectedRoute) return "Select a route";

		try {
			return `${selectedRoute.method} ${appUrl}${buildRequestUrl({
				path: selectedRoute.path,
				params: parseJsonObject(payload.params, "Params"),
				query: parseJsonObject(payload.query, "Query"),
			})}`;
		} catch {
			return `${selectedRoute.method} ${appUrl}${selectedRoute.path}`;
		}
	}, [appUrl, payload.params, payload.query, selectedRoute]);

	const handleSubmit = () => {
		if (!selectedRoute || hasFieldErrors) return;

		mutation.mutate(prepareFetchData(selectedRoute, payload));
	};

	const [curlCopied, setCurlCopied] = useState(false);

	const copyCurl = async () => {
		if (!selectedRoute || hasFieldErrors) return;

		const fetchData = prepareFetchData(selectedRoute, payload);
		const curl = fetchToCurl(`${appUrl}${fetchData.url}`, {
			method: fetchData.method,
			headers: fetchData.headers,
			body: fetchData.body,
		});

		await navigator.clipboard.writeText(curl);
		setCurlCopied(true);
		window.setTimeout(() => setCurlCopied(false), 1200);
	};

	const handleCurlImport = (
		routeId: string,
		importedPayload: RequestPayload,
	) => {
		mutation.reset();
		setPayload(importedPayload);

		const packed = packRequestPayload(importedPayload);
		updateRouteSearch({
			route: routeId,
			state: packed === null ? undefined : packed,
		});
	};

	return (
		<Paper>
			<Stack gap="md">
				<Group align="flex-end" gap="sm" wrap="nowrap">
					<Select
						clearable
						data={routes}
						label="Route"
						leftSection={
							selectedRoute && (
								<Badge
									color={getMethodColor(selectedRoute.method)}
									size="xs"
									variant="filled"
									style={{ minWidth: 50 }}
								>
									{selectedRoute.method}
								</Badge>
							)
						}
						leftSectionWidth={selectedRoute ? 62 : undefined}
						nothingFoundMessage="No routes"
						onChange={handleRouteChange}
						placeholder="Select route"
						renderOption={({ option }) => {
							const { method, moduleName } = option as {
								method: string;
								moduleName: string;
							} & ComboboxItem;

							return (
								<Group gap="xs" wrap="nowrap">
									<Badge
										color={getMethodColor(method)}
										size="xs"
										variant="filled"
										style={{ minWidth: 50 }}
									>
										{method}
									</Badge>
									<Text size="sm" style={{ flex: 1 }} truncate>
										{option.label}
									</Text>
									<Badge color="gray" size="xs" variant="light">
										{moduleName}
									</Badge>
								</Group>
							);
						}}
						searchable
						style={{ flex: 1 }}
						value={selectedRouteId}
					/>
					<Button
						disabled={!selectedRoute || hasFieldErrors}
						loading={mutation.isPending}
						onClick={handleSubmit}
					>
						Send
					</Button>
				</Group>

				<Stack gap={6}>
					<Text fw={700} size="sm">
						Request
					</Text>
					<Group align="center" gap="xs" wrap="nowrap">
						<Tooltip label={requestPreview} maw={560} multiline openDelay={300}>
							<Code
								block
								style={{
									flex: 1,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{requestPreview}
							</Code>
						</Tooltip>
						<Stack gap={4}>
							<Tooltip label={curlCopied ? "Copied!" : "Copy as curl"}>
								<ActionIcon
									color={curlCopied ? "green" : "gray"}
									disabled={!selectedRoute || hasFieldErrors}
									onClick={copyCurl}
									size="sm"
									variant="subtle"
								>
									<CopyIcon />
								</ActionIcon>
							</Tooltip>
							<CurlImportModal onApply={handleCurlImport} routes={routes} />
						</Stack>
					</Group>
				</Stack>

				{error && (
					<Alert color="red" title="Request failed">
						{error}
					</Alert>
				)}

				<Tabs defaultValue="params" keepMounted={false} ref={editorsRef}>
					<Tabs.List>
						<Tabs.Tab value="params" c={fieldErrors.params ? "red" : undefined}>
							Params
						</Tabs.Tab>
						<Tabs.Tab value="query" c={fieldErrors.query ? "red" : undefined}>
							Query
						</Tabs.Tab>
						<Tabs.Tab value="body" c={fieldErrors.body ? "red" : undefined}>
							Body
						</Tabs.Tab>
						<Tabs.Tab
							value="headers"
							c={fieldErrors.headers ? "red" : undefined}
						>
							Headers
						</Tabs.Tab>
					</Tabs.List>

					<Tabs.Panel pt="sm" value="params">
						<JsonEditor
							value={payload.params}
							onChange={(value) => updatePayload("params", value)}
							hasError={fieldErrors.params}
						/>
					</Tabs.Panel>
					<Tabs.Panel pt="sm" value="query">
						<JsonEditor
							value={payload.query}
							onChange={(value) => updatePayload("query", value)}
							hasError={fieldErrors.query}
						/>
					</Tabs.Panel>
					<Tabs.Panel pt="sm" value="body">
						<JsonEditor
							value={payload.body}
							onChange={(value) => updatePayload("body", value)}
							hasError={fieldErrors.body}
						/>
					</Tabs.Panel>
					<Tabs.Panel pt="sm" value="headers">
						<JsonEditor
							value={payload.headers}
							onChange={(value) => updatePayload("headers", value)}
							hasError={fieldErrors.headers}
						/>
					</Tabs.Panel>
				</Tabs>
			</Stack>
		</Paper>
	);
}

function formatRouteLabel(route: RouteOccurrence): string {
	return `${route.method} ${route.path} (${route.moduleName})`;
}

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);
const METHODS_WITHOUT_BODY = new Set(["GET", "HEAD"]);

type RouteUrlState = {
	p?: unknown;
	q?: unknown;
	h?: unknown;
	b?: unknown;
};

const routeStateFields = [
	["p", "params"],
	["q", "query"],
	["h", "headers"],
	["b", "body"],
] as const satisfies readonly [keyof RouteUrlState, keyof RequestPayload][];

function unpackRequestPayload(
	packed: string | undefined,
): RequestPayload | null {
	const state = unpackUrlState<RouteUrlState>(packed);

	if (!state || typeof state !== "object") return null;

	return {
		params: formatStateField(state.p),
		query: formatStateField(state.q),
		headers: formatStateField(state.h),
		body: formatStateField(state.b),
	};
}

// Returns undefined to clear the state param, null when some editor is not
// parseable yet and the URL should keep its last valid value.
function packRequestPayload(
	payload: RequestPayload,
): string | undefined | null {
	const state: RouteUrlState = {};

	for (const [stateKey, payloadKey] of routeStateFields) {
		const text = payload[payloadKey].trim();

		if (!text) continue;

		try {
			const value = JSON.parse(text);
			if (isDefaultStateField(value)) continue;

			state[stateKey] = value;
		} catch {
			return null;
		}
	}

	return Object.keys(state).length > 0 ? packUrlState(state) : undefined;
}

function createRequestPayload(route: ModuleGraphRoute | null): RequestPayload {
	const hasBody = route && METHODS_WITH_BODY.has(route.method);
	const headers = hasBody ? { "content-type": "application/json" } : {};

	return {
		params: stringifyTemplate(createSchemaTemplate(route?.schema?.params)),
		query: stringifyTemplate(createSchemaTemplate(route?.schema?.querystring)),
		headers: stringifyTemplate(headers),
		body: stringifyTemplate(createSchemaTemplate(route?.schema?.body)),
	};
}

export function buildRequestUrl({
	path,
	params,
	query,
}: {
	path: string;
	params: Record<string, unknown>;
	query: Record<string, unknown>;
}): string {
	const resolvedPath = path.replace(/:([A-Za-z0-9_]+)/g, (_match, key) =>
		encodeURIComponent(String(params[key] ?? "")),
	);
	const searchParams = new URLSearchParams();

	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") continue;
		if (Array.isArray(value)) {
			for (const item of value) {
				searchParams.append(key, String(item));
			}
			continue;
		}
		searchParams.set(key, String(value));
	}

	const search = searchParams.toString();

	return search ? `${resolvedPath}?${search}` : resolvedPath;
}

// Payload JSON is validated via fieldErrors before submit, so parsing here
// cannot throw.
function prepareFetchData(
	route: Pick<ModuleGraphRoute, "method" | "path">,
	payload: RequestPayload,
): PreparedFetchData {
	const { params, query, headers, body } = parsePayload(payload);

	const url = buildRequestUrl({ path: route.path, params, query });
	const hasBody = !METHODS_WITHOUT_BODY.has(route.method);

	return {
		url,
		method: route.method,
		body: hasBody ? JSON.stringify(body) : undefined,
		headers: Object.fromEntries(
			Object.entries(headers).map(([key, value]) => [key, String(value)]),
		),
	};
}
