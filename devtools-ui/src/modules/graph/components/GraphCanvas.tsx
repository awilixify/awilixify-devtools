import {
	ActionIcon,
	Alert,
	Divider,
	Group,
	LoadingOverlay,
	Paper,
	Text,
	Tooltip,
} from "@mantine/core";
import {
	Background,
	BaseEdge,
	type CoordinateExtent,
	type EdgeProps,
	getSmoothStepPath,
	MiniMap,
	MiniMapNode,
	type MiniMapNodeProps,
	ReactFlow,
	ViewportPortal,
} from "@xyflow/react";
import { useMemo, useState } from "react";
import { useGraphSettings } from "../GraphSettingsContext";
import { matchesSearch } from "../graph-search";
import { useGraphFlow } from "../hooks/use-graph-flow";
import {
	getServiceBackgroundColor,
	getServiceBorderColor,
	getServiceColor,
} from "../service-colors";
import type { ModuleFlowEdge, ModuleFlowNode } from "../types";
import { GraphLegend } from "./GraphLegend";
import legendStyles from "./GraphLegend.module.css";
import { GraphSettings } from "./GraphSettings";
import { ModuleNode } from "./ModuleNode/ModuleNode";
import { OverviewedApps } from "./OverviewedApps";

const LEGEND_OPEN_STORAGE_KEY = "awilixify-devtools:graph:legend-open";

