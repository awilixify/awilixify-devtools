import { useMemo } from "react";
import { useGetDevtoolsGraphSuspense } from "@/api/graph/graph";
import type {
	GetGraphResponse,
	ModuleGraphNode,
	ModuleGraphRoute,
} from "@/api/model";

export type RouteOccurrence = ModuleGraphRoute & {
	id: string;
	moduleId: string;
	moduleName: string;
};

export type ProviderOccurrence = {
	id: string;
	providerKey: string;
	ownerModuleId: string;
	ownerModuleName: string;
	scopeModuleId: string;
	scopeModuleName: string;
};

export type SelectOption = {
	value: string;
	label: string;
};

export function useProviderSelectOptions(
	selectedScopeModuleId: string | null,
	selectedProviderKey: string | null,
) {
	const { data: graph } = useGetDevtoolsGraphSuspense();

	const providers = useMemo(() => getProviderOccurrences(graph), [graph]);

	const resolvedProviderKey = useMemo(
		() =>
			resolveProviderKey(providers, selectedScopeModuleId, selectedProviderKey),
		[providers, selectedProviderKey, selectedScopeModuleId],
	);
	const playgroundProviderKey = resolvedProviderKey ?? selectedProviderKey;

	const moduleOptions = useMemo(
		() => getModuleOptions(graph, providers, playgroundProviderKey),
		[graph, playgroundProviderKey, providers],
	);
	const providerOptions = useMemo(
		() => getProviderOptions(providers, selectedScopeModuleId),
		[providers, selectedScopeModuleId],
	);
	const selectedProvider = getSelectedProviderOccurrence(
		providers,
		selectedScopeModuleId,
		playgroundProviderKey,
	);

	return {
		graph,
		providers,
		resolvedProviderKey,
		playgroundProviderKey,
		moduleOptions,
		providerOptions,
		selectedProvider,
	};
}

function getProviderOccurrences(graph: GetGraphResponse): ProviderOccurrence[] {
	const moduleById = new Map(
		graph.modules.map((module) => [module.id, module]),
	);
	const occurrences: ProviderOccurrence[] = [];

	for (const scopeModule of graph.modules) {
		for (const providerKey of scopeModule.providers) {
			if (!isInvocableProvider(scopeModule, providerKey)) continue;

			occurrences.push(
				createProviderOccurrence({
					providerKey,
					ownerModule: scopeModule,
					scopeModule,
				}),
			);
		}

		// Query/command handlers are registered in the module scope under their
		// class name, so they are invocable providers too.
		for (const handlerClassName of [
			...scopeModule.queryHandlers,
			...scopeModule.commandHandlers,
		]) {
			occurrences.push(
				createProviderOccurrence({
					providerKey: handlerClassName,
					ownerModule: scopeModule,
					scopeModule,
				}),
			);
		}

		const outgoing = graph.edges.filter((edge) => edge.from === scopeModule.id);

		for (const edge of outgoing) {
			const ownerModule = moduleById.get(edge.to);
			if (!ownerModule) continue;

			for (const providerKey of ownerModule.exports) {
				if (!isInvocableProvider(ownerModule, providerKey)) continue;

				occurrences.push(
					createProviderOccurrence({
						providerKey,
						ownerModule,
						scopeModule,
					}),
				);
			}
		}
	}

	return dedupeProviderOccurrences(occurrences).sort((a, b) =>
		formatOccurrenceSortKey(a).localeCompare(formatOccurrenceSortKey(b)),
	);
}

// Value/factory providers have no invocable methods, so they are hidden from
// the playground. Only an explicit false hides a provider: re-exports whose
// definition lives in a transitive module have no providerIsClass entry here.
function isInvocableProvider(
	module: ModuleGraphNode,
	providerKey: string,
): boolean {
	return module.providerIsClass[providerKey] !== false;
}

