import type { GetGraphResponse } from "@/api/model";
import type { DevtoolsTarget } from "../targets/target-config";
import type { GraphData, GraphModule } from "./types";

export type TargetGraph = Omit<GetGraphResponse, "modules"> & {
	modules: GraphModule[];
};

export function bindGraphToTarget(
	graph: GetGraphResponse,
	target: DevtoolsTarget,
): TargetGraph {
	if (graph.serviceName !== target.serviceName) {
		throw new Error(
			`expected service "${target.serviceName}", received "${graph.serviceName}"`,
		);
	}

	return {
		...graph,
		modules: graph.modules.map((module) => ({
			...module,
			serviceName: graph.serviceName,
		})),
	};
}

export function mergeTargetGraphs(targetGraphs: TargetGraph[]): GraphData {
	const availableDecorators = new Map<string, Set<string>>();

	for (const graph of targetGraphs) {
		for (const [className, decorators] of Object.entries(
			graph.availableDecorators,
		)) {
			const names = availableDecorators.get(className) ?? new Set<string>();
			for (const decorator of decorators) names.add(decorator);
			availableDecorators.set(className, names);
		}
	}

	return {
		availableDecorators: Object.fromEntries(
			[...availableDecorators].map(([className, decorators]) => [
				className,
				[...decorators],
			]),
		),
		edges: targetGraphs.flatMap((graph) => graph.edges),
		globalProviderGroups: targetGraphs.flatMap(
			(graph) => graph.globalProviderGroups,
		),
		modules: targetGraphs.flatMap((graph) => graph.modules),
	};
}
