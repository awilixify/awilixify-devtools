import type { Edge, Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { providerBlockCenterY } from "./provider-node-metrics";

export type LayoutOptions = {
	pinGlobalModulesToTop?: boolean;
};

type RoutedEdgeData = {
	path?: string;
};

type ElkRoutedEdge = {
	id: string;
	sections?: Array<{
		startPoint?: { x?: number; y?: number };
		endPoint?: { x?: number; y?: number };
		bendPoints?: Array<{ x?: number; y?: number }>;
	}>;
};

type ElkPort = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	layoutOptions: Record<string, string>;
};

const elk = new ELK();

export async function layout<TNode extends Node, TEdge extends Edge>(
	nodes: TNode[],
	edges: TEdge[],
	options: LayoutOptions = {},
): Promise<{ nodes: TNode[]; edges: TEdge[] }> {
	const graph = await elk.layout({
		id: "module-graph",
		layoutOptions: {
			"elk.algorithm": "layered",
			"elk.direction": "RIGHT",
			"elk.edgeRouting": "ORTHOGONAL",
			"elk.layered.spacing.nodeNodeBetweenLayers": "90",
			"elk.spacing.nodeNode": "36",
			"elk.spacing.edgeNode": "48",
			"elk.spacing.edgeEdge": "48",
			"elk.layered.spacing.edgeNodeBetweenLayers": "48",
			"elk.layered.spacing.edgeEdgeBetweenLayers": "48",
			"elk.layered.crossingMinimization.semiInteractive": "true",
		},
		children: nodes.map((node) => {
			const width = getNodeSize(node, "width", 260);
			const height = getNodeSize(node, "height", 150);
			const ports = getNodePorts(node, edges, width);

			return {
				id: node.id,
				width,
				height,
				...(ports.length > 0
					? {
							layoutOptions: {
								"elk.portConstraints": "FIXED_POS",
							},
							ports,
						}
					: {}),
			};
		}),
		edges: edges.map((edge) => ({
			id: edge.id,
			sources: [getElkEndpoint(edge.source, edge.sourceHandle)],
			targets: [getElkEndpoint(edge.target, edge.targetHandle)],
		})),
	});

	const positionById = new Map(
		graph.children?.map((node) => [
			node.id,
			{ x: node.x ?? 0, y: node.y ?? 0 },
		]),
	);
	const routedEdges = (graph.edges ?? []) as ElkRoutedEdge[];
	const routedPathByEdgeId = new Map(
		routedEdges.flatMap((edge) => {
			const path = createEdgePath(edge);
			return path ? [[edge.id, path] as const] : [];
		}),
	);

	const layoutedNodes = nodes.map((node) => ({
		...node,
		position: positionById.get(node.id) ?? node.position,
	}));
	const pinned = options.pinGlobalModulesToTop
		? pinGlobalModulesToTop(layoutedNodes)
		: { nodes: layoutedNodes, offsetY: 0, globalIds: new Set<string>() };

	return {
		nodes: pinned.nodes,
		edges: edges.map((edge) =>
			addRoutedPath(edge, routedPathByEdgeId.get(edge.id), pinned),
		),
	};
}

function pinGlobalModulesToTop<TNode extends Node>(
	nodes: TNode[],
): {
	nodes: TNode[];
	offsetY: number;
	globalIds: Set<string>;
} {
	const globalNodes = nodes.filter((node) => isGlobalModuleNode(node));

	if (globalNodes.length === 0) {
		return { nodes, offsetY: 0, globalIds: new Set() };
	}

	const topY = 0;
	const gap = 32;
	const sortedGlobalNodes = [...globalNodes].sort((a, b) =>
		String(a.data?.name ?? a.id).localeCompare(String(b.data?.name ?? b.id)),
	);
	const globalIds = new Set(sortedGlobalNodes.map((node) => node.id));

	// Center the global row horizontally over the rest of the graph, rather than
	// left-aligning it with the leftmost node.
	const totalGlobalWidth =
		sortedGlobalNodes.reduce(
			(sum, node) => sum + getNodeSize(node, "width", 260),
			0,
		) +
		gap * Math.max(0, sortedGlobalNodes.length - 1);
	const nonGlobalNodes = nodes.filter((node) => !globalIds.has(node.id));
	const contentCenterX =
		nonGlobalNodes.length > 0
			? (Math.min(...nonGlobalNodes.map((node) => node.position.x)) +
					Math.max(
						...nonGlobalNodes.map(
							(node) => node.position.x + getNodeSize(node, "width", 260),
						),
					)) /
				2
			: Math.min(...nodes.map((node) => node.position.x)) +
				totalGlobalWidth / 2;
	let cursorX = contentCenterX - totalGlobalWidth / 2;

	const globalPositions = new Map<string, { x: number; y: number }>();

	for (const node of sortedGlobalNodes) {
		globalPositions.set(node.id, { x: cursorX, y: topY });
		cursorX += getNodeSize(node, "width", 260) + gap;
	}

	const globalHeight = Math.max(
		...sortedGlobalNodes.map((node) => getNodeSize(node, "height", 150)),
	);
	const nonGlobalMinY = Math.min(
		...nodes
			.filter((node) => !globalIds.has(node.id))
			.map((node) => node.position.y),
		topY + globalHeight + 80,
	);
	const offsetY = Math.max(0, topY + globalHeight + 80 - nonGlobalMinY);

	return {
		nodes: nodes.map((node) => {
			const globalPosition = globalPositions.get(node.id);

			if (globalPosition) {
				return {
					...node,
					position: globalPosition,
				};
			}

			return {
				...node,
				position: {
					x: node.position.x,
					y: node.position.y + offsetY,
				},
			};
		}),
		offsetY,
		globalIds,
	};
}

