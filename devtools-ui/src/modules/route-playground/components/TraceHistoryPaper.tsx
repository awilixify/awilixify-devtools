import {
	ActionIcon,
	Badge,
	Button,
	Group,
	Menu,
	Paper,
	ScrollArea,
	Stack,
	Text,
	Tooltip,
} from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import fetchToCurl from "fetch-to-curl";
import { useState } from "react";
import { useGetDevtoolsGraphSuspense } from "@/api/graph/graph";
import type { GetGraphResponse, Trace } from "@/api/model";
import {
	usePostDevtoolsPlaygroundInvoke,
	usePostDevtoolsPlaygroundInvokeHandler,
} from "@/api/playground/playground";
import { useGetDevtoolsSettings } from "@/api/settings/settings";
import {
	useDeleteDevtoolsTraces,
	useDeleteDevtoolsTracesTraceId,
	useGetDevtoolsTraces,
} from "@/api/traces/traces";
import type { GraphRouteSearch } from "../../app/router";
import { getMethodColor, getStatusCodeColor } from "../http-method-color";
import type { RoutePlaygroundSearch } from "../route";
import {
	getTraceKindLabel,
	getTraceOutcome,
	isEntrypointTrace,
	isHttpTrace,
	isMiddlewareTrace,
} from "../trace-presentation";
import { packDefinedFields, packUrlState } from "../url-state";
import {
	RoutePlaygroundModes,
	useRoutePlaygroundSettings,
} from "../use-route-playground-settings";
import { CopyIcon } from "./CopyIcon";
import { formatEntrypointId } from "./invocation-paper/EntrypointInvocationPaper";
import { MethodName } from "./trace-list/MethodName";
import { getSpanColor } from "./trace-tree/traceFormatting";

// Provider invocations are traced with a fake request whose body carries the
// actual call.
type ProviderCall = {
	args: unknown[];
	methodName: string;
	providerKey: string;
	scopeModuleId: string;
};

