import type {
	GetGraphResponse,
	ModuleGraphEdge,
	ModuleGraphNode,
} from "@/api/model";

// Client-side "impact only" filter. Kept on the FE so toggling it filters the
// already-fetched graph instead of hitting the backend. Search is intentionally
// NOT a filter — it only drives the minimap highlight and camera focus (see
// use-graph-flow), so the full graph stays on screen while searching.
export function filterGraphByImpact(
	graph: GetGraphResponse,
	{ impactOnly }: { impactOnly: boolean },
): GetGraphResponse {
	if (!impactOnly) return graph;

	const moduleIds = new Set(
		graph.modules
			.filter((module) => moduleHasImpact(module))
			.map((module) => module.id),
	);

	return {
		...graph,
		modules: graph.modules.filter((module) => moduleIds.has(module.id)),
		edges: graph.edges.filter(
			(edge) => moduleIds.has(edge.from) && moduleIds.has(edge.to),
		),
	};
}

// "Related only" for a selected module: keep the module and its direct
// neighbours. Skipped when a provider is focused (filterProviderFocusGraph
// owns that case) or when nothing is selected. This used to be the backend's
// `relatedTo` filter; it moved here because the selected id can be a group id
// that only exists on the client.
export function filterGraphByRelated(
	graph: GetGraphResponse,
	{
		selectedModuleId,
		showRelatedOnly,
		hasProviderFocus,
	}: {
		selectedModuleId: string | null;
		showRelatedOnly: boolean;
		hasProviderFocus: boolean;
	},
): GetGraphResponse {
	if (!showRelatedOnly || !selectedModuleId || hasProviderFocus) return graph;

	const moduleIds = getIdsWithDirectNeighbours(
		graph.edges,
		new Set([selectedModuleId]),
	);

	return {
		...graph,
		modules: graph.modules.filter((module) => moduleIds.has(module.id)),
		edges: graph.edges.filter(
			(edge) => moduleIds.has(edge.from) && moduleIds.has(edge.to),
		),
	};
}

function getIdsWithDirectNeighbours(
	edges: ModuleGraphEdge[],
	moduleIds: Set<string>,
): Set<string> {
	const relatedIds = new Set(moduleIds);

	for (const edge of edges) {
		if (moduleIds.has(edge.from)) relatedIds.add(edge.to);
		if (moduleIds.has(edge.to)) relatedIds.add(edge.from);
	}

	return relatedIds;
}

function moduleHasImpact(module: ModuleGraphNode): boolean {
	const { affected, added, changed, deleted } = module.impact;

	return (
		affected.length > 0 ||
		added.length > 0 ||
		changed.length > 0 ||
		deleted.length > 0
	);
}
