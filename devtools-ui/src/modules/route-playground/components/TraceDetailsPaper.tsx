import {
	Badge,
	Box,
	Center,
	Group,
	Loader,
	Paper,
	ScrollArea,
	SegmentedControl,
	Stack,
	Text,
} from "@mantine/core";
import { useIsMutating, useQueries } from "@tanstack/react-query";
import type { Trace } from "@/api/model";
import { getDevtoolsTraces } from "@/api/traces/traces";
import { withDevtoolsBasePath } from "@/devtools-fetch";
import {
	getServiceBackgroundColor,
	getServiceBorderColor,
	getServiceColor,
} from "../../graph/service-colors";
import { useTargets } from "../../targets/TargetsContext";
import { getEntryTracesQueryKey, rerunTraceMutationKey } from "../entry-traces";
import { getMethodColor } from "../http-method-color";
import {
	getEntrypointBadgeColor,
	getEntrypointBadgeLabel,
	getTraceOutcome,
	isHttpTrace,
	isMiddlewareTrace,
} from "../trace-presentation";
import {
	type RoutePlaygroundViewMode,
	RoutePlaygroundViewModes,
	useRoutePlaygroundSettings,
} from "../use-route-playground-settings";
import { isSyntheticTrace } from "./invocation-paper/use-invocation-trace";
import styles from "./TraceDetailsPaper.module.css";
import { TraceResponseTab } from "./TraceResponseTab";
import { TraceListTab } from "./trace-list/TraceListTab";
import { getSpanColor } from "./trace-tree/traceFormatting";

const viewModeOptions: {
	label: string;
	value: RoutePlaygroundViewMode;
}[] = [
	{ label: "Trace", value: RoutePlaygroundViewModes.trace },
	{ label: "Response", value: RoutePlaygroundViewModes.response },
];

type ServiceTraceSegment = {
	depth: number;
	parent: Trace | null;
	trace: Trace;
};

export function TraceDetailsPaper() {
	const { targets } = useTargets();
	const {
		selectedTraceId,
		selectedTraceScope,
		setViewMode,
		traceHistoryMode,
		viewMode,
	} = useRoutePlaygroundSettings();
	const traceQueries = useQueries({
		queries: targets.map((target) => ({
			queryKey: getEntryTracesQueryKey(target.serviceName),
			queryFn: ({ signal }: { signal: AbortSignal }) =>
				getDevtoolsTraces(withDevtoolsBasePath(target.basePath, { signal })),
			// New traces are pushed via the SSE stream, so no window-focus refetch.
			refetchOnWindowFocus: false,
		})),
	});
	const traces = traceQueries.flatMap((query) => query.data ?? []);
	const selectedTrace = traces.find((trace) => trace.id === selectedTraceId);
	// While a rerun is in flight, show the spinner instead of the stale trace so
	// the panel doesn't keep displaying the previous selection until the new
	// trace arrives.
	const rerunning = useIsMutating({ mutationKey: rerunTraceMutationKey }) > 0;
	const loading =
		rerunning ||
		(selectedTraceId !== null &&
			!selectedTrace &&
			traceQueries.some((query) => query.isPending));
	// Show the whole distributed trace when in merged mode, or when a single
	// entry was explicitly selected as a full trace (by-service group header).
	const merged = traceHistoryMode === "merged" || selectedTraceScope === "full";
	const selectedTraces = selectedTrace
		? merged
			? traces.filter(
					(trace) =>
						trace.distributedTraceId === selectedTrace.distributedTraceId,
				)
			: [selectedTrace]
		: [];
	const synthetic =
		selectedTraces.length === 1 && isSyntheticTrace(selectedTraces[0]!);
	const effectiveViewMode =
		viewMode === RoutePlaygroundViewModes.graph
			? RoutePlaygroundViewModes.trace
			: synthetic
				? RoutePlaygroundViewModes.response
				: viewMode;
	const segmentedControlData = viewModeOptions.map((option) => ({
		...option,
		disabled: synthetic && option.value !== RoutePlaygroundViewModes.response,
	}));

	return (
		<Paper className={styles.panel}>
			<Stack gap="md" className={styles.content}>
				{loading && <LoadingState />}

				{selectedTrace && !loading && (
					<>
						<Group justify="space-between" wrap="nowrap">
							<SegmentedControl
								data={segmentedControlData}
								onChange={(value) =>
									setViewMode(value as RoutePlaygroundViewMode)
								}
								size="xs"
								value={effectiveViewMode}
							/>
							<TraceSummaryBadges merged={merged} traces={selectedTraces} />
						</Group>

						<DistributedTraceDetails
							merged={merged}
							traces={selectedTraces}
							viewMode={effectiveViewMode}
						/>
					</>
				)}

				{!selectedTrace && !loading && <EmptyState />}
			</Stack>
		</Paper>
	);
}

