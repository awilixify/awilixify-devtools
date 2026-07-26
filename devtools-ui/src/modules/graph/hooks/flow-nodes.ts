import clsx from "clsx";
import type { GetGraphResponse } from "@/api/model";
import type {
	GraphData,
	GraphViewMode,
	ModuleFlowNode,
	ModuleNodeData,
	ModuleStatCount,
	ModuleStats,
	OperationConnection,
	ProviderFocusState,
} from "../types";
import type { ModuleSelectionRelations } from "./module-selection-relations";
import { getOperationConnectionId } from "./module-selection-relations";
import {
	getOperationConnectionBorderStyle,
	getOperationConnectionColor,
} from "./operation-flow-edges";
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
	operationConnections,
	selectedModuleId,
	selectionRelations,
	viewMode,
}: {
	graph: GraphData;
	providerFocus: ProviderFocusState | null;
	operationConnections: OperationConnection[];
	selectedModuleId?: string | null;
	selectionRelations: ModuleSelectionRelations;
	viewMode: GraphViewMode;
}): ModuleFlowNode[] {
	const { modules, edges, globalProviderGroups } = graph;

	const moduleById = new Map(modules.map((module) => [module.id, module]));
	const globalModules = modules.filter((module) => module.kind === "global");
	const globalModulesByService = new Map<string, typeof globalModules>();
	const globalProviderGroupsByService = new Map<
		string,
		typeof globalProviderGroups
	>();

	for (const globalModule of globalModules) {
		const serviceModules =
			globalModulesByService.get(globalModule.serviceName) ?? [];
		serviceModules.push(globalModule);
		globalModulesByService.set(globalModule.serviceName, serviceModules);
	}

	for (const providerGroup of globalProviderGroups) {
		const serviceName = moduleById.get(providerGroup.moduleId)?.serviceName;
		if (!serviceName) {
			continue;
		}

		const serviceProviderGroups =
			globalProviderGroupsByService.get(serviceName) ?? [];
		serviceProviderGroups.push(providerGroup);
		globalProviderGroupsByService.set(serviceName, serviceProviderGroups);
	}
	const providerDependencyIds = selectionRelations.dependencyIds;
	const providerGroupColorByModuleId = getProviderGroupColorByModuleId(
		edges,
		selectedModuleId,
	);
	const lifetimeTypeByName = getLifetimeTypeByName(modules);
	const availableDecoratorsByClassName = graph.availableDecorators;
	const entrypointRelationByModuleId = getEntrypointRelations(
		operationConnections,
		selectionRelations,
	);
	return modules.map((module) => {
		const serviceGlobalModules =
			globalModulesByService.get(module.serviceName) ?? [];
		const serviceGlobalProviderGroups =
			globalProviderGroupsByService.get(module.serviceName) ?? [];
		const usedDecoratorsByKey = getUsedDecoratorsByKey(module);
		const globalProviderGroupsDetailed = getGlobalProviderGroups(
			serviceGlobalProviderGroups,
			serviceGlobalModules,
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
		const nodeData: ModuleNodeData = {
			...module,
			globalProviderGroups: serviceGlobalProviderGroups,
			globalProviderGroupsDetailed,
			importedProviderGroups,
			moduleStats: getModuleStats({
				edges,
				globalModules: serviceGlobalModules,
				module,
				moduleById,
			}),
			ownMembers: getOwnMembers(module, (key, className) => ({
				used: usedDecoratorsByKey[key] ?? [],
				available: availableDecoratorsByClassName[className] ?? [],
			})),
			entrypointRelationByOperationKey:
				entrypointRelationByModuleId.get(module.id) ?? {},
			isSelectedModule: module.id === selectedModuleId,
			lifetimeTypeByName,
			providerFocus,
			providerRelationColor:
				viewMode === "providers" &&
				selectedModuleId &&
				providerDependencyIds.has(module.id)
					? providerGroupColorByModuleId[module.id]
					: undefined,
			viewMode,
		};

		const isGlobal = module.kind === "global";

		return {
			id: module.id,
			type: "module",
			data: nodeData,
			className: getNodeClassName(
				nodeData,
				selectedModuleId,
				selectionRelations,
			),
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

function getEntrypointRelations(
	operationConnections: OperationConnection[],
	selectionRelations: ModuleSelectionRelations,
): Map<string, ModuleNodeData["entrypointRelationByOperationKey"]> {
	const relationsByModuleId = new Map<
		string,
		ModuleNodeData["entrypointRelationByOperationKey"]
	>();

	for (const connection of operationConnections) {
		const connectionId = getOperationConnectionId(connection);
		const active =
			selectionRelations.asyncOperationEdgeIds.has(connectionId) ||
			selectionRelations.dependencyOperationEdgeIds.has(connectionId) ||
			selectionRelations.dependentOperationEdgeIds.has(connectionId);
		if (!active) continue;

		const moduleRelations = relationsByModuleId.get(connection.to) ?? {};
		moduleRelations[connection.operationKey] = {
			borderStyle: getOperationConnectionBorderStyle(connection),
			color: getOperationConnectionColor(connection),
		};
		relationsByModuleId.set(connection.to, moduleRelations);
	}

	return relationsByModuleId;
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
	relations: ModuleSelectionRelations,
) {
	return clsx({
		"dynamic-graph-node": module.familyInstanceCount > 1 || module.dynamic,
		"global-graph-node": module.kind === "global",
		"selected-graph-node": selectedId && module.id === selectedId,
		"dependency-graph-node":
			selectedId &&
			module.id !== selectedId &&
			relations.dependencyIds.has(module.id),
		"dependent-graph-node":
			selectedId &&
			module.id !== selectedId &&
			!relations.dependencyIds.has(module.id) &&
			relations.dependentIds.has(module.id),
		"async-graph-node":
			selectedId &&
			module.id !== selectedId &&
			!relations.dependencyIds.has(module.id) &&
			!relations.dependentIds.has(module.id) &&
			relations.asyncIds.has(module.id),
		"dimmed-graph-node":
			selectedId &&
			module.id !== selectedId &&
			!relations.dependencyIds.has(module.id) &&
			!relations.dependentIds.has(module.id) &&
			!relations.asyncIds.has(module.id),
	});
}
