import {
	Badge,
	Center,
	Group,
	Loader,
	Paper,
	SegmentedControl,
	Stack,
	Text,
} from "@mantine/core";
import { Suspense } from "react";
import { useGetDevtoolsTraces } from "@/api/traces/traces";
import { getMethodColor, getStatusCodeColor } from "../http-method-color";
import {
	getTraceKindLabel,
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
import { TraceTreeTab } from "./trace-tree/TraceTreeTab";
import { getSpanColor } from "./trace-tree/traceFormatting";

export const viewModeOptions: {
	label: string;
	value: RoutePlaygroundViewMode;
}[] = [
	{ label: "Trace", value: RoutePlaygroundViewModes.trace },
	{ label: "Graph", value: RoutePlaygroundViewModes.graph },
	{ label: "Response", value: RoutePlaygroundViewModes.response },
];

export function TraceDetailsPaper() {
	const { viewMode, setViewMode, selectedTraceId } =
		useRoutePlaygroundSettings();
	const { data: traces = [] } = useGetDevtoolsTraces();

	const selectedTrace = traces.find((trace) => trace.id === selectedTraceId);
	const synthetic = selectedTrace ? isSyntheticTrace(selectedTrace) : false;

	const effectiveViewMode = synthetic
		? RoutePlaygroundViewModes.response
		: viewMode;
	const segmentedControlData = viewModeOptions.map((option) => ({
		...option,
		disabled: synthetic && option.value !== RoutePlaygroundViewModes.response,
	}));

	return (
		<Paper className={styles.panel}>
			<Stack gap="md" className={styles.content}>
				{selectedTrace && (
					<Group gap={4}>
						<SegmentedControl
							data={segmentedControlData}
							onChange={(value) =>
								setViewMode(value as RoutePlaygroundViewMode)
							}
							size="xs"
							value={effectiveViewMode}
						/>
					</Group>
				)}

				{selectedTrace && (
					<Stack gap="sm" className={styles.traceContent}>
						<Group justify="space-between">
							<Group gap="xs">
								{isHttpTrace(selectedTrace) ? (
									<Badge color={getMethodColor(selectedTrace.method)}>
										{selectedTrace.method}
									</Badge>
								) : (
									<Badge
										color={
											isMiddlewareTrace(selectedTrace)
												? getSpanColor("prehandler")
												: getMethodColor(selectedTrace.method)
										}
										styles={{ label: { textTransform: "none" } }}
										variant="light"
									>
										{isMiddlewareTrace(selectedTrace)
											? "Middleware"
											: getTraceKindLabel(selectedTrace.method)}
									</Badge>
								)}
								<Text fw={700} size="sm">
									{selectedTrace.url}
								</Text>
							</Group>
							<Group gap="xs">
								{isHttpTrace(selectedTrace) ? (
									<Badge color={getStatusCodeColor(selectedTrace.statusCode)}>
										{selectedTrace.statusCode ?? "-"} {selectedTrace.status}
									</Badge>
								) : (
									<Badge
										color={getTraceOutcome(selectedTrace).color}
										styles={{ label: { textTransform: "none" } }}
									>
										{getTraceOutcome(selectedTrace).label}
									</Badge>
								)}
								{!synthetic && (
									<Badge color="gray" variant="light">
										{Math.round(selectedTrace.durationMs)} ms
									</Badge>
								)}
							</Group>
						</Group>

						{effectiveViewMode === "response" && (
							<TraceResponseTab
								trace={selectedTrace}
								noTraceWarning={synthetic}
							/>
						)}

						{effectiveViewMode === "trace" && (
							<TraceListTab trace={selectedTrace} />
						)}

						{effectiveViewMode === "graph" && (
							<Suspense fallback={<Loader size="sm" />}>
								<TraceTreeTab trace={selectedTrace} />
							</Suspense>
						)}
					</Stack>
				)}

				{!selectedTrace && <EmptyState />}
			</Stack>
		</Paper>
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
