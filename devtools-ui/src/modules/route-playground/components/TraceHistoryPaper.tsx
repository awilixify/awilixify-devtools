import {
	ActionIcon,
	Badge,
	Button,
	Center,
	Checkbox,
	Group,
	Loader,
	Menu,
	Paper,
	Popover,
	ScrollArea,
	SegmentedControl,
	Stack,
	Text,
	Tooltip,
	UnstyledButton,
} from "@mantine/core";
import { useMutation, useQueries } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import fetchToCurl from "fetch-to-curl";
import { useEffect, useRef, useState } from "react";
import {
	getDevtoolsGraph,
	getGetDevtoolsGraphQueryKey,
	useGetDevtoolsGraphSuspense,
} from "@/api/graph/graph";
import type { GetGraphResponse, Trace } from "@/api/model";
import {
	postDevtoolsPlaygroundInvoke,
	postDevtoolsPlaygroundInvokeHandler,
} from "@/api/playground/playground";
import { useGetDevtoolsSettings } from "@/api/settings/settings";
import {
	deleteDevtoolsTraces,
	deleteDevtoolsTracesTraceId,
	getDevtoolsTraces,
} from "@/api/traces/traces";
import { withDevtoolsBasePath } from "@/devtools-fetch";
import type { GraphRouteSearch } from "../../app/router";
import {
	getServiceBackgroundColor,
	getServiceBorderColor,
	getServiceColor,
} from "../../graph/service-colors";
import { useTargets } from "../../targets/TargetsContext";
import { getTargetAppPath } from "../../targets/target-routing";
import { getEntryTracesQueryKey, rerunTraceMutationKey } from "../entry-traces";
import { getMethodColor, getStatusCodeColor } from "../http-method-color";
import type { RoutePlaygroundSearch } from "../route";
import {
	getEntrypointBadgeColor,
	getEntrypointBadgeLabel,
	getEntrypointListenerName,
	getTraceOutcome,
	isEntrypointTrace,
	isHttpTrace,
	isMiddlewareTrace,
} from "../trace-presentation";
import { packDefinedFields, packUrlState } from "../url-state";
import {
	RoutePlaygroundModes,
	type TraceHistoryMode,
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
	const { selectTarget, targets } = useTargets();
	const {
		selectedTraceId,
		selectedTraceScope,
		setSelectedTraceId,
		setTraceHistoryMode,
		traceHistoryMode,
	} = useRoutePlaygroundSettings();
	const traceQueries = useQueries({
		queries: targets.map((target) => ({
			queryKey: getEntryTracesQueryKey(target.serviceName),
			queryFn: ({ signal }: { signal: AbortSignal }) =>
				getDevtoolsTraces(withDevtoolsBasePath(target.basePath, { signal })),
			// New traces (incl. async distributed legs) are pushed via the SSE
			// stream (useTraceStream), so no polling or window-focus refetch.
			refetchOnWindowFocus: false,
		})),
	});
	const [selectedServices, setSelectedServices] = useState(
		() => new Set(targets.map((target) => target.serviceName)),
	);
	const allTraces = traceQueries
		.flatMap((query) => query.data ?? [])
		.sort((a, b) => b.startedAt - a.startedAt);
	const traces = allTraces.filter((trace) =>
		selectedServices.has(trace.serviceName),
	);
	const loadingTraces =
		traces.length === 0 && traceQueries.some((query) => query.isPending);
	// By-service view groups only the selected services' entries. Merged view
	// groups the complete distributed traces first, then keeps any whose flow
	// touches at least one selected service, so a cross-service trace stays
	// visible as long as one of its services is checked.
	const serviceDistributedTraces = groupDistributedTraces(traces);
	const mergedDistributedTraces = groupDistributedTraces(allTraces).filter(
		(group) => group.services.some((service) => selectedServices.has(service)),
	);
	// A playground run or rerun selects the newest trace, which — since history is
	// sorted newest-first — is the top group. When that happens, scroll the list
	// up so the freshly selected trace is actually visible instead of hidden below
	// a scrolled-down viewport. Ordinary clicks on lower items don't match.
	const viewportRef = useRef<HTMLDivElement>(null);
	const topTraceId =
		(traceHistoryMode === "merged"
			? mergedDistributedTraces
			: serviceDistributedTraces)[0]?.rootTrace.id ?? null;
	useEffect(() => {
		if (selectedTraceId && selectedTraceId === topTraceId) {
			viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [selectedTraceId, topTraceId]);
	const { data: graph } = useGetDevtoolsGraphSuspense();
	// Replay resolves a trace against its own service's graph, not just the
	// active target's, so cross-service distributed legs (e.g. RabbitMQ listeners
	// running in another service) still expose Rerun / Open actions.
	const graphQueries = useQueries({
		queries: targets.map((target) => ({
			queryKey: [...getGetDevtoolsGraphQueryKey(), target.serviceName],
			queryFn: ({ signal }: { signal: AbortSignal }) =>
				getDevtoolsGraph(withDevtoolsBasePath(target.basePath, { signal })),
			refetchOnWindowFocus: false,
		})),
	});
	const graphsByService = new Map(
		targets.map((target, index) => [
			target.serviceName,
			graphQueries[index]?.data,
		]),
	);
	// Falls back to the active target's graph until a service's graph has loaded.
	const graphForTrace = (trace: Trace): GetGraphResponse =>
		graphsByService.get(trace.serviceName) ?? graph;
	const { data: settings } = useGetDevtoolsSettings();
	const appUrl = settings?.appUrl?.replace(/\/$/, "") ?? "";

	const selectedTrace = traces.find((trace) => trace.id === selectedTraceId);
	const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);
	const [copiedCurlTraceId, setCopiedCurlTraceId] = useState<string | null>(
		null,
	);
	const [copiedDistributedTraceId, setCopiedDistributedTraceId] = useState<
		string | null
	>(null);

	const refreshTraces = async (): Promise<Trace[]> => {
		const results = await Promise.all(
			traceQueries.map((query) => query.refetch()),
		);

		return results
			.flatMap((result) => result.data ?? [])
			.sort((a, b) => b.startedAt - a.startedAt);
	};

	const clearTraces = useMutation({
		mutationFn: () =>
			Promise.all(
				targets
					.filter((target) => selectedServices.has(target.serviceName))
					.map((target) =>
						deleteDevtoolsTraces(withDevtoolsBasePath(target.basePath)),
					),
			),
		onSuccess: () => {
			setSelectedTraceId(null);
			refreshTraces();
		},
	});

	const deleteTrace = useMutation({
		mutationFn: ({
			serviceName,
			traceId,
		}: {
			serviceName: string;
			traceId: string;
		}) => {
			const target = targets.find(
				(candidate) => candidate.serviceName === serviceName,
			);
			if (!target) throw new Error(`Unknown service "${serviceName}"`);

			return deleteDevtoolsTracesTraceId(
				traceId,
				withDevtoolsBasePath(target.basePath),
			);
		},
		onSuccess: (_response, variables) => {
			if (selectedTraceId === variables.traceId) {
				setSelectedTraceId(null);
			}
			refreshTraces();
		},
	});

	// Deletes every service trace that makes up a distributed trace, so the whole
	// row disappears in one action instead of leaving orphaned entries behind.
	const deleteDistributedTrace = useMutation({
		mutationFn: (group: DistributedTraceGroup) =>
			Promise.all(
				group.traces.map((trace) => {
					const target = targets.find(
						(candidate) => candidate.serviceName === trace.serviceName,
					);
					if (!target)
						throw new Error(`Unknown service "${trace.serviceName}"`);

					return deleteDevtoolsTracesTraceId(
						trace.id,
						withDevtoolsBasePath(target.basePath),
					);
				}),
			),
		onSuccess: (_response, group) => {
			if (group.traces.some((trace) => trace.id === selectedTraceId)) {
				setSelectedTraceId(null);
			}
			refreshTraces();
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
		const headers = getReplayHeaders(trace);
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

	// Copies the whole distributed trace (every service trace in start order) so
	// the clipboard holds the full end-to-end flow, not just one service leg.
	const copyDistributedTrace = async (
		group: DistributedTraceGroup,
		event: React.MouseEvent,
	) => {
		event.stopPropagation();
		await navigator.clipboard.writeText(JSON.stringify(group.traces, null, 2));
		setCopiedDistributedTraceId(group.id);
		window.setTimeout(() => setCopiedDistributedTraceId(null), 1200);
	};

	const selectNewTrace = async (response: { traceId: string }) => {
		await refreshTraces();
		// A rerun re-executes the whole flow, so select the full distributed trace
		// — it then stays a full-group selection when switching history tabs.
		// Late distributed legs arrive via the SSE trace stream, so no polling.
		setSelectedTraceId(response.traceId, "full");
	};

	// Re-executes the recorded invocation as-is, without a playground detour.
	// Targets the trace's own service by base path rather than switching the
	// global active target (which clears the query cache and blanks the whole
	// page via the graph Suspense boundary). Selection of the resulting trace
	// happens inside the mutation, so the shared mutation key keeps the details
	// paper showing a spinner — not the stale trace — until the rerun resolves.
	const rerunMutation = useMutation({
		mutationKey: rerunTraceMutationKey,
		mutationFn: async (trace: Trace) => {
			const target = targets.find(
				(candidate) => candidate.serviceName === trace.serviceName,
			);
			if (!target) return;

			if (isHttpTrace(trace)) {
				// Relative URLs go through the devtools server's app proxy, exactly
				// like route playground requests.
				const url = new URL(trace.url, appUrl || "http://localhost");
				const headers = getReplayHeaders(trace);
				const hasBody =
					!["GET", "HEAD"].includes(trace.method) &&
					trace.request.body !== undefined &&
					trace.request.body !== null;

				await fetch(getTargetAppPath(target, `${url.pathname}${url.search}`), {
					method: trace.method,
					headers,
					body: hasBody ? JSON.stringify(trace.request.body) : undefined,
				});

				const refreshedTraces = await refreshTraces();
				const newestTrace = refreshedTraces.find(
					(candidate) => candidate.serviceName === trace.serviceName,
				);
				setSelectedTraceId(newestTrace ? newestTrace.id : null, "full");
				return;
			}

			const call = getTraceCall(graphForTrace(trace), trace);
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

				const response = await postDevtoolsPlaygroundInvokeHandler(
					{
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
					withDevtoolsBasePath(target.basePath),
				);
				await selectNewTrace(response);
				return;
			}

			const response = await postDevtoolsPlaygroundInvoke(
				{
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
				withDevtoolsBasePath(target.basePath),
			);
			await selectNewTrace(response);
		},
	});

	const rerunTrace = (trace: Trace) => {
		rerunMutation.mutate(trace);
	};

	// Replays the recorded invocation in the matching playground mode so its
	// params can be adjusted before running.
	const openInPlayground = (trace: Trace) => {
		selectTarget(trace.serviceName);

		const traceGraph = graphForTrace(trace);

		// Each branch navigates with a fresh search object, which would otherwise
		// reset the trace-history tab to its default. Preserve the current tab.
		const history =
			traceHistoryMode === "merged" ? undefined : traceHistoryMode;

		if (isHttpTrace(trace)) {
			const routeId = findTraceRouteId(traceGraph, trace);
			if (!routeId) return;

			navigate({
				to: "/routes",
				search: {
					history,
					mode: RoutePlaygroundModes.route,
					route: routeId,
					state: packDefinedFields({
						p: trace.request.params,
						q: trace.request.query,
						h: getReplayHeaders(trace),
						b: trace.request.body,
					}),
				} satisfies RoutePlaygroundSearch,
			});
			return;
		}

		const call = getTraceCall(traceGraph, trace);
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
					history,
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

		if (isMiddlewareCall(traceGraph, call)) {
			navigate({
				to: "/routes",
				search: {
					history,
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

		const entrypoint = findEntrypointCall(traceGraph, call);
		if (entrypoint) {
			navigate({
				to: "/routes",
				search: {
					entrypoint: formatEntrypointId(call.scopeModuleId, entrypoint),
					history,
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
				history,
				method: call.methodName,
				mode: RoutePlaygroundModes.provider,
				module: call.scopeModuleId,
				provider: call.providerKey,
				state: packUrlState({ a: call.args }),
			} satisfies RoutePlaygroundSearch,
		});
	};

	const openInGraph = (trace: Trace) => {
		selectTarget(trace.serviceName);

		const moduleId = findTraceGraphModuleId(graphForTrace(trace), trace);
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
		<Paper style={{ flex: 1.25, minHeight: 420 }}>
			<Stack gap="sm" style={{ height: "100%", minHeight: 0 }}>
				<Group justify="space-between">
					<Stack gap={2}>
						<Text fw={700} size="sm">
							Trace history
						</Text>
						<Text c="dimmed" size="xs">
							Last 50 traces per service
						</Text>
					</Stack>
					<Group gap="xs">
						<SegmentedControl
							data={[
								{ label: "Merged", value: "merged" },
								{ label: "By service", value: "service" },
							]}
							onChange={(value) =>
								setTraceHistoryMode(value as TraceHistoryMode)
							}
							size="xs"
							value={traceHistoryMode}
						/>
						<Popover position="bottom-end" shadow="md" withinPortal>
							<Popover.Target>
								<Button size="xs" variant="default">
									Services {selectedServices.size}/{targets.length}
								</Button>
							</Popover.Target>
							<Popover.Dropdown>
								<Stack gap="xs">
									<Text fw={700} size="xs">
										Services
									</Text>
									{targets.map((target) => (
										<Checkbox
											checked={selectedServices.has(target.serviceName)}
											key={target.serviceName}
											label={target.serviceName}
											onChange={(event) => {
												const { checked } = event.currentTarget;

												setSelectedServices((current) => {
													const next = new Set(current);

													if (checked) {
														next.add(target.serviceName);
													} else {
														next.delete(target.serviceName);
													}

													return next;
												});
											}}
											size="xs"
										/>
									))}
								</Stack>
							</Popover.Dropdown>
						</Popover>
						<Button
							color="red"
							disabled={traces.length === 0}
							loading={clearTraces.isPending}
							onClick={() => clearTraces.mutate()}
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
					viewportRef={viewportRef}
				>
					{loadingTraces && <TraceHistoryLoader />}

					{!loadingTraces && traces.length === 0 && (
						<Text c="dimmed" size="sm">
							No traces yet
						</Text>
					)}

					{traces.length > 0 && traceHistoryMode === "merged" && (
						<Stack gap={6}>
							{mergedDistributedTraces.map((distributedTrace) => {
								const rootTrace = distributedTrace.rootTrace;
								const selected = distributedTrace.traces.some(
									(trace) => trace.id === selectedTraceId,
								);
								const httpTrace = isHttpTrace(rootTrace);
								const outcome = getDistributedTraceOutcome(distributedTrace);
								const distributedCopied =
									copiedDistributedTraceId === distributedTrace.id;
								const canRerun =
									httpTrace || getProviderCall(rootTrace) !== null;

								return (
									<Paper
										bg={selected ? "teal.0" : undefined}
										component="button"
										key={distributedTrace.id}
										onClick={() => {
											setSelectedTraceId(rootTrace.id, "full");
										}}
										p="xs"
										style={{
											border: selected
												? "1px solid var(--mantine-color-teal-4)"
												: "1px solid var(--mantine-color-gray-2)",
											borderLeft: `3px solid ${getServiceColor(rootTrace.serviceName)}`,
											cursor: "pointer",
											textAlign: "left",
										}}
									>
										<Group
											align="flex-start"
											gap="xs"
											style={{ position: "relative" }}
											wrap="nowrap"
										>
											<Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
												<Group
													justify="space-between"
													style={{ paddingRight: 24 }}
													wrap="nowrap"
												>
													<Group gap="xs" style={{ minWidth: 0 }} wrap="nowrap">
														<Badge
															color={
																httpTrace
																	? getMethodColor(rootTrace.method)
																	: (getEntrypointBadgeColor(rootTrace) ??
																		getSpanColor("provider"))
															}
															size="sm"
															style={{ flexShrink: 0 }}
														>
															{httpTrace
																? "HTTP"
																: getEntrypointBadgeLabel(rootTrace)}
														</Badge>
														<Text
															c={outcome.color}
															fw={700}
															size="xs"
															style={{ flexShrink: 0 }}
														>
															{outcome.label}
														</Text>
														<Text
															fw={700}
															lineClamp={1}
															size="sm"
															style={{ flex: 1, minWidth: 0 }}
														>
															{rootTrace.url}
														</Text>
													</Group>
													<Text
														c="dimmed"
														size="xs"
														fs="italic"
														style={{ whiteSpace: "nowrap" }}
													>
														{formatStartTime(distributedTrace.startedAt)}
													</Text>
												</Group>

												<Group justify="space-between" wrap="nowrap">
													<Group gap={4} style={{ minWidth: 0 }}>
														{distributedTrace.services.map((serviceName) => (
															<ServiceBadge
																key={serviceName}
																serviceName={serviceName}
															/>
														))}
														<Text
															c="dimmed"
															size="xs"
															style={{ flexShrink: 0, whiteSpace: "nowrap" }}
														>
															{distributedTrace.traces.length} service traces
														</Text>
													</Group>
													<Text
														c="dimmed"
														size="xs"
														style={{ whiteSpace: "nowrap" }}
													>
														{distributedTrace.spanCount} spans ·{" "}
														{Math.round(distributedTrace.durationMs)} ms
													</Text>
												</Group>
											</Stack>
											<div
												style={{ position: "absolute", right: "-4px", top: 0 }}
											>
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
															onClick={(e) =>
																copyDistributedTrace(distributedTrace, e)
															}
														>
															{distributedCopied ? "Copied!" : "Copy JSON"}
														</Menu.Item>
														{canRerun && (
															<Menu.Item
																leftSection={<RerunIcon />}
																onClick={() => rerunTrace(rootTrace)}
															>
																Rerun
															</Menu.Item>
														)}
														<Menu.Divider />
														<Menu.Item
															color="red"
															leftSection={<TrashIcon />}
															onClick={() =>
																deleteDistributedTrace.mutate(distributedTrace)
															}
														>
															Delete
														</Menu.Item>
													</Menu.Dropdown>
												</Menu>
											</div>
										</Group>
									</Paper>
								);
							})}
						</Stack>
					)}

					{traces.length > 0 && traceHistoryMode === "service" && (
						<Stack gap={6}>
							{serviceDistributedTraces.map((distributedTrace) => {
								// The group highlights only for a full-trace selection; a
								// single-entry selection highlights just that entry below.
								const groupSelected =
									selectedTraceScope === "full" &&
									distributedTrace.traces.some(
										(trace) => trace.id === selectedTraceId,
									);

								return (
									<Paper
										bg={groupSelected ? "teal.0" : "gray.0"}
										key={distributedTrace.id}
										p={4}
										style={{
											border: groupSelected
												? "1px solid var(--mantine-color-teal-3)"
												: "1px solid var(--mantine-color-gray-3)",
										}}
									>
										<Stack gap={4}>
											<UnstyledButton
												onClick={() =>
													setSelectedTraceId(
														distributedTrace.rootTrace.id,
														"full",
													)
												}
												style={{ cursor: "pointer", width: "100%" }}
											>
												<Group justify="space-between" px={6} wrap="nowrap">
													<Text c="dimmed" fw={600} size="xs">
														Full trace ({distributedTrace.traces.length}{" "}
														entries)
													</Text>
													<Text fs="italic" c="dimmed" size="xs">
														{Math.round(distributedTrace.durationMs)} ms ·{" "}
														{formatStartTime(distributedTrace.startedAt)}
													</Text>
												</Group>
											</UnstyledButton>

											<Stack gap={3}>
												{distributedTrace.traces.map((trace) => {
													const selected =
														selectedTraceScope !== "full" &&
														selectedTrace?.id === trace.id;
													const copied = copiedTraceId === trace.id;
													const curlCopied = copiedCurlTraceId === trace.id;
													const httpTrace = isHttpTrace(trace);
													const middlewareTrace = isMiddlewareTrace(trace);
													const outcome = getTraceOutcome(trace);
													const traceGraph = graphForTrace(trace);
													const canOpenInPlayground = httpTrace
														? findTraceRouteId(traceGraph, trace) !== null
														: getTraceCall(traceGraph, trace) !== null;
													const canRerun =
														httpTrace ||
														getTraceCall(traceGraph, trace) !== null;
													const canOpenInGraph =
														findTraceGraphModuleId(traceGraph, trace) !== null;

													return (
														<Paper
															bg={selected ? "teal.0" : undefined}
															component="button"
															key={trace.id}
															onClick={() => {
																setSelectedTraceId(trace.id);
															}}
															p="xs"
															style={{
																border: selected
																	? "1px solid var(--mantine-color-teal-4)"
																	: "1px solid var(--mantine-color-gray-2)",
																borderLeft: `3px solid ${getServiceColor(trace.serviceName)}`,
																cursor: "pointer",
																textAlign: "left",
															}}
														>
															<Group
																align="flex-start"
																gap="xs"
																style={{ position: "relative" }}
																wrap="nowrap"
															>
																<Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
																	<Group
																		gap="xs"
																		style={{ paddingRight: 24 }}
																		wrap="nowrap"
																	>
																		{httpTrace ? (
																			<Badge
																				color={getMethodColor(trace.method)}
																				size="sm"
																				style={{ flexShrink: 0 }}
																			>
																				HTTP
																			</Badge>
																		) : (
																			<Badge
																				color={
																					middlewareTrace
																						? getSpanColor("prehandler")
																						: (getEntrypointBadgeColor(trace) ??
																							getMethodColor(trace.method))
																				}
																				size="sm"
																				style={{ flexShrink: 0 }}
																				styles={{
																					label: { textTransform: "none" },
																				}}
																				variant="light"
																			>
																				{middlewareTrace
																					? "Middleware"
																					: getEntrypointBadgeLabel(trace)}
																			</Badge>
																		)}
																		<Text
																			c={
																				httpTrace
																					? getStatusCodeColor(trace.statusCode)
																					: outcome.color
																			}
																			fw={700}
																			size="xs"
																			style={{ flexShrink: 0 }}
																		>
																			{httpTrace
																				? (trace.statusCode ?? "-")
																				: outcome.label}
																		</Text>
																		{httpTrace ? (
																			<Tooltip
																				label={trace.url}
																				maw={420}
																				multiline
																				openDelay={300}
																			>
																				<Text
																					fw={700}
																					size="sm"
																					style={{ flex: 1, minWidth: 0 }}
																					truncate
																				>
																					{trace.url}
																				</Text>
																			</Tooltip>
																		) : (
																			<MethodName
																				args={getProviderCallArgs(trace)}
																				fw={700}
																				methodName={trace.url}
																				truncate
																			/>
																		)}
																	</Group>
																	<Group
																		gap="xs"
																		justify="space-between"
																		wrap="nowrap"
																	>
																		<Group
																			gap="xs"
																			style={{ minWidth: 0 }}
																			wrap="nowrap"
																		>
																			<ServiceBadge
																				serviceName={trace.serviceName}
																			/>
																		</Group>
																		<Text
																			c="dimmed"
																			size="xs"
																			style={{ whiteSpace: "nowrap" }}
																		>
																			{trace.spans.length} spans ·{" "}
																			{Math.round(trace.durationMs)} ms
																		</Text>
																	</Group>
																</Stack>
																<div
																	style={{
																		position: "absolute",
																		right: "-4px",
																		top: 0,
																	}}
																>
																	<Menu
																		position="bottom-end"
																		shadow="md"
																		withinPortal
																	>
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
																		<Menu.Dropdown
																			onClick={(e) => e.stopPropagation()}
																		>
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
																					onClick={(e) =>
																						copyTraceCurl(trace, e)
																					}
																				>
																					{curlCopied
																						? "Copied!"
																						: "Copy as curl"}
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
																					onClick={() =>
																						openInPlayground(trace)
																					}
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
																					deleteTrace.mutate({
																						serviceName: trace.serviceName,
																						traceId: trace.id,
																					})
																				}
																			>
																				Delete
																			</Menu.Item>
																		</Menu.Dropdown>
																	</Menu>
																</div>
															</Group>
														</Paper>
													);
												})}
											</Stack>
										</Stack>
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

	const call = getTraceCall(graph, trace);
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

// Live entrypoint invocations (e.g. a real RabbitMQ message) don't carry a
// playground-style request.body; they record their args on request.args and the
// controller/handler on the controller span. Reconstruct a ProviderCall by
// matching that controller+handler back to a graph entrypoint, which yields the
// scope module id needed to replay it or open it in the playground.
function getEntrypointCall(
	graph: GetGraphResponse,
	trace: Trace,
): ProviderCall | null {
	if (!isEntrypointTrace(trace)) return null;

	const controllerSpan = trace.spans.find((span) => span.kind === "controller");
	if (!controllerSpan) return null;

	const { methodName, registrationKey: providerKey } = controllerSpan;

	const module = graph.modules.find((candidate) =>
		candidate.entrypoints.some(
			(entrypoint) =>
				entrypoint.type !== "http" &&
				entrypoint.controller === providerKey &&
				entrypoint.handler === methodName,
		),
	);
	if (!module) return null;

	return {
		args: Array.isArray(trace.request.args) ? trace.request.args : [],
		methodName,
		providerKey,
		scopeModuleId: module.id,
	};
}

// The provider call behind a trace, whether it was recorded via the playground
// (call in request.body) or fired for real as an entrypoint listener.
function getTraceCall(
	graph: GetGraphResponse,
	trace: Trace,
): ProviderCall | null {
	return getProviderCall(trace) ?? getEntrypointCall(graph, trace);
}

type DistributedTraceGroup = {
	id: string;
	traces: Trace[];
	rootTrace: Trace;
	services: string[];
	startedAt: number;
	durationMs: number;
	spanCount: number;
};

function groupDistributedTraces(traces: Trace[]): DistributedTraceGroup[] {
	const tracesById = new Map<string, Trace[]>();

	for (const trace of traces) {
		const group = tracesById.get(trace.distributedTraceId) ?? [];
		group.push(trace);
		tracesById.set(trace.distributedTraceId, group);
	}

	return [...tracesById.entries()]
		.map(([id, groupedTraces]) => {
			const spanIds = new Set(groupedTraces.map((trace) => trace.spanId));
			const orderedTraces = [...groupedTraces].sort(
				(a, b) => a.startedAt - b.startedAt,
			);
			const rootTrace =
				orderedTraces.find(
					(trace) =>
						trace.parentSpanId === null || !spanIds.has(trace.parentSpanId),
				) ?? orderedTraces[0]!;
			const startedAt = Math.min(
				...orderedTraces.map((trace) => trace.startedAt),
			);
			const finishedAt = Math.max(
				...orderedTraces.map((trace) => trace.startedAt + trace.durationMs),
			);

			return {
				id,
				traces: orderedTraces,
				rootTrace,
				services: [...new Set(orderedTraces.map((trace) => trace.serviceName))],
				startedAt,
				durationMs: finishedAt - startedAt,
				spanCount: orderedTraces.reduce(
					(total, trace) => total + trace.spans.length,
					0,
				),
			};
		})
		.sort((a, b) => b.startedAt - a.startedAt);
}

// Wall-clock time the group's earliest trace started, shown on the group header.
function formatStartTime(startedAt: number): string {
	return new Date(startedAt).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

function getDistributedTraceOutcome(trace: DistributedTraceGroup): {
	color: string;
	label: string;
} {
	if (trace.traces.some((serviceTrace) => serviceTrace.status === "error")) {
		return { color: "red", label: "Error" };
	}

	return { color: "green", label: "OK" };
}

function TraceHistoryLoader() {
	return (
		<Center aria-label="Loading trace history" py={64}>
			<Loader size="sm" />
		</Center>
	);
}

function ServiceBadge({ serviceName }: { serviceName: string }) {
	const backgroundColor = getServiceBackgroundColor(serviceName);
	const borderColor = getServiceBorderColor(serviceName);
	const color = getServiceColor(serviceName);

	return (
		<Badge
			size="xs"
			styles={{
				root: {
					backgroundColor,
					border: `1px solid ${borderColor}`,
					color,
				},
			}}
		>
			{serviceName}
		</Badge>
	);
}

function getRecordedHeaders(trace: Trace): Record<string, string> {
	return trace.request.headers && typeof trace.request.headers === "object"
		? (trace.request.headers as Record<string, string>)
		: {};
}

function getReplayHeaders(trace: Trace): Record<string, string> {
	return Object.fromEntries(
		Object.entries(getRecordedHeaders(trace)).filter(
			([key]) =>
				!["connection", "content-length", "host", "traceparent"].includes(
					key.toLowerCase(),
				),
		),
	);
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