export function TraceHistoryPaper() {
	const navigate = useNavigate({ from: "/routes" });
	const { selectedTraceId, setSelectedTraceId } = useRoutePlaygroundSettings();
	const { data: traces = [], refetch } = useGetDevtoolsTraces();
	const { data: graph } = useGetDevtoolsGraphSuspense();
	const { data: settings } = useGetDevtoolsSettings();
	const appUrl = settings?.appUrl?.replace(/\/$/, "") ?? "";

	const selectedTrace = traces.find((trace) => trace.id === selectedTraceId);
	const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);
	const [copiedCurlTraceId, setCopiedCurlTraceId] = useState<string | null>(
		null,
	);

	const deleteTraces = useDeleteDevtoolsTraces({
		mutation: {
			onSuccess: () => {
				setSelectedTraceId(null);
				refetch();
			},
		},
	});

	const deleteTrace = useDeleteDevtoolsTracesTraceId({
		mutation: {
			onSuccess: (_response, variables) => {
				if (selectedTraceId === variables.traceId) {
					setSelectedTraceId(null);
				}
				refetch();
			},
		},
	});

	const copyTrace = async (trace: Trace, event: React.MouseEvent) => {
		event.stopPropagation();
		await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
		setCopiedTraceId(trace.id);
		window.setTimeout(() => setCopiedTraceId(null), 1200);
	};

	const copyTraceCurl = async (trace: Trace, event: React.MouseEvent) => {
		event.stopPropagation();

		const url = trace.url.startsWith("/") ? `${appUrl}${trace.url}` : trace.url;
		const headers = getRecordedHeaders(trace);
		const body =
			trace.request.body === undefined
				? undefined
				: typeof trace.request.body === "string"
					? trace.request.body
					: JSON.stringify(trace.request.body);

		const curl = fetchToCurl(url, {
			method: trace.method,
			headers,
			body,
		});

		await navigator.clipboard.writeText(curl);
		setCopiedCurlTraceId(trace.id);
		window.setTimeout(() => setCopiedCurlTraceId(null), 1200);
	};

	const selectNewTrace = async (response: { traceId: string }) => {
		await refetch();
		setSelectedTraceId(response.traceId);
	};

	const rerunInvokeMutation = usePostDevtoolsPlaygroundInvoke({
		mutation: { onSuccess: selectNewTrace },
	});
	const rerunHandlerMutation = usePostDevtoolsPlaygroundInvokeHandler({
		mutation: { onSuccess: selectNewTrace },
	});

	// Re-executes the recorded invocation as-is, without a playground detour.
	const rerunTrace = async (trace: Trace) => {
		if (isHttpTrace(trace)) {
			// Relative URLs go through the devtools server's app proxy, exactly
			// like route playground requests.
			const url = new URL(trace.url, appUrl || "http://localhost");
			const headers = Object.fromEntries(
				Object.entries(getRecordedHeaders(trace)).filter(
					([key]) =>
						!["connection", "content-length", "host"].includes(
							key.toLowerCase(),
						),
				),
			);
			const hasBody =
				!["GET", "HEAD"].includes(trace.method) &&
				trace.request.body !== undefined &&
				trace.request.body !== null;

			await fetch(`${url.pathname}${url.search}`, {
				method: trace.method,
				headers,
				body: hasBody ? JSON.stringify(trace.request.body) : undefined,
			});

			const result = await refetch();
			const newestTrace = result.data?.[0];
			if (newestTrace) {
				setSelectedTraceId(newestTrace.id);
			}
			return;
		}

		const call = getProviderCall(trace);
		if (!call) return;

		if (trace.method === "QUERY" || trace.method === "COMMAND") {
			const [handlerKey, payload, options] = call.args as [
				unknown,
				unknown,
				(
					| { executionContext?: unknown; includePreHandlerKeys?: unknown }
					| undefined
				),
			];

			if (typeof handlerKey !== "string") return;

			rerunHandlerMutation.mutate({
				data: {
					scopeModuleId: call.scopeModuleId,
					kind: trace.method === "QUERY" ? "query" : "command",
					handlerKey,
					payload,
					...(options?.executionContext !== undefined
						? { executionContext: options.executionContext }
						: {}),
					...(Array.isArray(options?.includePreHandlerKeys)
						? {
								includePreHandlerKeys: options.includePreHandlerKeys.filter(
									(key): key is string => typeof key === "string",
								),
							}
						: {}),
				},
			});
			return;
		}

		rerunInvokeMutation.mutate({
			data: {
				scopeModuleId: call.scopeModuleId,
				providerKey: call.providerKey,
				methodName: call.methodName,
				args: call.args,
				traceMethod: isMiddlewareTrace(trace)
					? "MIDDLEWARE"
					: isEntrypointTrace(trace)
						? "ENTRYPOINT"
						: "INVOKE",
			},
		});
	};

	// Replays the recorded invocation in the matching playground mode so its
	// params can be adjusted before running.
	const openInPlayground = (trace: Trace) => {
		if (isHttpTrace(trace)) {
			const routeId = findTraceRouteId(graph, trace);
			if (!routeId) return;

			navigate({
				to: "/routes",
				search: {
					mode: RoutePlaygroundModes.route,
					route: routeId,
					state: packDefinedFields({
						p: trace.request.params,
						q: trace.request.query,
						h: trace.request.headers,
						b: trace.request.body,
					}),
				} satisfies RoutePlaygroundSearch,
			});
			return;
		}

		const call = getProviderCall(trace);
		if (!call) return;

		if (trace.method === "QUERY" || trace.method === "COMMAND") {
			const [handlerKey, payload, options] = call.args as [
				unknown,
				unknown,
				(
					| { executionContext?: unknown; includePreHandlerKeys?: unknown }
					| undefined
				),
			];

			navigate({
				to: "/routes",
				search: {
					handler: typeof handlerKey === "string" ? handlerKey : undefined,
					// Recorded traces without includePreHandlerKeys ran no
					// pre-handlers, so replicate with an empty selection.
					middlewares: Array.isArray(options?.includePreHandlerKeys)
						? options.includePreHandlerKeys.join(",")
						: "",
					mode: RoutePlaygroundModes.mediator,
					module: call.scopeModuleId,
					state: packDefinedFields({
						p: payload,
						x: options?.executionContext,
					}),
				} satisfies RoutePlaygroundSearch,
			});
			return;
		}

		if (isMiddlewareCall(graph, call)) {
			navigate({
				to: "/routes",
				search: {
					middleware: call.providerKey,
					mode: RoutePlaygroundModes.middleware,
					module: call.scopeModuleId,
					state: packDefinedFields({
						p: call.args[0],
						c: call.args[1],
						x: call.args[2],
					}),
				} satisfies RoutePlaygroundSearch,
			});
			return;
		}

		const entrypoint = findEntrypointCall(graph, call);
		if (entrypoint) {
			navigate({
				to: "/routes",
				search: {
					entrypoint: formatEntrypointId(call.scopeModuleId, entrypoint),
					mode: RoutePlaygroundModes.entrypoint,
					module: call.scopeModuleId,
					state: packUrlState({ a: call.args }),
				} satisfies RoutePlaygroundSearch,
			});
			return;
		}

		navigate({
			to: "/routes",
			search: {
				method: call.methodName,
				mode: RoutePlaygroundModes.provider,
				module: call.scopeModuleId,
				provider: call.providerKey,
				state: packUrlState({ a: call.args }),
			} satisfies RoutePlaygroundSearch,
		});
	};

	const openInGraph = (trace: Trace) => {
		const moduleId = findTraceGraphModuleId(graph, trace);
		if (!moduleId) return;

		navigate({
			to: "/",
			search: {
				selectedModule: moduleId,
				view: "providers",
			} satisfies GraphRouteSearch,
		});
	};

	return (
		<Paper style={{ flex: 1, minHeight: 0 }}>
			<Stack gap="sm" style={{ height: "100%", minHeight: 0 }}>
				<Group justify="space-between">
					<Stack gap={2}>
						<Text fw={700} size="sm">
							Trace history
						</Text>
						<Text c="dimmed" size="xs">
							Last 50 calls
						</Text>
					</Stack>
					<Group gap="xs">
						<Button
							color="red"
							disabled={traces.length === 0}
							loading={deleteTraces.isPending}
							onClick={() => deleteTraces.mutate()}
							size="xs"
							variant="light"
						>
							Clear
						</Button>
					</Group>
				</Group>

				{/* The scroll area extends into the paper's right padding so the
				    scrollbar rides in the gutter; the viewport padding restores
				    the original content edge. */}
				<ScrollArea
					style={{ flex: 1, marginRight: -16, minHeight: 0 }}
					styles={{ viewport: { paddingRight: 16 } }}
					type="auto"
				>
					{traces.length === 0 && (
						<Text c="dimmed" size="sm">
							No traces yet
						</Text>
					)}

					{traces.length > 0 && (
						<Stack gap={6}>
							{traces.map((trace) => {
								const selected = selectedTrace?.id === trace.id;
								const copied = copiedTraceId === trace.id;
								const curlCopied = copiedCurlTraceId === trace.id;
								const httpTrace = isHttpTrace(trace);
								const middlewareTrace = isMiddlewareTrace(trace);
								const outcome = getTraceOutcome(trace);
								const canOpenInPlayground = httpTrace
									? findTraceRouteId(graph, trace) !== null
									: getProviderCall(trace) !== null;
								const canRerun = httpTrace || getProviderCall(trace) !== null;
								const canOpenInGraph =
									findTraceGraphModuleId(graph, trace) !== null;

								return (
									<Paper
										bg={selected ? "teal.0" : undefined}
										component="button"
										key={trace.id}
										onClick={() => setSelectedTraceId(trace.id)}
										p="xs"
										style={{
											border: selected
												? "1px solid var(--mantine-color-teal-4)"
												: "1px solid var(--mantine-color-gray-2)",
											cursor: "pointer",
											textAlign: "left",
										}}
									>
										<Group gap="xs" wrap="nowrap" align="flex-start">
											<Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
												<Group gap="xs" wrap="nowrap">
													{httpTrace ? (
														<Badge
															color={getMethodColor(trace.method)}
															size="sm"
														>
															{trace.method}
														</Badge>
													) : (
														<Badge
															color={
																middlewareTrace
																	? getSpanColor("prehandler")
																	: getMethodColor(trace.method)
															}
															size="sm"
															styles={{ label: { textTransform: "none" } }}
															variant="light"
														>
															{middlewareTrace
																? "Middleware"
																: getTraceKindLabel(trace.method)}
														</Badge>
													)}
													{httpTrace ? (
														<Tooltip
															label={trace.url}
															maw={420}
															multiline
															openDelay={300}
														>
															<Text fw={700} lineClamp={1} size="sm">
																{trace.url}
															</Text>
														</Tooltip>
													) : (
														<MethodName
															args={getProviderCallArgs(trace)}
															fw={700}
															methodName={trace.url}
														/>
													)}
												</Group>
												<Group gap="xs">
													<Text
														c={
															httpTrace
																? getStatusCodeColor(trace.statusCode)
																: outcome.color
														}
														fw={700}
														size="xs"
													>
														{httpTrace
															? (trace.statusCode ?? "-")
															: outcome.label}
													</Text>
													<Text c="dimmed" size="xs">
														{Math.round(trace.durationMs)} ms
													</Text>
													<Text c="dimmed" size="xs">
														{trace.spans.length} spans
													</Text>
												</Group>
											</Stack>
											<Menu position="bottom-end" shadow="md" withinPortal>
												<Menu.Target>
													<ActionIcon
														color="gray"
														onClick={(e) => e.stopPropagation()}
														size="sm"
														variant="subtle"
													>
														<DotsIcon />
													</ActionIcon>
												</Menu.Target>
												<Menu.Dropdown onClick={(e) => e.stopPropagation()}>
													<Menu.Item
														closeMenuOnClick={false}
														leftSection={<CopyIcon />}
														onClick={(e) => copyTrace(trace, e)}
													>
														{copied ? "Copied!" : "Copy JSON"}
													</Menu.Item>
													{httpTrace && (
														<Menu.Item
															closeMenuOnClick={false}
															leftSection={<TerminalIcon />}
															onClick={(e) => copyTraceCurl(trace, e)}
														>
															{curlCopied ? "Copied!" : "Copy as curl"}
														</Menu.Item>
													)}
													{canRerun && (
														<Menu.Item
															leftSection={<RerunIcon />}
															onClick={() => rerunTrace(trace)}
														>
															Rerun
														</Menu.Item>
													)}
													{canOpenInPlayground && (
														<Menu.Item
															leftSection={<PlayIcon />}
															onClick={() => openInPlayground(trace)}
														>
															Open in playground
														</Menu.Item>
													)}
													{canOpenInGraph && (
														<Menu.Item
															leftSection={<GraphIcon />}
															onClick={() => openInGraph(trace)}
														>
															Open in graph
														</Menu.Item>
													)}
													<Menu.Divider />
													<Menu.Item
														color="red"
														leftSection={<TrashIcon />}
														onClick={() =>
															deleteTrace.mutate({ traceId: trace.id })
														}
													>
														Delete
													</Menu.Item>
												</Menu.Dropdown>
											</Menu>
										</Group>
									</Paper>
								);
							})}
						</Stack>
					)}
				</ScrollArea>
			</Stack>
		</Paper>
	);
}