function getModuleOptions(
	graph: GetGraphResponse,
	providers: ProviderOccurrence[],
	selectedProviderKey: string | null,
): SelectOption[] {
	const availableModuleIds = selectedProviderKey
		? new Set(
				providers
					.filter((provider) => provider.providerKey === selectedProviderKey)
					.map((provider) => provider.scopeModuleId),
			)
		: null;

	return graph.modules
		.filter(
			(module) => !availableModuleIds || availableModuleIds.has(module.id),
		)
		.map((module) => ({
			value: module.id,
			label: module.name,
		}))
		.sort((a, b) => a.label.localeCompare(b.label));
}

function resolveProviderKey(
	providers: ProviderOccurrence[],
	selectedScopeModuleId: string | null,
	selectedProviderKey: string | null,
): string | null {
	if (!selectedProviderKey) return null;

	const scopedProviders = selectedScopeModuleId
		? providers.filter(
				(provider) => provider.scopeModuleId === selectedScopeModuleId,
			)
		: providers;

	const exactProvider = scopedProviders.find(
		(provider) => provider.providerKey === selectedProviderKey,
	);
	if (exactProvider) return exactProvider.providerKey;

	const normalizedSelectedProviderKey =
		normalizeProviderKey(selectedProviderKey);
	const normalizedProvider = scopedProviders.find(
		(provider) =>
			normalizeProviderKey(provider.providerKey) ===
			normalizedSelectedProviderKey,
	);
	if (normalizedProvider) return normalizedProvider.providerKey;

	const lowerFirstProviderKey = lowerFirst(selectedProviderKey);
	const lowerFirstProvider = scopedProviders.find(
		(provider) => provider.providerKey === lowerFirstProviderKey,
	);

	return lowerFirstProvider?.providerKey ?? null;
}

function getProviderOptions(
	providers: ProviderOccurrence[],
	selectedScopeModuleId: string | null,
): SelectOption[] {
	const filteredProviders = selectedScopeModuleId
		? providers.filter(
				(provider) => provider.scopeModuleId === selectedScopeModuleId,
			)
		: providers;
	const providerByKey = new Map<string, ProviderOccurrence[]>();

	for (const provider of filteredProviders) {
		providerByKey.set(provider.providerKey, [
			...(providerByKey.get(provider.providerKey) ?? []),
			provider,
		]);
	}

	return [...providerByKey.keys()]
		.map((providerKey) => ({
			value: providerKey,
			label: providerKey,
		}))
		.sort((a, b) => a.label.localeCompare(b.label));
}

function getSelectedProviderOccurrence(
	providers: ProviderOccurrence[],
	selectedScopeModuleId: string | null,
	selectedProviderKey: string | null,
): ProviderOccurrence | null {
	if (!selectedScopeModuleId || !selectedProviderKey) return null;

	return (
		providers.find(
			(provider) =>
				provider.scopeModuleId === selectedScopeModuleId &&
				provider.providerKey === selectedProviderKey,
		) ?? null
	);
}

function createProviderOccurrence({
	providerKey,
	ownerModule,
	scopeModule,
}: {
	providerKey: string;
	ownerModule: ModuleGraphNode;
	scopeModule: ModuleGraphNode;
}): ProviderOccurrence {
	return {
		id: `${scopeModule.id}:${ownerModule.id}:${providerKey}`,
		providerKey,
		ownerModuleId: ownerModule.id,
		ownerModuleName: ownerModule.name,
		scopeModuleId: scopeModule.id,
		scopeModuleName: scopeModule.name,
	};
}

function dedupeProviderOccurrences(
	occurrences: ProviderOccurrence[],
): ProviderOccurrence[] {
	const byId = new Map<string, ProviderOccurrence>();

	for (const occurrence of occurrences) {
		byId.set(occurrence.id, occurrence);
	}

	return [...byId.values()];
}

function formatOccurrenceSortKey(provider: ProviderOccurrence): string {
	return `${provider.scopeModuleName}.${provider.providerKey}.${provider.ownerModuleName}`;
}

function normalizeProviderKey(value: string): string {
	return lowerFirst(value).toLowerCase();
}

function lowerFirst(value: string): string {
	return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}
