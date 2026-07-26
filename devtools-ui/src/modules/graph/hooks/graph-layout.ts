import type { Edge, Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
	CALLED_OPERATION_HANDLE_ID,
	MODULE_TARGET_HANDLE_ID,
	OWN_OPERATION_HANDLE_ID,
} from "../operation-handles";
import { providerBlockCenterY } from "./provider-node-metrics";

export type LayoutOptions = {
	nodeSpacing?: number;
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
const SERVICE_LAYOUT_GAP = 320;

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
			"elk.spacing.nodeNode": String(options.nodeSpacing ?? 36),
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

export async function layoutByService<TNode extends Node, TEdge extends Edge>(
	nodes: TNode[],
	edges: TEdge[],
	options: LayoutOptions = {},
): Promise<{ nodes: TNode[]; edges: TEdge[] }> {
	const nodesByService = new Map<string, TNode[]>();

	for (const node of nodes) {
		const serviceId = getServiceId(node);
		nodesByService.set(serviceId, [
			...(nodesByService.get(serviceId) ?? []),
			node,
		]);
	}

	const layoutedNodes: TNode[] = [];
	const layoutedEdges: TEdge[] = [];
	const handledEdgeIds = new Set<string>();
	let cursorX = 0;

	for (const serviceNodes of nodesByService.values()) {
		const nodeIds = new Set(serviceNodes.map((node) => node.id));
		const serviceEdges = edges.filter(
			(edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
		);
		const serviceLayout = await layout(serviceNodes, serviceEdges, options);
		const bounds = getLayoutBounds(serviceLayout.nodes);
		const offsetX = cursorX - bounds.minX;
		const offsetY = -bounds.minY;

		layoutedNodes.push(
			...serviceLayout.nodes.map((node) => ({
				...node,
				position: {
					x: node.position.x + offsetX,
					y: node.position.y + offsetY,
				},
			})),
		);
		layoutedEdges.push(
			...serviceLayout.edges.map((edge) =>
				shiftRoutedEdge(edge, offsetX, offsetY),
			),
		);
		for (const edge of serviceEdges) handledEdgeIds.add(edge.id);

		cursorX += bounds.width + SERVICE_LAYOUT_GAP;
	}

	return {
		nodes: layoutedNodes,
		edges: [
			...layoutedEdges,
			...routeCrossServiceEdges(
				layoutedNodes,
				edges.filter((edge) => !handledEdgeIds.has(edge.id)),
			),
		],
	};
}

type Point = { x: number; y: number };
type Rect = { left: number; right: number; top: number; bottom: number };
type Direction = "horizontal" | "vertical" | "start";

const EDGE_OBSTACLE_PADDING = 18;
const PROVIDER_OPERATION_LEAD = 48;
const EDGE_BEND_COST = 36;

export function routeMeasuredOperationEdges<
	TNode extends Node,
	TEdge extends Edge,
>(nodes: TNode[], edges: TEdge[]): TEdge[] {
	return routeEdges(
		nodes,
		edges,
		(edge) =>
			(edge.data as { kind?: string } | undefined)?.kind === "operation",
	);
}

function routeCrossServiceEdges<TEdge extends Edge>(
	nodes: Node[],
	edges: TEdge[],
): TEdge[] {
	return routeEdges(nodes, edges, () => true);
}

function routeEdges<TEdge extends Edge>(
	nodes: Node[],
	edges: TEdge[],
	shouldRoute: (edge: TEdge) => boolean,
): TEdge[] {
	const nodeById = new Map(nodes.map((node) => [node.id, node]));

	return edges.map((edge) => {
		if (!shouldRoute(edge)) return edge;

		const source = nodeById.get(edge.source);
		const target = nodeById.get(edge.target);
		if (!source || !target) return edge;

		const sourceCenterX =
			source.position.x + getNodeSize(source, "width", 260) / 2;
		const targetCenterX =
			target.position.x + getNodeSize(target, "width", 260) / 2;
		const goesRight = sourceCenterX <= targetCenterX;
		const start = getEdgeEndpoint(source, edge.sourceHandle, true, goesRight);
		const end = getEdgeEndpoint(target, edge.targetHandle, false, goesRight);
		const startEscape = getEndpointEscape(
			start,
			source,
			edge.sourceHandle,
			true,
			goesRight,
		);
		const endEscape = getEndpointEscape(
			end,
			target,
			edge.targetHandle,
			false,
			goesRight,
		);
		const obstacles = nodes.map((node) =>
			toObstacleRect(node, EDGE_OBSTACLE_PADDING),
		);
		const routedPath = findOrthogonalPath(startEscape, endEscape, obstacles);
		if (!routedPath) return edge;
		const path = removeCollinearPoints([start, ...routedPath, end]);

		return {
			...edge,
			data: {
				...edge.data,
				path: toSvgPath(path),
			} as TEdge["data"] & RoutedEdgeData,
		};
	});
}

function getEdgeEndpoint(
	node: Node,
	handleId: string | null | undefined,
	isSource: boolean,
	goesRight: boolean,
): Point {
	const width = getNodeSize(node, "width", 260);
	const height = getNodeSize(node, "height", 150);
	if (handleId === OWN_OPERATION_HANDLE_ID) {
		return {
			x: node.position.x + width / 2,
			y: node.position.y,
		};
	}
	if (handleId === CALLED_OPERATION_HANDLE_ID) {
		return {
			x: node.position.x + width / 2,
			y: node.position.y + height,
		};
	}

	const useRightSide = isSource ? goesRight : !goesRight;
	const handleY = handleId?.startsWith("provider-group:")
		? getProviderHandleY(node, handleId)
		: height / 2;

	return {
		x: node.position.x + (useRightSide ? width : 0),
		y: node.position.y + handleY,
	};
}

function getEndpointEscape(
	point: Point,
	node: Node,
	handleId: string | null | undefined,
	isSource: boolean,
	goesRight: boolean,
): Point {
	const operationLead = isProviderModeNode(node)
		? PROVIDER_OPERATION_LEAD
		: EDGE_OBSTACLE_PADDING;

	if (handleId === OWN_OPERATION_HANDLE_ID) {
		return { x: point.x, y: point.y - operationLead };
	}
	if (handleId === CALLED_OPERATION_HANDLE_ID) {
		return { x: point.x, y: point.y + operationLead };
	}

	const exitsRight = isSource ? goesRight : !goesRight;
	return {
		x: point.x + (exitsRight ? EDGE_OBSTACLE_PADDING : -EDGE_OBSTACLE_PADDING),
		y: point.y,
	};
}

function isProviderModeNode(node: Node): boolean {
	return (
		typeof node.data === "object" &&
		node.data !== null &&
		"viewMode" in node.data &&
		node.data.viewMode === "providers"
	);
}

function toObstacleRect(node: Node, padding: number): Rect {
	return {
		left: node.position.x - padding,
		right: node.position.x + getNodeSize(node, "width", 260) + padding,
		top: node.position.y - padding,
		bottom: node.position.y + getNodeSize(node, "height", 150) + padding,
	};
}

function findOrthogonalPath(
	start: Point,
	end: Point,
	obstacles: Rect[],
): Point[] | null {
	const xs = uniqueSorted([
		start.x,
		end.x,
		...obstacles.flatMap((rect) => [rect.left, rect.right]),
	]);
	const ys = uniqueSorted([
		start.y,
		end.y,
		...obstacles.flatMap((rect) => [rect.top, rect.bottom]),
	]);
	const points: Point[] = [];
	const pointIndex = new Map<string, number>();

	for (const x of xs) {
		for (const y of ys) {
			const point = { x, y };
			if (isPointInsideObstacle(point, obstacles)) continue;
			pointIndex.set(getPointKey(point), points.length);
			points.push(point);
		}
	}

	const startIndex = pointIndex.get(getPointKey(start));
	const endIndex = pointIndex.get(getPointKey(end));
	if (startIndex === undefined || endIndex === undefined) return null;

	const neighbours = points.map(() => [] as number[]);
	connectGridNeighbours(points, neighbours, obstacles, "horizontal");
	connectGridNeighbours(points, neighbours, obstacles, "vertical");

	type QueueItem = {
		pointIndex: number;
		direction: Direction;
		cost: number;
	};
	const startKey = getRouteStateKey(startIndex, "start");
	const distances = new Map([[startKey, 0]]);
	const previous = new Map<string, string>();
	const queue: QueueItem[] = [
		{ pointIndex: startIndex, direction: "start", cost: 0 },
	];
	let finalKey: string | null = null;

	while (queue.length > 0) {
		queue.sort((a, b) => a.cost - b.cost);
		const current = queue.shift();
		if (!current) break;

		const currentKey = getRouteStateKey(current.pointIndex, current.direction);
		if (current.cost !== distances.get(currentKey)) continue;
		if (current.pointIndex === endIndex) {
			finalKey = currentKey;
			break;
		}

		for (const nextIndex of neighbours[current.pointIndex]) {
			const direction = getSegmentDirection(
				points[current.pointIndex],
				points[nextIndex],
			);
			const bendCost =
				current.direction !== "start" && current.direction !== direction
					? EDGE_BEND_COST
					: 0;
			const nextCost =
				current.cost +
				getManhattanDistance(points[current.pointIndex], points[nextIndex]) +
				bendCost;
			const nextKey = getRouteStateKey(nextIndex, direction);
			if (nextCost >= (distances.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
				continue;
			}

			distances.set(nextKey, nextCost);
			previous.set(nextKey, currentKey);
			queue.push({ pointIndex: nextIndex, direction, cost: nextCost });
		}
	}

	if (!finalKey) return null;

	const path: Point[] = [];
	let stateKey: string | undefined = finalKey;
	while (stateKey) {
		const pointId = Number(stateKey.split(":")[0]);
		path.push(points[pointId]);
		stateKey = previous.get(stateKey);
	}

	return removeCollinearPoints(path.reverse());
}

function connectGridNeighbours(
	points: Point[],
	neighbours: number[][],
	obstacles: Rect[],
	direction: Exclude<Direction, "start">,
): void {
	const groups = new Map<number, number[]>();

	for (let index = 0; index < points.length; index += 1) {
		const point = points[index];
		const key = direction === "horizontal" ? point.y : point.x;
		groups.set(key, [...(groups.get(key) ?? []), index]);
	}

	for (const indices of groups.values()) {
		indices.sort((a, b) =>
			direction === "horizontal"
				? points[a].x - points[b].x
				: points[a].y - points[b].y,
		);

		for (let index = 1; index < indices.length; index += 1) {
			const from = indices[index - 1];
			const to = indices[index];
			if (segmentCrossesObstacle(points[from], points[to], obstacles)) {
				continue;
			}
			neighbours[from].push(to);
			neighbours[to].push(from);
		}
	}
}

function isPointInsideObstacle(point: Point, obstacles: Rect[]): boolean {
	return obstacles.some(
		(rect) =>
			point.x > rect.left &&
			point.x < rect.right &&
			point.y > rect.top &&
			point.y < rect.bottom,
	);
}

function segmentCrossesObstacle(
	from: Point,
	to: Point,
	obstacles: Rect[],
): boolean {
	return obstacles.some((rect) => {
		if (from.y === to.y) {
			return (
				from.y > rect.top &&
				from.y < rect.bottom &&
				Math.max(from.x, to.x) > rect.left &&
				Math.min(from.x, to.x) < rect.right
			);
		}

		return (
			from.x > rect.left &&
			from.x < rect.right &&
			Math.max(from.y, to.y) > rect.top &&
			Math.min(from.y, to.y) < rect.bottom
		);
	});
}

function uniqueSorted(values: number[]): number[] {
	return [...new Set(values)].sort((a, b) => a - b);
}

function getPointKey(point: Point): string {
	return `${point.x},${point.y}`;
}

function getRouteStateKey(pointIndex: number, direction: Direction): string {
	return `${pointIndex}:${direction}`;
}

function getSegmentDirection(
	from: Point,
	to: Point,
): Exclude<Direction, "start"> {
	return from.y === to.y ? "horizontal" : "vertical";
}

function getManhattanDistance(from: Point, to: Point): number {
	return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function removeCollinearPoints(points: Point[]): Point[] {
	return points.filter((point, index) => {
		const previous = points[index - 1];
		const next = points[index + 1];
		if (!previous || !next) return true;

		return !(
			(previous.x === point.x && point.x === next.x) ||
			(previous.y === point.y && point.y === next.y)
		);
	});
}

function toSvgPath(points: Point[]): string {
	const [first, ...rest] = points;
	return `M ${first.x} ${first.y} ${rest
		.map((point) => `L ${point.x} ${point.y}`)
		.join(" ")}`;
}

function getServiceId(node: Node): string {
	const data = node.data as { serviceName?: string } | undefined;
	return data?.serviceName ?? "default";
}

function getLayoutBounds(nodes: Node[]): {
	minX: number;
	minY: number;
	width: number;
} {
	const minX = Math.min(...nodes.map((node) => node.position.x));
	const minY = Math.min(...nodes.map((node) => node.position.y));
	const maxX = Math.max(
		...nodes.map((node) => node.position.x + getNodeSize(node, "width", 260)),
	);

	return { minX, minY, width: maxX - minX };
}

function shiftRoutedEdge<TEdge extends Edge>(
	edge: TEdge,
	offsetX: number,
	offsetY: number,
): TEdge {
	const path = (edge.data as RoutedEdgeData | undefined)?.path;
	if (!path) return edge;

	return {
		...edge,
		data: {
			...edge.data,
			path: shiftPath(path, offsetX, offsetY),
		} as TEdge["data"] & RoutedEdgeData,
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
		const side =
			handleId === OWN_OPERATION_HANDLE_ID
				? "NORTH"
				: handleId === CALLED_OPERATION_HANDLE_ID
					? "SOUTH"
					: handleId === "provider-group:own" ||
							handleId === MODULE_TARGET_HANDLE_ID
						? "WEST"
						: "EAST";
		const handleY = handleId.startsWith("provider-group:")
			? getProviderHandleY(node, handleId)
			: side === "NORTH"
				? 0
				: side === "SOUTH"
					? getNodeSize(node, "height", 150)
					: getNodeSize(node, "height", 150) / 2;
		const handleX =
			side === "WEST" ? 0 : side === "EAST" ? nodeWidth : nodeWidth / 2;

		return {
			id: getElkEndpoint(node.id, handleId),
			x: handleX,
			y: handleY,
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
			path: shouldShiftPath ? shiftPath(path, 0, pinned.offsetY) : path,
		} as TEdge["data"] & RoutedEdgeData,
	};
}

function shiftPath(path: string, offsetX: number, offsetY: number): string {
	return path.replace(
		/([ML]) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
		(_, command: string, x: string, y: string) =>
			`${command} ${Number(x) + offsetX} ${Number(y) + offsetY}`,
	);
}