// Matches a recorded HTTP trace back to a playground route id, which encodes
// module, method, path, controller, and handler.
function findTraceRouteId(
	graph: GetGraphResponse,
	trace: Trace,
): string | null {
	for (const module of graph.modules) {
		const route = (module.routes ?? []).find(
			(candidate) =>
				candidate.method === trace.method && candidate.path === trace.path,
		);

		if (route) {
			return `${module.id}:${route.method}:${route.path}:${route.controller}:${route.handler}`;
		}
	}

	return null;
}

function findTraceGraphModuleId(
	graph: GetGraphResponse,
	trace: Trace,
): string | null {
	if (isHttpTrace(trace)) {
		const routeId = findTraceRouteId(graph, trace);

		return routeId?.split(":")[0] ?? null;
	}

	const call = getProviderCall(trace);
	if (!call) return null;

	return graph.modules.some((module) => module.id === call.scopeModuleId)
		? call.scopeModuleId
		: null;
}

// Middleware invocations are recorded as provider calls on a pre-handler key;
// they belong in the middleware playground with its three-argument editors.
function isMiddlewareCall(
	graph: GetGraphResponse,
	call: ProviderCall,
): boolean {
	if (call.methodName !== "execute") return false;

	const module = graph.modules.find(
		(candidate) => candidate.id === call.scopeModuleId,
	);

	return (
		!!module &&
		(module.queryPreHandlers.includes(call.providerKey) ||
			module.commandPreHandlers.includes(call.providerKey))
	);
}

