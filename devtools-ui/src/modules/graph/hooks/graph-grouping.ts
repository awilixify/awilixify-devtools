import type {
	GetGraphResponse,
	ModuleGraphEdge,
	ModuleGraphNode,
	ModuleProviderImpact,
} from "@/api/model";

// Reshapes the raw (per-instance) graph the backend returns into what the
// canvas renders. When `groupDynamicModules` is on, instances of the same
// module family collapse into a single node; otherwise each instance is its
// own node. Either way, edges are re-pointed at the visible nodes and
// dependency/dependent counts are recomputed. This used to live on the
// backend — it moved here so toggling grouping never refetches.
export function groupGraph(
	graph: GetGraphResponse,
	groupDynamicModules: boolean,
): GetGraphResponse {
	const { modules, sourceToVisibleId } = groupDynamicModules
		? groupModules(graph.modules)
		: toInstanceGroups(graph.modules);

	const edges = dedupeEdges(graph.edges, sourceToVisibleId);
	const { dependencyCount, dependentCount } = getEdgeCounts(edges);

	return {
		...graph,
		modules: modules.map((module) => ({
			...module,
			dependencyCount: dependencyCount.get(module.id) ?? 0,
			dependentCount: dependentCount.get(module.id) ?? 0,
		})),
		edges,
	};
}

type ShapedModules = {
	modules: ModuleGraphNode[];
	// Maps each source instance id to the id of the node that represents it on
	// screen (itself when ungrouped, the group id when grouped).
	sourceToVisibleId: Map<string, string>;
};

function toInstanceGroups(modules: ModuleGraphNode[]): ShapedModules {
	const familyCounts = getFamilyCounts(modules);

	return {
		modules: modules.map((module) => ({
			...module,
			grouped: false,
			familyInstanceCount: familyCounts.get(getModuleFamilyKey(module)) ?? 1,
			instanceCount: 1,
			instances: [module],
		})),
		sourceToVisibleId: new Map(modules.map((module) => [module.id, module.id])),
	};
}

function groupModules(modules: ModuleGraphNode[]): ShapedModules {
	const families = new Map<string, ModuleGraphNode[]>();

	for (const module of modules) {
		const key = getModuleFamilyKey(module);
		families.set(key, [...(families.get(key) ?? []), module]);
	}

	const sourceToVisibleId = new Map<string, string>();

	const groupedModules = [...families.entries()].map(([key, instances]) => {
		const [first] = instances;
		const isGroup = instances.length > 1 || Boolean(first.dynamic);
		const id = isGroup ? `group:${slugify(key)}` : first.id;

		for (const instance of instances) {
			sourceToVisibleId.set(instance.id, id);
		}

		return {
			...first,
			id,
			name: key,
			baseName: key,
			dynamic:
				instances.length === 1
					? first.dynamic
					: { hash: `${instances.length} instances`, paramsPreview: "" },
			kind: getGroupKind(instances),
			grouped: instances.length > 1,
			familyInstanceCount: instances.length,
			instanceCount: instances.length,
			instances,
			providers: uniqueStrings(instances.map((module) => module.providers)),
			exports: uniqueStrings(instances.map((module) => module.exports)),
			controllers: uniqueStrings(instances.map((module) => module.controllers)),
			queryHandlers: uniqueStrings(
				instances.map((module) => module.queryHandlers),
			),
			commandHandlers: uniqueStrings(
				instances.map((module) => module.commandHandlers),
			),
			queryPreHandlers: uniqueStrings(
				instances.map((module) => module.queryPreHandlers),
			),
			queryPreHandlerExports: uniqueStrings(
				instances.map((module) => module.queryPreHandlerExports),
			),
			commandPreHandlers: uniqueStrings(
				instances.map((module) => module.commandPreHandlers),
			),
			commandPreHandlerExports: uniqueStrings(
				instances.map((module) => module.commandPreHandlerExports),
			),
			interceptors: uniqueStrings(
				instances.map((module) => module.interceptors),
			),
			interceptorExports: uniqueStrings(
				instances.map((module) => module.interceptorExports),
			),
			initializers: uniqueStrings(
				instances.map((module) => module.initializers),
			),
			initializerExports: uniqueStrings(
				instances.map((module) => module.initializerExports),
			),
			providerAllowCircular: mergeRecords(
				instances.map((module) => module.providerAllowCircular),
			),
			providerIsClass: mergeRecords(
				instances.map((module) => module.providerIsClass),
			),
			providerIsFactory: mergeRecords(
				instances.map((module) => module.providerIsFactory),
			),
			providerDependencies: mergeRecords(
				instances.map((module) => module.providerDependencies),
			),
			providerEager: mergeRecords(
				instances.map((module) => module.providerEager),
			),
			providerInitAfter: mergeRecords(
				instances.map((module) => module.providerInitAfter),
			),
			lifetimeTypes: mergeRecords(
				instances.map((module) => module.lifetimeTypes),
			),
			queryHandlerKeys: mergeRecords(
				instances.map((module) => module.queryHandlerKeys),
			),
			commandHandlerKeys: mergeRecords(
				instances.map((module) => module.commandHandlerKeys),
			),
			queryPreHandlerClassNames: mergeRecords(
				instances.map((module) => module.queryPreHandlerClassNames),
			),
			commandPreHandlerClassNames: mergeRecords(
				instances.map((module) => module.commandPreHandlerClassNames),
			),
			routes: uniqueBy(
				instances.flatMap((module) => module.routes),
				(route) =>
					`${route.method}:${route.path}:${route.controller}:${route.handler}`,
			),
			entrypoints: uniqueBy(
				instances.flatMap((module) => module.entrypoints),
				(entrypoint) =>
					`${entrypoint.type}:${entrypoint.label}:${entrypoint.controller}:${entrypoint.handler}:${entrypoint.initializerKey}`,
			),
			// Union of instance impacts, so a grouped node correctly reports impact
			// when any of its instances is impacted.
			impact: mergeImpact(instances.map((module) => module.impact)),
		};
	});

	return { modules: groupedModules, sourceToVisibleId };
}

