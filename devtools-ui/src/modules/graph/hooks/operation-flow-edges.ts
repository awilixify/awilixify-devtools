import { MarkerType } from "@xyflow/react";
import {
	CALLED_OPERATION_HANDLE_ID,
	OWN_OPERATION_HANDLE_ID,
} from "../operation-handles";
import type {
	GraphModule,
	ModuleFlowEdge,
	OperationConnection,
} from "../types";
import {
	getOperationConnectionId,
	type ModuleSelectionRelations,
} from "./module-selection-relations";

export function getOperationConnections(
	modules: GraphModule[],
): OperationConnection[] {
	const ownerByHttpOperation = new Map<string, string>();
	const subscribersByMessage = new Map<string, Set<string>>();
	const publishersByMessage = new Map<string, Set<string>>();

	for (const module of modules) {
		for (const operationId of module.ownOperationIds) {
			ownerByHttpOperation.set(
				getOperationKey(module.serviceName, operationId),
				module.id,
			);
		}
		for (const messageType of module.publishedMessageTypes) {
			const key = getOperationKey(module.serviceName, messageType);
			const publishers = publishersByMessage.get(key) ?? new Set<string>();
			publishers.add(module.id);
			publishersByMessage.set(key, publishers);
		}
		for (const message of module.subscribedMessages) {
			const key = getOperationKey(message.serviceName, message.type);
			const subscribers = subscribersByMessage.get(key) ?? new Set<string>();
			subscribers.add(module.id);
			subscribersByMessage.set(key, subscribers);
		}
	}

	const connections = new Map<string, OperationConnection>();

	for (const module of modules) {
		for (const calledOperation of module.calledOperations) {
			const operationKey =
				calledOperation.transport === "http"
					? calledOperation.operationId
					: calledOperation.type;
			const targetIds =
				calledOperation.transport === "http"
					? [
							ownerByHttpOperation.get(
								getOperationKey(calledOperation.serviceName, operationKey),
							),
						].filter((targetId): targetId is string => Boolean(targetId))
					: [
							...(subscribersByMessage.get(
								getOperationKey(calledOperation.serviceName, operationKey),
							) ?? []),
						];

			for (const targetId of targetIds) {
				if (targetId === module.id) continue;

				const connection = {
					from: module.id,
					to: targetId,
					operationKey,
					relation: "call" as const,
					transport: calledOperation.transport,
				};
				connections.set(getOperationConnectionId(connection), connection);
			}
		}

		for (const subscribedMessage of module.subscribedMessages) {
			const publishers = publishersByMessage.get(
				getOperationKey(subscribedMessage.serviceName, subscribedMessage.type),
			);
			for (const publisher of publishers ?? []) {
				if (publisher === module.id) continue;

				const connection = {
					from: publisher,
					to: module.id,
					operationKey: subscribedMessage.type,
					relation: "publication" as const,
					transport: "messaging" as const,
				};
				connections.set(getOperationConnectionId(connection), connection);
			}
		}
	}

	return [...connections.values()];
}

export function toOperationFlowEdges(
	modules: GraphModule[],
	selectionRelations: ModuleSelectionRelations,
): ModuleFlowEdge[] {
	return getOperationConnections(modules).map((connection) => {
		const connectionId = getOperationConnectionId(connection);
		const relation = selectionRelations.asyncOperationEdgeIds.has(connectionId)
			? "async"
			: selectionRelations.dependencyOperationEdgeIds.has(connectionId)
				? "dependency"
				: selectionRelations.dependentOperationEdgeIds.has(connectionId)
					? "dependent"
					: null;
		const color = relation
			? getOperationConnectionColor(connection)
			: "var(--graph-color-muted)";
		const activeConnectionClass = relation
			? getActiveOperationClass(connection)
			: null;

		return {
			id: `operation:${getOperationConnectionId(connection)}`,
			source: connection.from,
			sourceHandle: CALLED_OPERATION_HANDLE_ID,
			target: connection.to,
			targetHandle: OWN_OPERATION_HANDLE_ID,
			type: "moduleDependency",
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color,
				width: 10,
				height: 10,
			},
			data: {
				color,
				kind: "operation",
				operationKey: connection.operationKey,
				relation: connection.relation,
				transport: connection.transport,
			},
			className: `graph-edge operation ${connection.transport} ${connection.relation}${relation ? ` ${relation}` : ""}${activeConnectionClass ? ` ${activeConnectionClass}` : ""}`,
		};
	});
}

function getActiveOperationClass(connection: OperationConnection): string {
	if (connection.relation === "publication") return "async";

	return connection.transport === "http" ? "http-call" : "message-call";
}

export function getOperationConnectionColor(
	connection: OperationConnection,
): string {
	if (connection.relation === "publication") {
		return "var(--graph-color-async)";
	}

	return connection.transport === "http"
		? "var(--graph-color-http-call)"
		: "var(--graph-color-message-call)";
}

export function getOperationConnectionBorderStyle(
	connection: OperationConnection,
): "dashed" | "dotted" | "solid" {
	if (connection.relation === "publication") return "dashed";

	return connection.transport === "http" ? "solid" : "dotted";
}

function getOperationKey(serviceName: string, operationId: string): string {
	return `${serviceName}:${operationId}`;
}
