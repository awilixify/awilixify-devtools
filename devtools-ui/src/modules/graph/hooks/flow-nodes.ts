import clsx from "clsx";
import type { GetGraphResponse } from "@/api/model";
import type {
	GraphViewMode,
	ModuleFlowNode,
	ModuleNodeData,
	ModuleStatCount,
	ModuleStats,
	ProviderFocusState,
} from "../types";
import {
	getGlobalProviderGroups,
	getImportedProviderGroups,
	getLifetimeTypeByName,
	getOwnMembers,
	getProviderGroupColorByModuleId,
	getUsedDecoratorsByKey,
} from "./provider-group";
import { providerNodeHeight } from "./provider-node-metrics";

export function toFlowNodes({
	graph,
	providerFocus,
	selectedModuleId,
	viewMode,
}: {
	graph: GetGraphResponse;
	providerFocus: ProviderFocusState | null;
	selectedModuleId?: string | null;
	viewMode: GraphViewMode;
}): ModuleFlowNode[] {
	const { modules, edges, globalProviderGroups } = graph;

	const moduleById = new Map(modules.map((module) => [module.id, module]));
	const globalModules = modules.filter((module) => module.kind === "global");
	const directDependencyIds = getDirectDependencyIds(edges, selectedModuleId);
	const providerGroupColorByModuleId = getProviderGroupColorByModuleId(
		edges,
		selectedModuleId,
	);
	const lifetimeTypeByName = getLifetimeTypeByName(modules);
	// availableDecorators (static analysis, keyed by class name) isn't in the
	// generated client type yet (pending `npm run generate:api`), so it's read
	// through a cast. Owner modules show these; importers show only used ones.
	const availableDecoratorsByClassName =
		(graph as { availableDecorators?: Record<string, string[]> })
			.availableDecorators ?? {};
	return modules.map((module) => {
		const usedDecoratorsByKey = getUsedDecoratorsByKey(module);
		const globalProviderGroupsDetailed = getGlobalProviderGroups(
			globalProviderGroups,
			globalModules,
			lifetimeTypeByName,
			availableDecoratorsByClassName,
			usedDecoratorsByKey,
		);
		const importedProviderGroups = getImportedProviderGroups(
			module.id,
			edges,
			moduleById,
			lifetimeTypeByName,
			selectedModuleId,
			usedDecoratorsByKey,
			availableDecoratorsByClassName,
			providerGroupColorByModuleId,
		);
		const providerNaming = module as unknown as {
			providerClassNames?: Record<string, string>;
			providerValues?: Record<string, string>;
		};
		const nodeData: ModuleNodeData = {
			...module,
			providerClassNames: providerNaming.providerClassNames ?? {},
			providerValues: providerNaming.providerValues ?? {},
			globalProviderGroups,
			globalProviderGroupsDetailed,
			importedProviderGroups,
			moduleStats: getModuleStats({
				edges,
				globalModules,
				module,
				moduleById,
			}),
			ownMembers: getOwnMembers(module, (key, className) => ({
				used: usedDecoratorsByKey[key] ?? [],
				available: availableDecoratorsByClassName[className] ?? [],
			})),
			isSelectedModule: module.id === selectedModuleId,
			lifetimeTypeByName,
			providerFocus,
			providerRelationColor:
				viewMode === "providers" &&
				selectedModuleId &&
				directDependencyIds.has(module.id)
					? providerGroupColorByModuleId[module.id]
					: undefined,
		};

		const isGlobal = module.kind === "global";

		return {
			id: module.id,
			type: "module",
			data: nodeData,
			className: getNodeClassName(nodeData, selectedModuleId, edges),
			position: { x: 0, y: 0 },
			width:
				viewMode === "providers"
					? isGlobal
						? 430
						: 380
					: isGlobal
						? 320
						: 260,
			height:
				viewMode === "providers"
					? getProviderNodeHeight(nodeData)
					: isGlobal
						? 180
						: 150,
		};
	});
}

