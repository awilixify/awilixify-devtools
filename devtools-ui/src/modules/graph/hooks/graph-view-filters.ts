import type { ModuleGraphNode } from "@/api/model";
import type { GraphData } from "../types";
import { getModuleSelectionRelations } from "./module-selection-relations";
import { getOperationConnections } from "./operation-flow-edges";

// Client-side "impact only" filter. Kept on the FE so toggling it filters the
// already-fetched graph instead of hitting the backend. Search is intentionally
// NOT a filter — it only drives the minimap highlight and camera focus (see
// use-graph-flow), so the full graph stays on screen while searching.
export function filterGraphByImpact(
	graph: GraphData,
	{ impactOnly }: { impactOnly: boolean },
): GraphData {
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

export function filterGraphByServices(
	graph: GraphData,
	visibleServiceNames: ReadonlySet<string>,
): GraphData {
	const modules = graph.modules.filter((module) =>
		visibleServiceNames.has(module.serviceName),
	);
	const moduleIds = new Set(modules.map((module) => module.id));

	return {
		...graph,
		modules,
		edges: graph.edges.filter(
			(edge) => moduleIds.has(edge.from) && moduleIds.has(edge.to),
		),
		globalProviderGroups: graph.globalProviderGroups.filter((group) =>
			moduleIds.has(group.moduleId),
		),
	};
}

// "Related only" for a selected module: keep the module and its direct
// neighbours. Skipped when a provider is focused (filterProviderFocusGraph
// owns that case) or when nothing is selected. This used to be the backend's
// `relatedTo` filter; it moved here because the selected id can be a group id
// that only exists on the client.
export function filterGraphByRelated(
	graph: GraphData,
	{
		selectedModuleId,
		showRelatedOnly,
		hasProviderFocus,
	}: {
		selectedModuleId: string | null;
		showRelatedOnly: boolean;
		hasProviderFocus: boolean;
	},
): GraphData {
	if (!showRelatedOnly || !selectedModuleId || hasProviderFocus) return graph;

	const relations = getModuleSelectionRelations(
		graph.edges,
		getOperationConnections(graph.modules),
		selectedModuleId,
	);
	const moduleIds = new Set([
		selectedModuleId,
		...relations.asyncIds,
		...relations.dependencyIds,
		...relations.dependentIds,
	]);

	return {
		...graph,
		modules: graph.modules.filter((module) => moduleIds.has(module.id)),
		edges: graph.edges.filter(
			(edge) => moduleIds.has(edge.from) && moduleIds.has(edge.to),
		),
	};
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
