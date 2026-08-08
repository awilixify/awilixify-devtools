import type { Handler, QueryContract } from "awilixify";
import type { Deps } from "../devtools.module.js";
import type {
	ModuleGraphEdge,
	ModuleGraphGlobalProviderGroup,
	ModuleGraphNode,
	ModuleProviderImpact,
	ProviderImpact,
	GetGraphResponse as Response,
} from "../dtos/index.js";
import type { ModuleGraphInternal } from "../module-graph/types.js";

type Payload = Record<string, never>;

const emptyImpact: ModuleProviderImpact = {
	affected: [],
	added: [],
	changed: [],
	deleted: [],
};

export class GetModuleGraphQueryHandler
	implements Handler<GetModuleGraphQueryHandler["contract"]>
{
	static readonly key = "devtools/get-module-graph";
	declare readonly contract: QueryContract<
		typeof GetModuleGraphQueryHandler.key,
		Payload,
		Response
	>;

	constructor(
		private readonly graphCollector: Deps["graphCollector"],
		private readonly providerImpactAnalyzer: Deps["providerImpactAnalyzer"],
		private readonly decoratorScanner: Deps["decoratorScanner"],
	) {}

	async executor(): Promise<Response> {
		const graph = this.graphCollector.getModuleGraph();
		const impact = await this.providerImpactAnalyzer.analyze();

		return this.shapeGraph(graph, impact);
	}

	private shapeGraph(
		graph: ModuleGraphInternal,
		impact: ProviderImpact,
	): Response {
		const impactByModule = this.getProviderImpactByModule(impact);
		const shaped = this.toInstanceGroups(graph.modules);
		const globalProviderGroups = this.getGlobalProviderGroups(
			shaped.modules,
			impactByModule,
		);
		const nonGlobalEdges = graph.edges.filter((edge) => edge.type !== "global");
		const edges = this.dedupeEdges(nonGlobalEdges, shaped.sourceToVisibleId);
		const edgeCounts = this.getEdgeCounts(edges);
		const decoratorArguments =
			this.decoratorScanner.getDecoratorArgumentsByKey();

		return {
			serviceName: graph.serviceName,
			globalProviderGroups,
			modules: shaped.modules.map((module) => ({
				...module,
				entrypoints: module.entrypoints.map((entrypoint) => ({
					...entrypoint,
					decoratorArguments:
						decoratorArguments[
							`${entrypoint.controller}.${entrypoint.handler}.${entrypoint.decoratorName}`
						] ?? entrypoint.decoratorArguments,
				})),
				dependencyCount: edgeCounts.dependencyCount.get(module.id) ?? 0,
				dependentCount: edgeCounts.dependentCount.get(module.id) ?? 0,
				impact: impactByModule[module.id] ?? emptyImpact,
			})),
			edges,
			availableDecorators: this.decoratorScanner.getDecoratorNamesByClassName(),
		};
	}

	private toInstanceGroups(modules: ModuleGraphNode[]) {
		const familyCounts = this.getFamilyCounts(modules);

		return {
			modules: modules.map((module) => ({
				...module,
				grouped: false,
				familyInstanceCount:
					familyCounts.get(this.getModuleFamilyKey(module)) ?? 1,
				instanceCount: 1,
				instances: [module],
				dependencyCount: 0,
				dependentCount: 0,
			})),
			sourceToVisibleId: new Map(
				modules.map((module) => [module.id, module.id]),
			),
		};
	}

	private dedupeEdges(
		edges: ModuleGraphEdge[],
		sourceToVisibleId: Map<string, string>,
	): ModuleGraphEdge[] {
		const byId = new Map<string, ModuleGraphEdge>();

		for (const edge of edges) {
			const from = sourceToVisibleId.get(edge.from);
			const to = sourceToVisibleId.get(edge.to);

			if (!from || !to || from === to) continue;

			const nextEdge = { ...edge, from, to };
			byId.set(`${nextEdge.from}:${nextEdge.to}:${nextEdge.type}`, nextEdge);
		}

		return [...byId.values()];
	}

	private getGlobalProviderGroups(
		modules: ModuleGraphNode[],
		impactByModule: Record<string, ModuleProviderImpact>,
	): ModuleGraphGlobalProviderGroup[] {
		return modules
			.filter((module) => module.kind === "global" && module.exports.length > 0)
			.map((module) => ({
				moduleId: module.id,
				moduleName: module.name,
				providers: module.providers.filter((provider) =>
					module.exports.includes(provider),
				),
				exports: module.exports,
				providerAllowCircular: module.providerAllowCircular,
				providerDependencies: module.providerDependencies,
				providerEager: module.providerEager,
				providerInitAfter: module.providerInitAfter,
				lifetimeTypes: module.lifetimeTypes,
				impact: impactByModule[module.id] ?? emptyImpact,
			}))
			.filter((group) => group.providers.length > 0);
	}

	private getModuleFamilyKey(module: ModuleGraphNode): string {
		return module.baseName ?? module.name.replace(/_[a-f0-9]{4,}$/i, "");
	}

	private getFamilyCounts(modules: ModuleGraphNode[]): Map<string, number> {
		const counts = new Map<string, number>();

		for (const module of modules) {
			const key = this.getModuleFamilyKey(module);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}

		return counts;
	}

	private getEdgeCounts(edges: ModuleGraphEdge[]): {
		dependencyCount: Map<string, number>;
		dependentCount: Map<string, number>;
	} {
		const dependencyCount = new Map<string, number>();
		const dependentCount = new Map<string, number>();

		for (const edge of edges) {
			dependencyCount.set(edge.from, (dependencyCount.get(edge.from) ?? 0) + 1);
			dependentCount.set(edge.to, (dependentCount.get(edge.to) ?? 0) + 1);
		}

		return { dependencyCount, dependentCount };
	}

	private getProviderImpactByModule(
		impact: ProviderImpact,
	): Record<string, ModuleProviderImpact> {
		const byModule: Record<string, ModuleProviderImpact> = {};

		const getOrCreate = (moduleId: string): ModuleProviderImpact => {
			if (!byModule[moduleId]) {
				byModule[moduleId] = {
					affected: [],
					added: [],
					changed: [],
					deleted: [],
				};
			}

			return byModule[moduleId];
		};

		const pushUnique = (items: string[], item: string) => {
			if (!items.includes(item)) {
				items.push(item);
			}
		};

		for (const item of impact.newProviders) {
			pushUnique(getOrCreate(item.moduleId).added, item.provider);
		}

		for (const item of impact.deletedProviders) {
			pushUnique(getOrCreate(item.moduleId).deleted, item.provider);
		}

		for (const item of impact.changedProviders) {
			pushUnique(getOrCreate(item.moduleId).changed, item.provider);
		}

		for (const item of impact.affectedProviders) {
			pushUnique(getOrCreate(item.moduleId).affected, item.provider);
		}

		return byModule;
	}
}
