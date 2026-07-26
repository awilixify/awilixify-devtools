import type { ModuleGraphEdge } from "@/api/model";
import type { OperationConnection } from "../types";

export type ModuleSelectionRelations = {
	asyncIds: Set<string>;
	asyncOperationEdgeIds: Set<string>;
	dependencyIds: Set<string>;
	dependentIds: Set<string>;
	dependencyModuleEdgeIds: Set<string>;
	dependentModuleEdgeIds: Set<string>;
	dependencyOperationEdgeIds: Set<string>;
	dependentOperationEdgeIds: Set<string>;
};

export function getModuleSelectionRelations(
	moduleEdges: ModuleGraphEdge[],
	operationConnections: OperationConnection[],
	selectedModuleId?: string | null,
): ModuleSelectionRelations {
	const relations: ModuleSelectionRelations = {
		asyncIds: new Set(),
		asyncOperationEdgeIds: new Set(),
		dependencyIds: new Set(),
		dependentIds: new Set(),
		dependencyModuleEdgeIds: new Set(),
		dependentModuleEdgeIds: new Set(),
		dependencyOperationEdgeIds: new Set(),
		dependentOperationEdgeIds: new Set(),
	};

	if (!selectedModuleId) return relations;

	for (const edge of moduleEdges) {
		if (edge.from === selectedModuleId) {
			relations.dependencyIds.add(edge.to);
			relations.dependencyModuleEdgeIds.add(getModuleEdgeId(edge));
		}
		if (edge.to === selectedModuleId) {
			relations.dependentIds.add(edge.from);
			relations.dependentModuleEdgeIds.add(getModuleEdgeId(edge));
		}
	}

	for (const connection of operationConnections) {
		if (connection.relation === "publication") {
			if (connection.from === selectedModuleId) {
				relations.asyncIds.add(connection.to);
				relations.asyncOperationEdgeIds.add(
					getOperationConnectionId(connection),
				);
			}
			if (connection.to === selectedModuleId) {
				relations.asyncIds.add(connection.from);
				relations.asyncOperationEdgeIds.add(
					getOperationConnectionId(connection),
				);
			}
			continue;
		}

		if (connection.from === selectedModuleId) {
			relations.dependencyIds.add(connection.to);
			relations.dependencyOperationEdgeIds.add(
				getOperationConnectionId(connection),
			);
		}
		if (connection.to === selectedModuleId) {
			relations.dependentIds.add(connection.from);
			relations.dependentOperationEdgeIds.add(
				getOperationConnectionId(connection),
			);
		}
	}

	const importedGatewayIds = new Set(
		moduleEdges
			.filter(
				(edge) => edge.type === "imports" && edge.from === selectedModuleId,
			)
			.map((edge) => edge.to),
	);
	for (const connection of operationConnections) {
		if (connection.relation !== "call") continue;
		if (!importedGatewayIds.has(connection.from)) continue;

		relations.dependencyIds.add(connection.to);
		relations.dependencyOperationEdgeIds.add(
			getOperationConnectionId(connection),
		);
	}

	const callingGatewayIds = new Set(
		operationConnections
			.filter(
				(connection) =>
					connection.relation === "call" && connection.to === selectedModuleId,
			)
			.map((connection) => connection.from),
	);
	for (const edge of moduleEdges) {
		if (edge.type !== "imports" || !callingGatewayIds.has(edge.to)) continue;

		relations.dependentIds.add(edge.from);
		relations.dependentModuleEdgeIds.add(getModuleEdgeId(edge));
	}

	return relations;
}

export function getModuleEdgeId(
	edge: Pick<ModuleGraphEdge, "from" | "to" | "type">,
): string {
	return `${edge.from}:${edge.to}:${edge.type}`;
}

export function getOperationConnectionId(
	connection: OperationConnection,
): string {
	return `${connection.from}:${connection.to}:${connection.operationKey}:${connection.transport}:${connection.relation}`;
}