function isGlobalModuleNode(node: Node): boolean {
	return (
		typeof node.data === "object" &&
		node.data !== null &&
		"kind" in node.data &&
		node.data.kind === "global"
	);
}

function getNodeSize(
	node: Node,
	key: "width" | "height",
	fallback: number,
): number {
	const measured = node.measured as
		| {
				width?: number;
				height?: number;
		  }
		| undefined;

	return measured?.[key] ?? node[key] ?? fallback;
}

function getNodePorts(node: Node, edges: Edge[], nodeWidth: number): ElkPort[] {
	const handleIds = new Set<string>();

	for (const edge of edges) {
		if (edge.source === node.id && edge.sourceHandle) {
			handleIds.add(edge.sourceHandle);
		}

		if (edge.target === node.id && edge.targetHandle) {
			handleIds.add(edge.targetHandle);
		}
	}

	return [...handleIds].map((handleId) => {
		const side = handleId === "provider-group:own" ? "WEST" : "EAST";

		return {
			id: getElkEndpoint(node.id, handleId),
			x: side === "WEST" ? 0 : nodeWidth,
			y: getProviderHandleY(node, handleId),
			width: 1,
			height: 1,
			layoutOptions: {
				"elk.port.side": side,
			},
		};
	});
}

function getElkEndpoint(nodeId: string, handleId?: string | null): string {
	return handleId ? `${nodeId}::${handleId}` : nodeId;
}

function getProviderHandleY(node: Node, handleId: string): number {
	const data = node.data as
		| {
				importedProviderGroups?: Array<{
					moduleId: string;
					providers: string[];
					members?: unknown[];
				}>;
				providers?: string[];
				ownMembers?: unknown[];
		  }
		| undefined;
	// Blocks in render order: own group first, then each imported group. Row
	// counts must match flow-nodes' getProviderBlockRowCounts.
	const blocks = [
		{
			handleId: "provider-group:own",
			rowCount:
				(data?.providers?.length ?? 0) + (data?.ownMembers?.length ?? 0),
		},
		...(data?.importedProviderGroups ?? [])
			.filter(
				(group) =>
					group.providers.length > 0 || (group.members?.length ?? 0) > 0,
			)
			.map((group) => ({
				handleId: `provider-group:${group.moduleId}`,
				rowCount: group.providers.length + (group.members?.length ?? 0),
			})),
	];
	const rowCounts = blocks.map((block) => block.rowCount);
	const index = blocks.findIndex((block) => block.handleId === handleId);

	return providerBlockCenterY(rowCounts, index === -1 ? 0 : index);
}

function createEdgePath(edge: ElkRoutedEdge): string | null {
	const section = edge.sections?.[0];

	if (!section?.startPoint || !section.endPoint) return null;

	const points = [
		section.startPoint,
		...(section.bendPoints ?? []),
		section.endPoint,
	].filter(
		(point): point is { x: number; y: number } =>
			typeof point.x === "number" && typeof point.y === "number",
	);

	if (points.length < 2) return null;

	const [first, ...rest] = points;

	return `M ${first.x} ${first.y} ${rest
		.map((point) => `L ${point.x} ${point.y}`)
		.join(" ")}`;
}

function addRoutedPath<TEdge extends Edge>(
	edge: TEdge,
	path: string | undefined,
	pinned: {
		offsetY: number;
		globalIds: Set<string>;
	},
): TEdge {
	if (!path) return edge;

	const shouldShiftPath =
		pinned.offsetY > 0 &&
		!pinned.globalIds.has(edge.source) &&
		!pinned.globalIds.has(edge.target);

	return {
		...edge,
		data: {
			...edge.data,
			path: shouldShiftPath ? shiftPathY(path, pinned.offsetY) : path,
		} as TEdge["data"] & RoutedEdgeData,
	};
}

function shiftPathY(path: string, offsetY: number): string {
	return path.replace(
		/([ML]) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
		(_, command: string, x: string, y: string) =>
			`${command} ${x} ${Number(y) + offsetY}`,
	);
}
