import {
	type ReactFlowInstance,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import { useEffect, useMemo, useRef } from "react";
import { useGraphSettings } from "../GraphSettingsContext.js";
import { findBestSearchMatch } from "../graph-search";
import type { ModuleFlowEdge, ModuleFlowNode } from "../types";
import { toFlowEdges } from "./flow-edges";
import { toFlowNodes } from "./flow-nodes";
import { groupGraph } from "./graph-grouping";
import { layout } from "./graph-layout";
import {
	filterGraphByImpact,
	filterGraphByRelated,
} from "./graph-view-filters";
import {
	filterProviderFocusGraph,
	getProviderFocusState,
} from "./provider-focus";
import { useModuleGraphData } from "./use-module-graph-data.js";

const SELECTED_NODE_MAX_ZOOM = 0.45;

export function useGraphFlow() {
	const { graph, loading } = useModuleGraphData();
	const {
		centerModuleRequest,
		groupDynamicModules,
		impactOnly,
		providerFocus,
		searchQuery,
		searchSubmitSeq,
		selectedModuleId,
		setProviderFocus,
		setSelectedModuleAvailable,
		setSelectedModuleId,
		showRelatedOnly,
		viewMode,
	} = useGraphSettings();

	const [nodes, setNodes, onNodesChange] = useNodesState<ModuleFlowNode>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<ModuleFlowEdge>([]);
	const flowRef = useRef<ReactFlowInstance<
		ModuleFlowNode,
		ModuleFlowEdge
	> | null>(null);
	const previousViewportFocusKeyRef = useRef<string | null | undefined>(
		undefined,
	);
	const processedCenterSeqRef = useRef(0);
	const processedSearchSubmitSeqRef = useRef(searchSubmitSeq);
	const lastFocusedSearchRef = useRef<string | null>(null);

	const selectedModule = useMemo(
		() =>
			selectedModuleId
				? (nodes.find((node) => node.id === selectedModuleId)?.data ?? null)
				: null,
		[nodes, selectedModuleId],
	);

	useEffect(() => {
		setSelectedModuleAvailable(
			selectedModule !== null || providerFocus !== null,
		);
	}, [providerFocus, selectedModule, setSelectedModuleAvailable]);

	useEffect(() => {
		if (!graph) {
			setNodes([]);
			setEdges([]);
			return;
		}

		const viewportFocusKey = getViewportFocusKey(
			selectedModuleId,
			providerFocus,
		);
		const previousViewportFocusKey = previousViewportFocusKeyRef.current;
		const isDeselecting =
			previousViewportFocusKey !== undefined &&
			previousViewportFocusKey !== null &&
			viewportFocusKey === null;
		previousViewportFocusKeyRef.current = viewportFocusKey;

		// All view shaping happens on the client now, so no toggle refetches.
		// Order mirrors the old backend pipeline: impact filter → group → related.
		// Search is NOT a filter — the full graph stays visible; searchQuery only
		// drives the minimap highlight and camera focus below.
		const shapedGraph = filterGraphByRelated(
			groupGraph(
				filterGraphByImpact(graph, { impactOnly }),
				groupDynamicModules,
			),
			{
				selectedModuleId,
				showRelatedOnly,
				hasProviderFocus: providerFocus !== null,
			},
		);
		const providerFocusState = getProviderFocusState(
			shapedGraph.modules,
			providerFocus,
		);
		const visibleGraph = filterProviderFocusGraph({
			graph: shapedGraph,
			providerFocus,
			relatedOnly: showRelatedOnly,
		});

		const flowNodes = toFlowNodes({
			graph: visibleGraph,
			providerFocus: providerFocusState,
			selectedModuleId,
			viewMode,
		});
		const flowEdges = toFlowEdges({
			edges: visibleGraph.edges,
			selectedModuleId,
			viewMode,
		});

		layout(flowNodes, flowEdges, {
			pinGlobalModulesToTop: true,
		}).then((layouted) => {
			setNodes(layouted.nodes);
			setEdges(layouted.edges);
			window.requestAnimationFrame(() => {
				if (isDeselecting) return;

				const normalizedQuery = searchQuery.trim();
				const searchMatchNode = normalizedQuery
					? findBestSearchMatch(
							layouted.nodes,
							(node) => node.data.name,
							searchQuery,
						)
					: null;
				// Only auto-focus when the query itself changed, so clicking a module
				// (which re-lays out the graph) doesn't keep snapping the camera back
				// to the match while a query sits in the search box.
				const isNewQuery = normalizedQuery !== lastFocusedSearchRef.current;
				// Whether a query was focused just before this run — lets us detect a
				// search reset (box cleared) so it keeps the camera instead of refitting.
				const wasSearchFocused = Boolean(lastFocusedSearchRef.current);
				const selectedNode = viewportFocusKey
					? getViewportFocusNode(layouted.nodes, viewportFocusKey)
					: null;

				if (!normalizedQuery) {
					lastFocusedSearchRef.current = "";
				}

				withFlowInstance(flowRef, (flow) => {
					// A newly-entered search query centers its first match and takes
					// precedence over the current selection. Keep the current zoom so
					// re-searching only pans, never zooms out.
					if (searchMatchNode && isNewQuery) {
						lastFocusedSearchRef.current = normalizedQuery;
						centerNode(flow, searchMatchNode, { keepZoom: true });
						return;
					}

					if (selectedNode) {
						// Selecting a module (or focusing a provider) only pans to it and
						// keeps the current zoom.
						centerNode(flow, selectedNode, { keepZoom: true });
						return;
					}

					// Searching should never fit/zoom the viewport: keep the camera when
					// a match is already focused, or when the query was just cleared.
					if (searchMatchNode || (!normalizedQuery && wasSearchFocused)) return;

					flow.fitView({
						padding: 0.18,
						duration: 260,
						ease: easeOutCubic,
						interpolate: "smooth",
					});
				});
			});
		});
	}, [
		graph,
		groupDynamicModules,
		impactOnly,
		providerFocus,
		searchQuery,
		selectedModuleId,
		setEdges,
		setNodes,
		showRelatedOnly,
		viewMode,
	]);

	// Submitting the search (Enter) selects the best-matching module, which also
	// opens its drawer and drives the usual selection centering.
	useEffect(() => {
		if (searchSubmitSeq === processedSearchSubmitSeqRef.current) return;
		processedSearchSubmitSeqRef.current = searchSubmitSeq;

		const match = findBestSearchMatch(
			nodes,
			(node) => node.data.name,
			searchQuery,
		);
		if (!match) return;

		setProviderFocus(null);
		setSelectedModuleId(match.id);
	}, [
		nodes,
		searchQuery,
		searchSubmitSeq,
		setProviderFocus,
		setSelectedModuleId,
	]);

	// Center the camera on a module requested from elsewhere (e.g. the drawer's
	// imports/used-by lists) without selecting it. Resolve by id or name; if the
	// node isn't laid out yet, leave the seq unprocessed so a later layout retries.
	useEffect(() => {
		if (!centerModuleRequest) return;
		if (centerModuleRequest.seq === processedCenterSeqRef.current) return;

		const node = nodes.find(
			(candidate) =>
				candidate.id === centerModuleRequest.key ||
				candidate.data.name === centerModuleRequest.key,
		);

		if (!node) return;

		processedCenterSeqRef.current = centerModuleRequest.seq;
		withFlowInstance(flowRef, (flow) => centerNode(flow, node));
	}, [centerModuleRequest, nodes]);

	return {
		loading,
		edges,
		flowRef,
		nodes,
		onEdgesChange,
		onNodesChange,
		selectedModule,
	};
}

function getViewportFocusKey(
	selectedModuleId: string | null,
	providerFocus: ReturnType<typeof useGraphSettings>["providerFocus"],
): string | null {
	if (providerFocus) {
		return `provider:${providerFocus.occurrenceId}`;
	}

	if (selectedModuleId) {
		return `module:${selectedModuleId}`;
	}

	return null;
}

function getViewportFocusNode(
	nodes: ModuleFlowNode[],
	viewportFocusKey: string,
): ModuleFlowNode | null {
	const [kind, id] = viewportFocusKey.split(":", 2);
	const nodeId = kind === "provider" ? id : viewportFocusKey.slice(7);

	return nodes.find((node) => node.id === nodeId) ?? null;
}

function centerNode(
	flow: ReactFlowInstance<ModuleFlowNode, ModuleFlowEdge>,
	node: ModuleFlowNode,
	{ keepZoom = false }: { keepZoom?: boolean } = {},
) {
	const width = getNodeWidth(node);
	const height = getNodeHeight(node);
	const currentZoom = flow.getZoom();
	// keepZoom preserves the user's current zoom (used for search focus, so
	// re-searching doesn't jump the zoom). Otherwise cap it so a selected node
	// is comfortably readable.
	const targetZoom = keepZoom
		? currentZoom
		: Math.min(currentZoom, SELECTED_NODE_MAX_ZOOM);

	flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
		duration: 480,
		ease: easeOutCubic,
		interpolate: "smooth",
		zoom: targetZoom,
	});
}

function withFlowInstance(
	flowRef: {
		current: ReactFlowInstance<ModuleFlowNode, ModuleFlowEdge> | null;
	},
	callback: (flow: ReactFlowInstance<ModuleFlowNode, ModuleFlowEdge>) => void,
) {
	if (flowRef.current) {
		callback(flowRef.current);
		return;
	}

	window.requestAnimationFrame(() => {
		if (flowRef.current) {
			callback(flowRef.current);
		}
	});
}

function getNodeWidth(node: ModuleFlowNode): number {
	return node.measured?.width ?? node.width ?? 260;
}

function getNodeHeight(node: ModuleFlowNode): number {
	return node.measured?.height ?? node.height ?? 150;
}

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}