function findEntrypointCall(graph: GetGraphResponse, call: ProviderCall) {
	const module = graph.modules.find(
		(candidate) => candidate.id === call.scopeModuleId,
	);

	return (
		module?.entrypoints.find(
			(entrypoint) =>
				entrypoint.type !== "http" &&
				entrypoint.controller === call.providerKey &&
				entrypoint.handler === call.methodName,
		) ?? null
	);
}

function getRecordedHeaders(trace: Trace): Record<string, string> {
	return trace.request.headers && typeof trace.request.headers === "object"
		? (trace.request.headers as Record<string, string>)
		: {};
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

function getProviderCallArgs(trace: Trace): unknown[] {
	return getProviderCall(trace)?.args ?? [];
}

function DotsIcon() {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="currentColor"
			stroke="none"
		>
			<circle cx="12" cy="5" r="1.6" />
			<circle cx="12" cy="12" r="1.6" />
			<circle cx="12" cy="19" r="1.6" />
		</svg>
	);
}

function RerunIcon() {
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
			<path d="M3 12a9 9 0 1 0 3-6.7" />
			<polyline points="3 3 3 8 8 8" />
		</svg>
	);
}

function PlayIcon() {
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
			<polygon points="6 3 20 12 6 21 6 3" />
		</svg>
	);
}

function TrashIcon() {
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
			<path d="M3 6h18" />
			<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
			<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
		</svg>
	);
}

function GraphIcon() {
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
			<circle cx="6" cy="6" r="2" />
			<circle cx="18" cy="6" r="2" />
			<circle cx="12" cy="18" r="2" />
			<path d="M8 7l3 8" />
			<path d="M16 7l-3 8" />
		</svg>
	);
}

function TerminalIcon() {
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
			<polyline points="4 17 10 11 4 5" />
			<line x1="12" y1="19" x2="20" y2="19" />
		</svg>
	);
}
