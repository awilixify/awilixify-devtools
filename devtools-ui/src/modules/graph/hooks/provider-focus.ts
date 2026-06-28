import type { GetGraphResponse, ModuleGraphNode } from "@/api/model";
import type { ProviderFocusInput, ProviderFocusState } from "../types";

export function getProviderFocusState(
	modules: ModuleGraphNode[],
	focus: ProviderFocusInput,
): ProviderFocusState | null {
	if (!focus) return null;

	const dependencies = new Set<string>();
	const dependants = new Set<string>();

	for (const module of modules) {
		for (const [providerName, providerDependencies] of Object.entries(
			module.providerDependencies ?? {},
		)) {
			if (providerName === focus.provider) {
				for (const dependency of providerDependencies) {
					dependencies.add(dependency);
				}
			}

			if (providerDependencies.includes(focus.provider)) {
				dependants.add(providerName);
			}
		}
	}

	return {
		dependencies: [...dependencies],
		dependants: [...dependants],
		occurrenceId: focus.occurrenceId,
		provider: focus.provider,
	};
}

export function getProviderFocusModuleIds(
	modules: ModuleGraphNode[],
	providerFocus: ProviderFocusInput | null,
): Set<string> | null {
	const state = getProviderFocusState(modules, providerFocus);

	if (!state) return null;

	const relatedProviders = new Set([
		state.provider,
		...state.dependencies,
		...state.dependants,
	]);

	return new Set(
		modules
			.filter((module) =>
				module.providers.some((provider) => relatedProviders.has(provider)),
			)
			.map((module) => module.id),
	);
}

export function filterProviderFocusGraph({
	graph,
	providerFocus,
	relatedOnly,
}: {
	graph: GetGraphResponse;
	providerFocus: ProviderFocusInput | null;
	relatedOnly: boolean | undefined;
}): GetGraphResponse {
	const providerFocusModuleIds = relatedOnly
		? getProviderFocusModuleIds(graph.modules, providerFocus)
		: null;

	if (!providerFocusModuleIds) return graph;

	return {
		...graph,
		modules: graph.modules.filter((module) =>
			providerFocusModuleIds.has(module.id),
		),
		edges: graph.edges.filter(
			(edge) =>
				providerFocusModuleIds.has(edge.from) &&
				providerFocusModuleIds.has(edge.to),
		),
	};
}
