import { MarkerType } from "@xyflow/react";
import clsx from "clsx";
import type { GetGraphResponse } from "@/api/model";
import {
	MODULE_SOURCE_HANDLE_ID,
	MODULE_TARGET_HANDLE_ID,
} from "../operation-handles";
import type { GraphViewMode, ModuleEdgeRole, ModuleFlowEdge } from "../types";
import {
	getModuleEdgeId,
	type ModuleSelectionRelations,
} from "./module-selection-relations";
import {
	getProviderGroupColorByModuleId,
	isFocusedDependencyEdge,
} from "./provider-group";

export function toFlowEdges({
	edges,
	selectionRelations,
	selectedModuleId,
	viewMode,
}: {
	edges: GetGraphResponse["edges"];
	selectionRelations: ModuleSelectionRelations;
	selectedModuleId?: string | null;
	viewMode: GraphViewMode;
}): ModuleFlowEdge[] {
	const cycleEdgeIds = detectCycleEdgeIds(
		edges.filter((edge) => edge.type === "imports"),
	);
	const providerGroupColorByModuleId = getProviderGroupColorByModuleId(
		edges,
		selectedModuleId,
	);

	return edges.map((edge) => {
		const role = getEdgeRole({
			edge,
			selectionRelations,
			cycleEdgeIds,
		});
		// Same full color as the highlighted entry chips of the group this edge
		// points at, so the arrow and those chips read as the exact same color.
		const color =
			viewMode === "providers" &&
			isFocusedDependencyEdge(edge, selectedModuleId)
				? providerGroupColorByModuleId[edge.to]
				: undefined;

		return {
			id: `${edge.from}:${edge.to}:${edge.type}`,
			source: edge.from,
			sourceHandle:
				viewMode === "providers"
					? getProviderGroupHandleId(edge.to)
					: MODULE_SOURCE_HANDLE_ID,
			target: edge.to,
			targetHandle:
				viewMode === "providers"
					? getOwnProviderGroupHandleId()
					: MODULE_TARGET_HANDLE_ID,
			type: "moduleDependency",
			animated: role === "cycle" || edge.type === "global",
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color: color ?? getEdgeColor(role),
				width: 10,
				height: 10,
			},
			data: {
				color,
				kind: "module",
				type: edge.type,
				role,
			},
			className: clsx("graph-edge", edge.type, role, {
				"provider-colored": color,
			}),
		};
	});
}

export function detectCycleEdgeIds(
	edges: GetGraphResponse["edges"],
): Set<string> {
	const adjacency = new Map<string, string[]>();
	const cycleEdgeIds = new Set<string>();

	for (const edge of edges) {
		adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
	}

	for (const edge of edges) {
		if (hasPath(edge.to, edge.from, adjacency, new Set())) {
			cycleEdgeIds.add(`${edge.from}:${edge.to}:${edge.type}`);
		}
	}

	return cycleEdgeIds;
}

export function getProviderGroupHandleId(moduleId: string): string {
	return `provider-group:${moduleId}`;
}

export function getOwnProviderGroupHandleId(): string {
	return "provider-group:own";
}

function getEdgeColor(role: ModuleEdgeRole): string {
	switch (role) {
		case "dependency":
			return "var(--graph-color-dependency)";
		case "dependent":
			return "var(--graph-color-dependent)";
		case "cycle":
			return "var(--graph-color-cycle)";
		case "global":
			return "var(--graph-color-global)";
		default:
			return "var(--graph-color-muted)";
	}
}

function getEdgeRole({
	edge,
	selectionRelations,
	cycleEdgeIds,
}: {
	edge: GetGraphResponse["edges"][number];
	selectionRelations: ModuleSelectionRelations;
	cycleEdgeIds: Set<string>;
}): ModuleEdgeRole {
	const edgeId = `${edge.from}:${edge.to}:${edge.type}`;

	if (cycleEdgeIds.has(edgeId)) return "cycle";
	if (edge.type === "global") return "global";
	if (selectionRelations.dependencyModuleEdgeIds.has(getModuleEdgeId(edge))) {
		return "dependency";
	}
	if (selectionRelations.dependentModuleEdgeIds.has(getModuleEdgeId(edge))) {
		return "dependent";
	}

	return "default";
}

function hasPath(
	from: string,
	to: string,
	adjacency: Map<string, string[]>,
	visited: Set<string>,
): boolean {
	if (from === to) return true;
	if (visited.has(from)) return false;

	visited.add(from);

	return (adjacency.get(from) ?? []).some((next) =>
		hasPath(next, to, adjacency, visited),
	);
}