function dedupeEdges(
	edges: ModuleGraphEdge[],
	sourceToVisibleId: Map<string, string>,
): ModuleGraphEdge[] {
	const byId = new Map<string, ModuleGraphEdge>();

	for (const edge of edges) {
		const from = sourceToVisibleId.get(edge.from);
		const to = sourceToVisibleId.get(edge.to);

		if (!from || !to || from === to) continue;

		const nextEdge = { ...edge, from, to };
		byId.set(`${nextEdge.from}:${nextEdge.to}:${nextEdge.type}`, nextEdge);
	}

	return [...byId.values()];
}

function getEdgeCounts(edges: ModuleGraphEdge[]): {
	dependencyCount: Map<string, number>;
	dependentCount: Map<string, number>;
} {
	const dependencyCount = new Map<string, number>();
	const dependentCount = new Map<string, number>();

	for (const edge of edges) {
		dependencyCount.set(edge.from, (dependencyCount.get(edge.from) ?? 0) + 1);
		dependentCount.set(edge.to, (dependentCount.get(edge.to) ?? 0) + 1);
	}

	return { dependencyCount, dependentCount };
}

function getModuleFamilyKey(module: ModuleGraphNode): string {
	return module.baseName ?? module.name.replace(/_[a-f0-9]{4,}$/i, "");
}

function getFamilyCounts(modules: ModuleGraphNode[]): Map<string, number> {
	const counts = new Map<string, number>();

	for (const module of modules) {
		const key = getModuleFamilyKey(module);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return counts;
}

function getGroupKind(instances: ModuleGraphNode[]): ModuleGraphNode["kind"] {
	if (instances.some((instance) => instance.kind === "root")) return "root";
	if (instances.every((instance) => instance.kind === "global"))
		return "global";

	return "feature";
}

function mergeImpact(impacts: ModuleProviderImpact[]): ModuleProviderImpact {
	return {
		affected: uniqueStrings(impacts.map((impact) => impact.affected)),
		added: uniqueStrings(impacts.map((impact) => impact.added)),
		changed: uniqueStrings(impacts.map((impact) => impact.changed)),
		deleted: uniqueStrings(impacts.map((impact) => impact.deleted)),
	};
}

function uniqueStrings(groups: string[][]): string[] {
	return [...new Set(groups.flat())];
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
	return [...new Map(items.map((item) => [key(item), item])).values()];
}

function mergeRecords<T>(records: Array<Record<string, T>>): Record<string, T> {
	return Object.assign({}, ...records);
}

function slugify(value: string): string {
	return value
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase();
}
