import { useQueries } from "@tanstack/react-query";
import { useRef } from "react";
import { withDevtoolsBasePath } from "@/devtools-fetch";
import { getDevtoolsGraph } from "@/api/graph/graph";
import { useTargets } from "../../targets/TargetsContext";
import type { DevtoolsTarget } from "../../targets/target-config";
import {
	bindGraphToTarget,
	mergeTargetGraphs,
	type TargetGraph,
} from "../platform-graph";
import type { GraphData } from "../types";

export function useModuleGraphData(): {
	error: string | null;
	graph: GraphData | null;
	loading: boolean;
} {
	const { targets } = useTargets();
	const queries = useQueries({
		queries: targets.map((target) => ({
			queryKey: ["devtools-graph", target.serviceName],
			queryFn: ({ signal }: { signal: AbortSignal }) =>
				fetchServiceGraph(target, signal),
			refetchOnMount: true,
			retry: false,
		})),
	});
	const serviceGraphs = queries.flatMap((query) =>
		query.data ? [query.data] : [],
	);
	const graphCache = useRef<{
		graph: GraphData | null;
		serviceGraphs: TargetGraph[];
	} | null>(null);

	if (
		!graphCache.current ||
		!sameServiceGraphs(graphCache.current.serviceGraphs, serviceGraphs)
	) {
		graphCache.current = {
			graph:
				serviceGraphs.length > 0 ? mergeTargetGraphs(serviceGraphs) : null,
			serviceGraphs,
		};
	}

	const errors = queries.flatMap((query, index) =>
		query.error
			? [
					`${targets[index]?.serviceName ?? "Target"}: ${
						query.error instanceof Error
							? query.error.message
							: String(query.error)
					}`,
				]
			: [],
	);

	return {
		error: errors.length > 0 ? errors.join("; ") : null,
		graph: graphCache.current.graph,
		loading: queries.some((query) => query.isPending),
	};
}

function sameServiceGraphs(
	previous: TargetGraph[],
	next: TargetGraph[],
): boolean {
	return (
		previous.length === next.length &&
		previous.every((graph, index) => graph === next[index])
	);
}

async function fetchServiceGraph(
	target: DevtoolsTarget,
	signal: AbortSignal,
): Promise<TargetGraph> {
	const graph = await getDevtoolsGraph(
		withDevtoolsBasePath(target.basePath, { signal }),
	);

	return bindGraphToTarget(graph, target);
}