export function GraphCanvas() {
	const {
		providerFocus,
		searchQuery,
		selectedModuleId,
		setProviderFocus,
		setSelectedModuleId,
	} = useGraphSettings();
	const {
		edges,
		error,
		flowRef,
		nodes,
		onEdgesChange,
		onNodesChange,
		loading,
		serviceNames,
		setServiceVisible,
		visibleServiceNames,
	} = useGraphFlow();
	const [legendOpen, setLegendOpen] = useState(readStoredLegendOpen);
	const minimapSelectedModuleId =
		selectedModuleId ?? getProviderFocusModuleId(providerFocus);
	// Mirror the on-graph title highlight (HighlightedText): a node matches when
	// its name fuzzy-matches the search query.
	const isSearchMatch = (node: ModuleFlowNode) =>
		matchesSearch(node.data.name, searchQuery);

	// Keep panning bounded to the graph content (plus breathing room) so the
	// viewport can't be dragged off into empty space indefinitely.
	const translateExtent = useMemo(
		() => (loading ? undefined : getTranslateExtent(nodes)),
		[loading, nodes],
	);
	const serviceBounds = useMemo(
		() => (loading ? [] : getServiceBounds(nodes, edges)),
		[edges, loading, nodes],
	);
	const overviewedApps = useMemo(
		() =>
			serviceNames.map((serviceName) => ({
				background: getServiceBackgroundColor(serviceName),
				color: getServiceColor(serviceName),
				name: serviceName,
				visible: visibleServiceNames.has(serviceName),
			})),
		[serviceNames, visibleServiceNames],
	);
	const minimapNodeComponent = useMemo(() => {
		const serviceByAnchorNodeId = new Map(
			serviceBounds.map((service) => [service.anchorNodeId, service]),
		);

		return function ServiceMiniMapNode(props: MiniMapNodeProps) {
			const service = serviceByAnchorNodeId.get(props.id);

			return (
				<>
					{service && (
						<rect
							fill={service.background}
							height={service.height}
							pointerEvents="none"
							rx={8}
							stroke={service.color}
							strokeWidth={5}
							width={service.width}
							x={service.x}
							y={service.y}
						/>
					)}
					<MiniMapNode {...props} />
				</>
			);
		};
	}, [serviceBounds]);

	return (
		<Paper radius="md" p={0} className="graph-panel">
			<div className={legendStyles.legend}>
				<Paper
					className={legendStyles.legendPanel}
					data-collapsed={!legendOpen || undefined}
					p="xs"
					radius="md"
					shadow="sm"
				>
					<Group gap="xs" mb={legendOpen ? "xs" : 0} wrap="nowrap">
						<Tooltip
							label={legendOpen ? "Hide legend" : "Show legend"}
							position="right"
							withArrow
						>
							<ActionIcon
								aria-label={legendOpen ? "Hide legend" : "Show legend"}
								onClick={() =>
									setLegendOpen((open) => {
										const next = !open;
										writeStoredLegendOpen(next);
										return next;
									})
								}
								size="sm"
								variant="subtle"
							>
								{legendOpen ? <PanelCloseIcon /> : <LegendIcon />}
							</ActionIcon>
						</Tooltip>
						{legendOpen && (
							<Text c="dimmed" fw={700} size="xs" tt="uppercase">
								Legend
							</Text>
						)}
					</Group>
					{legendOpen && (
						<>
							<GraphLegend />
							<Divider my="sm" />
							<GraphSettings />
						</>
					)}
				</Paper>
			</div>

			<OverviewedApps
				apps={overviewedApps}
				onCenter={(serviceName) => {
					const service = serviceBounds.find(
						(candidate) => candidate.id === serviceName,
					);
					if (!service || !flowRef.current) return;

					flowRef.current.setCenter(
						service.x + service.width / 2,
						service.y + service.height / 2,
						{
							duration: 400,
							zoom: flowRef.current.getZoom(),
						},
					);
				}}
				onVisibilityChange={setServiceVisible}
			/>

			<ReactFlow
				nodes={loading ? [] : nodes}
				edges={loading ? [] : edges}
				nodeTypes={{
					module: ModuleNode,
				}}
				edgeTypes={{
					moduleDependency: ModuleDependencyEdge,
				}}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onInit={(instance) => {
					flowRef.current = instance;
				}}
				onNodeClick={(_, node) => {
					setProviderFocus(null);
					setSelectedModuleId(node.id);
				}}
				onEdgeClick={() => {
					setProviderFocus(null);
					setSelectedModuleId(null);
				}}
				onPaneClick={() => {
					// A focused provider is deselected first, keeping the module
					// selected; a second pane click then clears the module.
					if (providerFocus) {
						setProviderFocus(null);
						return;
					}
					setSelectedModuleId(null);
				}}
				minZoom={0.2}
				maxZoom={0.7}
				nodesDraggable={false}
				translateExtent={translateExtent}
			>
				<Background />
				<ServiceBands services={serviceBounds} />
				<MiniMap
					nodeComponent={minimapNodeComponent}
					nodeColor={(node: ModuleFlowNode) => {
						if (node.id === minimapSelectedModuleId) {
							return "var(--graph-color-selected)";
						}
						if (isSearchMatch(node)) {
							return "var(--graph-color-search)";
						}
						if (hasNodeClass(node, "dependency-graph-node")) {
							return "var(--graph-color-dependency)";
						}
						if (hasNodeClass(node, "dependent-graph-node")) {
							return "var(--graph-color-dependent)";
						}
						if (hasNodeClass(node, "async-graph-node")) {
							return "var(--graph-color-async)";
						}
						if (node.data.kind === "global") {
							return "var(--graph-color-global)";
						}
						return "var(--mantine-color-gray-3)";
					}}
					nodeStrokeColor={(node: ModuleFlowNode) => {
						if (node.id === minimapSelectedModuleId) {
							return "var(--mantine-color-teal-9)";
						}
						if (isSearchMatch(node)) {
							return "var(--mantine-color-indigo-9)";
						}
						if (hasNodeClass(node, "dependency-graph-node")) {
							return "var(--mantine-color-blue-9)";
						}
						if (hasNodeClass(node, "dependent-graph-node")) {
							return "var(--mantine-color-yellow-9)";
						}
						if (hasNodeClass(node, "async-graph-node")) {
							return "var(--graph-color-async)";
						}
						if (node.data.kind === "global") {
							return "var(--mantine-color-grape-9)";
						}
						return "var(--mantine-color-gray-5)";
					}}
					nodeStrokeWidth={2}
					onClick={(_event, position) => {
						flowRef.current?.setCenter(position.x, position.y, {
							duration: 400,
							zoom: flowRef.current.getZoom(),
						});
					}}
					pannable
					position="bottom-left"
					style={{ height: 180, width: 230 }}
					zoomable
				/>
			</ReactFlow>

			{error && (
				<Alert
					className="graph-target-error"
					color="red"
					title="Some services could not be loaded"
					variant="light"
				>
					{error}
				</Alert>
			)}

			<LoadingOverlay
				visible={loading}
				overlayProps={{
					backgroundOpacity: 1,
					blur: 0,
				}}
			/>
		</Paper>
	);
}

function LegendIcon() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="18"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width="18"
		>
			<path d="M4 7h16" />
			<path d="M4 12h16" />
			<path d="M4 17h16" />
			<circle cx="7" cy="7" r="1" />
			<circle cx="7" cy="12" r="1" />
			<circle cx="7" cy="17" r="1" />
		</svg>
	);
}

function PanelCloseIcon() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="18"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width="18"
		>
			<path d="M5 12h14" />
			<path d="m11 6-6 6 6 6" />
		</svg>
	);
}

function getProviderFocusModuleId(
	providerFocus: ReturnType<typeof useGraphSettings>["providerFocus"],
): string | null {
	return providerFocus?.occurrenceId.split(":")[0] ?? null;
}

function hasNodeClass(node: ModuleFlowNode, className: string): boolean {
	return node.className?.split(" ").includes(className) ?? false;
}

function readStoredLegendOpen(): boolean {
	if (typeof window === "undefined") return true;

	const stored = window.localStorage.getItem(LEGEND_OPEN_STORAGE_KEY);

	if (stored === "true") return true;
	if (stored === "false") return false;
	return true;
}

