import type { Handler, QueryContract } from "awilixify";
import type { Deps } from "../devtools.module.js";
import type {
	AvailableModuleFeature,
	GetModuleDetailsResponse,
	GetModuleDetailsParams as Payload,
} from "../dtos/index.js";
import type { ModuleGraphNodeInternal } from "../module-graph/types.js";

type Response = GetModuleDetailsResponse | null;
type FeatureKind =
	| "commandPreHandler"
	| "initializer"
	| "interceptor"
	| "queryPreHandler";

export class GetModuleDetailsQueryHandler
	implements Handler<GetModuleDetailsQueryHandler["contract"]>
{
	static readonly key = "devtools/get-module-details";
	declare readonly contract: QueryContract<
		typeof GetModuleDetailsQueryHandler.key,
		Payload,
		Response
	>;

	constructor(
		private readonly graphCollector: Deps["graphCollector"],
		private readonly decoratorScanner: Deps["decoratorScanner"],
	) {}

	async executor(payload: Payload): Promise<Response> {
		const graph = this.graphCollector.getModuleGraph();
		const module = this.findModuleNode(graph.modules, payload.moduleId);

		if (!module) return null;

		const importEdges = graph.edges.filter(
			(edge) => edge.from === module.id && edge.type === "imports",
		);
		const importedModules = importEdges
			.map((edge) => graph.modules.find((m) => m.id === edge.to))
			.filter((node): node is ModuleGraphNodeInternal => Boolean(node));
		const globalModules = graph.modules.filter(
			(node) => node.kind === "global",
		);
		const usedByModules = graph.edges
			.filter((edge) => edge.to === module.id)
			.map(
				(edge) =>
					graph.modules.find((m) => m.id === edge.from)?.name ?? edge.from,
			);

		return {
			availableCommandPreHandlerDetails: this.getFeatureDetails({
				module,
				importedModules,
				globalModules,
				kind: "commandPreHandler",
			}),
			availableCommandPreHandlers: this.unique([
				...module.commandPreHandlers,
				...importedModules.flatMap((node) => node.commandPreHandlerExports),
				...globalModules.flatMap((node) => node.commandPreHandlerExports),
			]),
			availableInitializers: this.unique([
				...module.initializers,
				...importedModules.flatMap((node) => node.initializerExports),
				...globalModules.flatMap((node) => node.initializerExports),
			]),
			availableInitializerDetails: this.getFeatureDetails({
				module,
				importedModules,
				globalModules,
				kind: "initializer",
			}),
			availableInterceptorDetails: this.getFeatureDetails({
				module,
				importedModules,
				globalModules,
				kind: "interceptor",
			}),
			availableInterceptors: this.unique([
				...module.interceptors,
				...importedModules.flatMap((node) => node.interceptorExports),
				...globalModules.flatMap((node) => node.interceptorExports),
			]),
			availableQueryPreHandlerDetails: this.getFeatureDetails({
				module,
				importedModules,
				globalModules,
				kind: "queryPreHandler",
			}),
			availableQueryPreHandlers: this.unique([
				...module.queryPreHandlers,
				...importedModules.flatMap((node) => node.queryPreHandlerExports),
				...globalModules.flatMap((node) => node.queryPreHandlerExports),
			]),
			globalModules: globalModules.map((node) => node.name),
			importedModules: importEdges.map(
				(edge) => graph.modules.find((m) => m.id === edge.to)?.name ?? edge.to,
			),
			module,
			entrypoints: module.entrypoints,
			routes: module.routes,
			usedByModules,
			availableDecorators: this.decoratorScanner.getDecoratorNamesByClassName(),
		};
	}

	private findModuleNode(
		modules: ModuleGraphNodeInternal[],
		moduleIdOrName: string,
	): ModuleGraphNodeInternal | null {
		return (
			modules.find((module) => module.id === moduleIdOrName) ??
			modules.find((module) => module.name === moduleIdOrName) ??
			null
		);
	}

	private unique(items: string[]): string[] {
		return [...new Set(items)];
	}

	private getFeatureDetails({
		module,
		importedModules,
		globalModules,
		kind,
	}: {
		module: ModuleGraphNodeInternal;
		importedModules: ModuleGraphNodeInternal[];
		globalModules: ModuleGraphNodeInternal[];
		kind: FeatureKind;
	}): AvailableModuleFeature[] {
		const rows = [
			...this.getModuleFeatureDetails(module, module, kind, "own", false),
			...importedModules.flatMap((importedModule) =>
				this.getModuleFeatureDetails(
					importedModule,
					module,
					kind,
					"imported",
					true,
				),
			),
			...globalModules.flatMap((globalModule) =>
				this.getModuleFeatureDetails(
					globalModule,
					module,
					kind,
					"global",
					true,
				),
			),
		];
		const byKey = new Map<string, AvailableModuleFeature>();

		for (const row of rows) {
			if (!byKey.has(row.key)) {
				byKey.set(row.key, row);
			}
		}

		return [...byKey.values()];
	}

	private getModuleFeatureDetails(
		sourceModule: ModuleGraphNodeInternal,
		selectedModule: ModuleGraphNodeInternal,
		kind: FeatureKind,
		origin: AvailableModuleFeature["origin"],
		exportedOnly: boolean,
	): AvailableModuleFeature[] {
		const { classNames, keys, lifetimeTypes } = this.getModuleFeatureConfig(
			sourceModule,
			kind,
			exportedOnly,
		);
		const exportedKeys = new Set(
			this.getModuleFeatureConfig(sourceModule, kind, true).keys,
		);

		return keys.map((key) => ({
			className: classNames[key] ?? key,
			decoratorNames: this.getDecoratorNamesForFeature(
				selectedModule,
				kind,
				key,
			),
			exported: exportedOnly || exportedKeys.has(key),
			key,
			lifetime: lifetimeTypes?.[key],
			moduleName: sourceModule.name,
			origin,
		}));
	}

	private getModuleFeatureConfig(
		module: ModuleGraphNodeInternal,
		kind: FeatureKind,
		exportedOnly: boolean,
	): {
		classNames: Record<string, string>;
		keys: string[];
		lifetimeTypes?: Record<string, AvailableModuleFeature["lifetime"]>;
	} {
		switch (kind) {
			case "commandPreHandler":
				return {
					classNames: module.commandPreHandlerClassNames,
					keys: exportedOnly
						? module.commandPreHandlerExports
						: module.commandPreHandlers,
					lifetimeTypes: module.commandPreHandlerLifetimeTypes,
				};
			case "interceptor":
				return {
					classNames: module.interceptorClassNames,
					keys: exportedOnly ? module.interceptorExports : module.interceptors,
				};
			case "initializer":
				return {
					classNames: module.initializerClassNames,
					keys: exportedOnly ? module.initializerExports : module.initializers,
				};
			case "queryPreHandler":
				return {
					classNames: module.queryPreHandlerClassNames,
					keys: exportedOnly
						? module.queryPreHandlerExports
						: module.queryPreHandlers,
					lifetimeTypes: module.queryPreHandlerLifetimeTypes,
				};
		}
	}

	private getDecoratorNamesForFeature(
		module: ModuleGraphNodeInternal,
		kind: FeatureKind,
		key: string,
	): string[] {
		if (kind === "interceptor") {
			return module.interceptorDecoratorNames[key] ?? [];
		}

		if (kind === "initializer") {
			return this.unique(
				module.entrypoints.flatMap((entrypoint) =>
					entrypoint.initializerKey === key && entrypoint.decoratorName
						? [entrypoint.decoratorName]
						: [],
				),
			);
		}

		return [];
	}
}