function DistributedTraceDetails({
	merged,
	traces,
	viewMode,
}: {
	merged: boolean;
	traces: Trace[];
	viewMode: RoutePlaygroundViewMode;
}) {
	const segments = orderServiceTraces(traces);
	const rootTrace = segments[0]?.trace;
	if (!rootTrace) return <EmptyState />;

	return (
		<Stack gap="sm" className={styles.traceContent}>
			{merged ? (
				<ScrollArea
					style={{ flex: 1, marginRight: -12, minHeight: 0 }}
					styles={{ viewport: { paddingRight: 12 } }}
					type="auto"
				>
					<Stack gap="md">
						{segments.map((segment) => (
							<ServiceTraceCard
								key={segment.trace.id}
								segment={segment}
								viewMode={viewMode}
							/>
						))}
					</Stack>
				</ScrollArea>
			) : (
				<Box style={{ display: "flex", flex: 1, minHeight: 0 }}>
					<ServiceTraceCard
						fullHeight
						segment={segments[0]!}
						viewMode={viewMode}
					/>
				</Box>
			)}
		</Stack>
	);
}

// Whole-trace summary (service count, outcome, total duration), shown on the
// right of the Trace/Response tab row.
function TraceSummaryBadges({
	merged,
	traces,
}: {
	merged: boolean;
	traces: Trace[];
}) {
	const services = new Set(traces.map((trace) => trace.serviceName)).size;
	const failed = traces.some((trace) => trace.status === "error");
	const durationMs = Math.round(
		Math.max(...traces.map((trace) => trace.startedAt + trace.durationMs)) -
			Math.min(...traces.map((trace) => trace.startedAt)),
	);

	return (
		<Group gap="xs" wrap="nowrap">
			{merged && (
				<Badge color="blue" variant="light">
					{services} services
				</Badge>
			)}
			<Badge color={failed ? "red" : "green"}>{failed ? "Error" : "OK"}</Badge>
			<Badge color="gray" variant="light">
				{durationMs} ms
			</Badge>
		</Group>
	);
}

function ServiceTraceCard({
	fullHeight = false,
	segment,
	viewMode,
}: {
	fullHeight?: boolean;
	segment: ServiceTraceSegment;
	viewMode: RoutePlaygroundViewMode;
}) {
	const { parent, trace } = segment;
	const outcome = getTraceOutcome(trace);
	const serviceColor = getServiceColor(trace.serviceName);
	const serviceBackgroundColor = getServiceBackgroundColor(trace.serviceName);
	const serviceBorderColor = getServiceBorderColor(trace.serviceName);

	return (
		<Paper
			p="md"
			style={{
				borderLeft: `3px solid ${serviceColor}`,
				display: "flex",
				...(fullHeight ? { flex: 1, minHeight: 0 } : {}),
				marginLeft: Math.min(segment.depth, 4) * 18,
			}}
			withBorder
		>
			<Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
				<Group justify="space-between" wrap="nowrap">
					<Stack gap={4} style={{ minWidth: 0 }}>
						<Group gap="xs" wrap="nowrap">
							<Badge
								styles={{
									root: {
										backgroundColor: serviceBackgroundColor,
										border: `1px solid ${serviceBorderColor}`,
										color: serviceColor,
									},
								}}
							>
								{trace.serviceName}
							</Badge>
							<TraceKindBadge trace={trace} />
							<Text fw={700} lineClamp={1} size="sm">
								{getEntrypointLabel(trace)}
							</Text>
						</Group>

						{parent && (
							<Text c="dimmed" size="xs">
								Called from {parent.serviceName} · parent span{" "}
								{trace.parentSpanId}
							</Text>
						)}
					</Stack>

					<Group gap="xs" wrap="nowrap">
						<Text c={outcome.color} fw={700} size="xs">
							{outcome.label}
						</Text>
						<Text c="dimmed" size="xs">
							{Math.round(trace.durationMs)} ms
						</Text>
						<Text c="dimmed" size="xs">
							{trace.spans.length} spans
						</Text>
					</Group>
				</Group>

				{viewMode === RoutePlaygroundViewModes.trace && (
					<Box
						style={{
							display: "flex",
							...(fullHeight ? { flex: 1 } : { height: 650 }),
							minHeight: 0,
						}}
					>
						<TraceListTab trace={trace} />
					</Box>
				)}

				{viewMode === RoutePlaygroundViewModes.response && (
					<Box
						style={{
							display: "flex",
							...(fullHeight ? { flex: 1 } : { height: 650 }),
							minHeight: 0,
						}}
					>
						<TraceResponseTab
							noTraceWarning={isSyntheticTrace(trace)}
							trace={trace}
						/>
					</Box>
				)}
			</Stack>
		</Paper>
	);
}