function writeStoredLegendOpen(open: boolean) {
	window.localStorage.setItem(LEGEND_OPEN_STORAGE_KEY, String(open));
}

function ModuleDependencyEdge({
	data,
	markerEnd,
	sourceX,
	sourceY,
	targetX,
	targetY,
}: EdgeProps<ModuleFlowEdge>) {
	const [fallbackPath] = getSmoothStepPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
	});

	return (
		<BaseEdge
			path={data?.path ?? fallbackPath}
			markerEnd={markerEnd}
			style={
				data?.color
					? {
							stroke: data.color,
							strokeWidth: data.kind === "operation" ? 3 : 2,
						}
					: undefined
			}
		/>
	);
}

function ServiceBands({
	services,
}: {
	services: ReturnType<typeof getServiceBounds>;
}) {
	return (
		<ViewportPortal>
			{services.map((service) => (
				<div
					className="service-graph-band"
					key={service.id}
					style={{
						background: service.background,
						borderColor: getServiceBorderColor(service.id),
						height: service.height,
						transform: `translate(${service.x}px, ${service.y}px)`,
						width: service.width,
					}}
				>
					<span
						className="service-graph-band-label"
						style={{ color: service.color }}
					>
						{service.name}
					</span>
				</div>
			))}
		</ViewportPortal>
	);
}

function getServiceBounds(nodes: ModuleFlowNode[], edges: ModuleFlowEdge[]) {
	const nodesByService = new Map<string, ModuleFlowNode[]>();

	for (const node of nodes) {
		nodesByService.set(node.data.serviceName, [
			...(nodesByService.get(node.data.serviceName) ?? []),
			node,
		]);
	}

	const paddingX = 40;
	const paddingTop = 60;
	// Provider-mode operation links use a 48px vertical lead. Keep the service
	// boundary beyond that lane so a cross-service segment never sits on it.
	const paddingBottom = 72;

	return [...nodesByService.entries()].map(([id, serviceNodes]) => {
		const serviceNodeIds = new Set(serviceNodes.map((node) => node.id));
		const edgePoints = edges
			.filter(
				(edge) =>
					serviceNodeIds.has(edge.source) && serviceNodeIds.has(edge.target),
			)
			.flatMap(getRoutedEdgePoints);
		const minX = Math.min(
			...serviceNodes.map((node) => node.position.x),
			...edgePoints.map((point) => point.x),
		);
		const minY = Math.min(
			...serviceNodes.map((node) => node.position.y),
			...edgePoints.map((point) => point.y),
		);
		const maxX = Math.max(
			...serviceNodes.map((node) => node.position.x + getNodeWidth(node)),
			...edgePoints.map((point) => point.x),
		);
		const maxY = Math.max(
			...serviceNodes.map((node) => node.position.y + getNodeHeight(node)),
			...edgePoints.map((point) => point.y),
		);

		return {
			anchorNodeId: serviceNodes[0]?.id ?? id,
			background: getServiceBackgroundColor(id),
			color: getServiceColor(id),
			height: maxY - minY + paddingTop + paddingBottom,
			id,
			name: serviceNodes[0]?.data.serviceName ?? id,
			width: maxX - minX + paddingX * 2,
			x: minX - paddingX,
			y: minY - paddingTop,
		};
	});
}

function getRoutedEdgePoints(
	edge: ModuleFlowEdge,
): Array<{ x: number; y: number }> {
	const path = edge.data?.path;
	if (!path) return [];

	return [...path.matchAll(/[ML]\s+([-\d.]+)\s+([-\d.]+)/g)].map(
		([, x, y]) => ({
			x: Number(x),
			y: Number(y),
		}),
	);
}

// Padding around the content bounding box, so the outermost nodes can still be
// scrolled a little away from the very edge of the pane.
const TRANSLATE_EXTENT_PADDING = 1000;

function getTranslateExtent(
	nodes: ModuleFlowNode[],
): CoordinateExtent | undefined {
	if (nodes.length === 0) return undefined;

	const minX = Math.min(...nodes.map((node) => node.position.x));
	const minY = Math.min(...nodes.map((node) => node.position.y));
	const maxX = Math.max(
		...nodes.map((node) => node.position.x + getNodeWidth(node)),
	);
	const maxY = Math.max(
		...nodes.map((node) => node.position.y + getNodeHeight(node)),
	);

	return [
		[minX - TRANSLATE_EXTENT_PADDING, minY - TRANSLATE_EXTENT_PADDING],
		[maxX + TRANSLATE_EXTENT_PADDING, maxY + TRANSLATE_EXTENT_PADDING],
	];
}

function getNodeWidth(node: ModuleFlowNode) {
	return node.measured?.width ?? node.width ?? 260;
}

function getNodeHeight(node: ModuleFlowNode) {
	return node.measured?.height ?? node.height ?? 150;
}
