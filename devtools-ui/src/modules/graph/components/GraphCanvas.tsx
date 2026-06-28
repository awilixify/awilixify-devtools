import {
	ActionIcon,
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
	ReactFlow,
	ViewportPortal,
} from "@xyflow/react";
import { useMemo, useState } from "react";
import { useGraphSettings } from "../GraphSettingsContext";
import { matchesSearch } from "../graph-search";
import { useGraphFlow } from "../hooks/use-graph-flow";
import type { ModuleFlowEdge, ModuleFlowNode } from "../types";
import { GraphLegend } from "./GraphLegend";
import legendStyles from "./GraphLegend.module.css";
import { GraphSettings } from "./GraphSettings";
import { ModuleNode } from "./ModuleNode/ModuleNode";

const LEGEND_OPEN_STORAGE_KEY = "awilixify-devtools:graph:legend-open";

export function GraphCanvas() {
	const {
		providerFocus,
		searchQuery,
		selectedModuleId,
		setProviderFocus,
		setSelectedModuleId,
	} = useGraphSettings();
	const { edges, flowRef, nodes, onEdgesChange, onNodesChange, loading } =
		useGraphFlow();
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
	const globalBandBounds = useMemo(
		() => (loading ? null : getGlobalModulesBounds(nodes)),
		[loading, nodes],
	);

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
				minZoom={0.25}
				maxZoom={0.7}
				nodesDraggable={false}
				translateExtent={translateExtent}
			>
				<GlobalModulesBand bounds={globalBandBounds} />
				<Background />
				<MiniMap
					nodeColor={(node: ModuleFlowNode) => {
						if (node.id === minimapSelectedModuleId) {
							return "var(--graph-color-selected)";
						}
						if (isSearchMatch(node)) {
							return "var(--graph-color-search)";
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
				>
					{globalBandBounds ? (
						<rect
							fill="var(--graph-color-global)"
							fillOpacity={0.12}
							height={globalBandBounds.height}
							pointerEvents="none"
							rx={16}
							stroke="var(--graph-color-global)"
							strokeWidth={8}
							width={globalBandBounds.width}
							x={globalBandBounds.x}
							y={globalBandBounds.y}
						/>
					) : null}
				</MiniMap>
			</ReactFlow>

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
			style={data?.color ? { stroke: data.color, strokeWidth: 2 } : undefined}
		/>
	);
}

function GlobalModulesBand({
	bounds,
}: {
	bounds: ReturnType<typeof getGlobalModulesBounds>;
}) {
	if (!bounds) return null;

	return (
		<ViewportPortal>
			<div
				className="global-modules-band"
				style={{
					height: bounds.height,
					transform: `translate(${bounds.x}px, ${bounds.y}px)`,
					width: bounds.width,
				}}
			>
				<span className="global-modules-band-label">Global modules</span>
			</div>
		</ViewportPortal>
	);
}

function getGlobalModulesBounds(nodes: ModuleFlowNode[]) {
	const globalNodes = nodes.filter((node) => node.data.kind === "global");

	if (globalNodes.length === 0) return null;

	const paddingX = 18;
	const paddingTop = 34;
	const paddingBottom = 18;
	const minX = Math.min(...globalNodes.map((node) => node.position.x));
	const minY = Math.min(...globalNodes.map((node) => node.position.y));
	const maxX = Math.max(
		...globalNodes.map((node) => node.position.x + getNodeWidth(node)),
	);
	const maxY = Math.max(
		...globalNodes.map((node) => node.position.y + getNodeHeight(node)),
	);

	return {
		height: maxY - minY + paddingTop + paddingBottom,
		width: maxX - minX + paddingX * 2,
		x: minX - paddingX,
		y: minY - paddingTop,
	};
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