// Mirrors the trace-history origin badge: HTTP / RabbitMQ / Middleware /
// Provider, etc. — so the details view labels a trace the same way the list does.
function TraceKindBadge({ trace }: { trace: Trace }) {
	if (isHttpTrace(trace)) {
		return (
			<>
				<Badge color={getMethodColor(trace.method)}>HTTP</Badge>
				<Badge color={getMethodColor(trace.method)} variant="light">
					{trace.method}
				</Badge>
			</>
		);
	}

	return (
		<Badge
			color={
				isMiddlewareTrace(trace)
					? getSpanColor("prehandler")
					: (getEntrypointBadgeColor(trace) ?? getMethodColor(trace.method))
			}
			styles={{ label: { textTransform: "none" } }}
			variant="light"
		>
			{isMiddlewareTrace(trace) ? "Middleware" : getEntrypointBadgeLabel(trace)}
		</Badge>
	);
}

// Full recorded URL for HTTP traces (concrete params, not the :id route
// template); the controller path for non-HTTP invocations.
function getEntrypointLabel(trace: Trace): string {
	return trace.url;
}

function orderServiceTraces(traces: Trace[]): ServiceTraceSegment[] {
	const traceBySpanId = new Map(traces.map((trace) => [trace.spanId, trace]));
	const childrenByParentSpanId = new Map<string, Trace[]>();
	const roots: Trace[] = [];

	for (const trace of traces) {
		const parent = trace.parentSpanId
			? traceBySpanId.get(trace.parentSpanId)
			: undefined;

		if (!parent) {
			roots.push(trace);
			continue;
		}

		const children = childrenByParentSpanId.get(parent.spanId) ?? [];
		children.push(trace);
		childrenByParentSpanId.set(parent.spanId, children);
	}

	const result: ServiceTraceSegment[] = [];
	const visited = new Set<string>();
	const visit = (trace: Trace, depth: number, parent: Trace | null) => {
		if (visited.has(trace.id)) return;
		visited.add(trace.id);
		result.push({ depth, parent, trace });

		for (const child of sortByStart(
			childrenByParentSpanId.get(trace.spanId) ?? [],
		)) {
			visit(child, depth + 1, trace);
		}
	};

	for (const root of sortByStart(roots)) visit(root, 0, null);
	for (const trace of sortByStart(traces)) visit(trace, 0, null);

	return result;
}

function sortByStart(traces: Trace[]): Trace[] {
	return [...traces].sort((left, right) => left.startedAt - right.startedAt);
}

function LoadingState() {
	return (
		<Center className={styles.traceContent}>
			<Stack align="center" gap="xs">
				<Loader />
				<Text c="dimmed" size="sm">
					Loading trace details...
				</Text>
			</Stack>
		</Center>
	);
}

function EmptyState() {
	return (
		<Center className={styles.traceContent}>
			<Stack align="center" gap="xs">
				<Text c="dimmed" size="lg">
					No trace selected
				</Text>
				<Text c="dimmed" size="sm">
					Run a route, invoke a provider, or select a trace from history
				</Text>
			</Stack>
		</Center>
	);
}
