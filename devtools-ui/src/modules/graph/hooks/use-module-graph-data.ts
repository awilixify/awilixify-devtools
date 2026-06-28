import { useGetDevtoolsGraph } from "@/api/graph/graph";
import type { GetGraphResponse } from "@/api/model";

export function useModuleGraphData(): {
	error: string | null;
	graph: GetGraphResponse | null;
	loading: boolean;
} {
	const graphQuery = useGetDevtoolsGraph({
		query: { refetchOnMount: true },
	});

	return {
		error: graphQuery.error
			? graphQuery.error instanceof Error
				? graphQuery.error.message
				: String(graphQuery.error)
			: null,
		graph: graphQuery.data ?? null,
		loading: graphQuery.isLoading || graphQuery.isFetching,
	};
}