function getModuleStats({
	edges,
	globalModules,
	module,
	moduleById,
}: {
	edges: GetGraphResponse["edges"];
	globalModules: GetGraphResponse["modules"];
	module: GetGraphResponse["modules"][number];
	moduleById: Map<string, GetGraphResponse["modules"][number]>;
}): ModuleStats {
	const importEdges = edges.filter(
		(edge) => edge.from === module.id && edge.type === "imports",
	);
	const importedModules = importEdges
		.map((edge) => moduleById.get(edge.to))
		.filter((node): node is GetGraphResponse["modules"][number] =>
			Boolean(node),
		);

	return {
		imports: {
			available: importEdges.length + globalModules.length,
			global: globalModules.length,
			imported: importEdges.length,
			own: importEdges.length,
		},
		initializers: getFeatureStats({
			globalItems: globalModules.flatMap((node) => node.initializerExports),
			importedItems: importedModules.flatMap((node) => node.initializerExports),
			ownItems: module.initializers,
		}),
		interceptors: getFeatureStats({
			globalItems: globalModules.flatMap((node) => node.interceptorExports),
			importedItems: importedModules.flatMap((node) => node.interceptorExports),
			ownItems: module.interceptors,
		}),
		middlewares: {
			available:
				getFeatureStats({
					globalItems: globalModules.flatMap(
						(node) => node.queryPreHandlerExports,
					),
					importedItems: importedModules.flatMap(
						(node) => node.queryPreHandlerExports,
					),
					ownItems: module.queryPreHandlers,
				}).available +
				getFeatureStats({
					globalItems: globalModules.flatMap(
						(node) => node.commandPreHandlerExports,
					),
					importedItems: importedModules.flatMap(
						(node) => node.commandPreHandlerExports,
					),
					ownItems: module.commandPreHandlers,
				}).available,
			global:
				getUniqueCount(
					globalModules.flatMap((node) => node.queryPreHandlerExports),
				) +
				getUniqueCount(
					globalModules.flatMap((node) => node.commandPreHandlerExports),
				),
			imported:
				getUniqueCount(
					importedModules.flatMap((node) => node.queryPreHandlerExports),
				) +
				getUniqueCount(
					importedModules.flatMap((node) => node.commandPreHandlerExports),
				),
			own:
				getUniqueCount(module.queryPreHandlers) +
				getUniqueCount(module.commandPreHandlers),
		},
	};
}

function getFeatureStats({
	globalItems,
	importedItems,
	ownItems,
}: {
	globalItems: string[];
	importedItems: string[];
	ownItems: string[];
}): ModuleStatCount {
	return {
		available: getUniqueCount([...ownItems, ...importedItems, ...globalItems]),
		global: getUniqueCount(globalItems),
		imported: getUniqueCount(importedItems),
		own: getUniqueCount(ownItems),
	};
}

function getUniqueCount(items: string[]): number {
	return new Set(items).size;
}

function getProviderNodeHeight(module: ModuleNodeData): number {
	return providerNodeHeight(getProviderBlockRowCounts(module));
}

// Row counts per provider group block, in render order: own group first, then
// each imported group. Shared shape with graph-layout's handle placement.
function getProviderBlockRowCounts(module: ModuleNodeData): number[] {
	return [
		module.providers.length + module.ownMembers.length,
		...module.importedProviderGroups
			.filter((group) => group.providers.length > 0 || group.members.length > 0)
			.map((group) => group.providers.length + group.members.length),
	];
}

function getNodeClassName(
	module: ModuleNodeData,
	selectedId: string | null | undefined,
	edges: GetGraphResponse["edges"],
) {
	const directDependencyIds = getDirectDependencyIds(edges, selectedId);
	const directDependentIds = getDirectDependentIds(edges, selectedId);

	return clsx({
		"dynamic-graph-node": module.familyInstanceCount > 1 || module.dynamic,
		"global-graph-node": module.kind === "global",
		"selected-graph-node": selectedId && module.id === selectedId,
		"dependency-graph-node":
			selectedId &&
			module.id !== selectedId &&
			directDependencyIds.has(module.id),
		"dependent-graph-node":
			selectedId &&
			module.id !== selectedId &&
			!directDependencyIds.has(module.id) &&
			directDependentIds.has(module.id),
		"dimmed-graph-node":
			selectedId &&
			module.id !== selectedId &&
			!directDependencyIds.has(module.id) &&
			!directDependentIds.has(module.id),
	});
}

function getDirectDependencyIds(
	edges: GetGraphResponse["edges"],
	selectedModuleId: string | null | undefined,
): Set<string> {
	return new Set(
		edges
			.filter((edge) => edge.from === selectedModuleId)
			.map((edge) => edge.to),
	);
}

function getDirectDependentIds(
	edges: GetGraphResponse["edges"],
	selectedModuleId: string | null | undefined,
): Set<string> {
	return new Set(
		edges
			.filter((edge) => edge.to === selectedModuleId)
			.map((edge) => edge.from),
	);
}
