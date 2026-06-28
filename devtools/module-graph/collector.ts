import type * as Awilix from "awilix";
import type { LifetimeType } from "awilix";
import {
	hasUseClass,
	type InternalModuleLike as M,
	type ModuleDecoratorMetadata,
} from "awilixify/devtools";
import type { ModuleGraphEdge } from "../dtos/index.js";
import { ModuleGraphProviderCollector } from "./provider-collector.js";
import { ModuleGraphRouteCollector } from "./route-collector.js";
import type { ModuleGraphInternal, ModuleGraphNodeInternal } from "./types.js";

type ModuleGraph = ModuleGraphInternal;

export class ModuleGraphCollector {
	private rootModule!: M;
	private readonly modules = new Map<string, ModuleGraphNodeInternal>();
	private readonly edges = new Map<string, ModuleGraphEdge>();
	private readonly providerCollector = new ModuleGraphProviderCollector();

	private readonly routeCollector = new ModuleGraphRouteCollector({
		getModuleNode: (moduleId) => this.modules.get(moduleId),
		getOrCreateModule: (module) => this.getOrCreateModule(module),
	});

	private readonly moduleScopeByGraphId = new Map<
		string,
		Awilix.AwilixContainer
	>();
	private readonly moduleByGraphId = new Map<string, M>();

	private globalModules: readonly M[] = [];

	initialize(rootModule: M, globalModules: readonly M[]): void {
		this.rootModule = rootModule;
		this.modules.clear();
		this.edges.clear();

		this.globalModules = globalModules;

		this.moduleScopeByGraphId.clear();
		this.moduleByGraphId.clear();
	}

	registerModule({
		module,
		scope,
		importedModules,
	}: {
		module: M;
		scope: Awilix.AwilixContainer;
		importedModules: readonly M[];
	}): string {
		const id = this.getOrCreateModule(module);
		this.moduleByGraphId.set(id, module);

		if (!this.moduleScopeByGraphId.has(id)) {
			this.moduleScopeByGraphId.set(id, scope);
		}

		for (const globalModule of this.globalModules) {
			this.addEdge(module, globalModule, "global");
		}

		for (const importedModule of importedModules) {
			this.addEdge(module, importedModule, "imports");
		}

		return id;
	}

	getModule(moduleId: string): M | undefined {
		return this.moduleByGraphId.get(moduleId);
	}

	getModuleScope(moduleId: string): Awilix.AwilixContainer | undefined {
		return this.moduleScopeByGraphId.get(moduleId);
	}

	collectModuleRoutes(input: ModuleDecoratorMetadata): void {
		this.routeCollector.collectModuleRoutes(input);
	}

	getModuleGraph(): ModuleGraph {
		return {
			globalProviderGroups: [],
			modules: [...this.modules.values()],
			edges: [...this.edges.values()],
		};
	}

	private getOrCreateModule(module: M): string {
		const existingId = this.findModuleId(module);

		if (existingId) return existingId;

		const id = this.createModuleId(module);

		this.moduleByGraphId.set(id, module);
		this.modules.set(id, this.createNode(id, module));

		return id;
	}

	private addEdge(from: M, to: M, type: ModuleGraphEdge["type"]): void {
		const edge = {
			from: this.getOrCreateModule(from),
			to: this.getOrCreateModule(to),
			type,
		};
		this.edges.set(`${edge.from}:${edge.to}:${edge.type}`, edge);
	}

	private createNode(id: string, module: M): ModuleGraphNodeInternal {
		const kind =
			module === this.rootModule
				? "root"
				: this.globalModules.includes(module)
					? "global"
					: "feature";

		return {
			id,
			name: module.name,
			baseName: module.__devtools?.baseName,
			dynamic: module.__devtools?.dynamic,
			grouped: false,
			dependencyCount: 0,
			dependentCount: 0,
			familyInstanceCount: 1,
			instanceCount: 1,
			instances: [],
			kind,
			...this.providerCollector.collectProviders(module),
			exports: [...(module.exports ?? [])],
			controllers: (module.controllers ?? []).map(this.getClassName),
			controllerLifetimeTypes: this.getControllerLifetimeTypes(module),
			queryHandlers: (module.queryHandlers ?? []).map(this.getClassName),
			commandHandlers: (module.commandHandlers ?? []).map(this.getClassName),
			queryHandlerKeys: this.getHandlerKeys(module.queryHandlers),
			commandHandlerKeys: this.getHandlerKeys(module.commandHandlers),
			queryPreHandlers: Object.keys(module.queryPreHandlers ?? {}),
			queryPreHandlerExports: [...(module.queryPreHandlerExports ?? [])],
			commandPreHandlers: Object.keys(module.commandPreHandlers ?? {}),
			commandPreHandlerExports: [...(module.commandPreHandlerExports ?? [])],
			queryPreHandlerClassNames: this.getFeatureClassNames(
				module.queryPreHandlers,
			),
			commandPreHandlerClassNames: this.getFeatureClassNames(
				module.commandPreHandlers,
			),
			queryPreHandlerLifetimeTypes: this.getFeatureLifetimeTypes(
				module.queryPreHandlers,
				module.providerOptions?.lifetime,
			),
			commandPreHandlerLifetimeTypes: this.getFeatureLifetimeTypes(
				module.commandPreHandlers,
				module.providerOptions?.lifetime,
			),
			interceptors: Object.keys(module.interceptors ?? {}),
			interceptorExports: [...(module.interceptorExports ?? [])],
			interceptorClassNames: this.getFeatureClassNames(module.interceptors),
			interceptorDecoratorNames: this.getInterceptorDecoratorNames(module),
			initializers: Object.keys(module.initializers ?? {}),
			initializerExports: [...(module.initializerExports ?? [])],
			initializerClassNames: this.getFeatureClassNames(module.initializers),
			entrypoints: [],
			routes: [],
			impact: {
				added: [],
				affected: [],
				changed: [],
				deleted: [],
			},
		};
	}

	// Controllers can be registered as `{ useClass, lifetime }`; entrypoints then
	// inherit that lifetime. Mirrors the provider fallback: own lifetime, else the
	// module's provider lifetime, else SINGLETON.
	private getControllerLifetimeTypes(module: M): Record<string, LifetimeType> {
		const fallback = module.providerOptions?.lifetime;

		return Object.fromEntries(
			(module.controllers ?? []).map((controller) => [
				this.getClassName(controller),
				this.getLifetime(controller, fallback),
			]),
		);
	}

	// Keyed features (pre-handlers) can carry a lifetime the same way, keyed by
	// their registration key ("auth").
	private getFeatureLifetimeTypes(
		features: Record<string, unknown> | undefined,
		fallback?: LifetimeType,
	): Record<string, LifetimeType> {
		return Object.fromEntries(
			Object.entries(features ?? {}).map(([key, feature]) => [
				key,
				this.getLifetime(feature, fallback),
			]),
		);
	}

	private getLifetime(value: unknown, fallback?: LifetimeType): LifetimeType {
		return (
			(value as { lifetime?: LifetimeType })?.lifetime ??
			fallback ??
			"SINGLETON"
		);
	}

	// Maps each keyed feature ("auth") to its class name so the playground can
	// match trace spans (which carry class names) back to registration keys.
	private getFeatureClassNames(
		features: Record<string, unknown> | undefined,
	): Record<string, string> {
		return Object.fromEntries(
			Object.entries(features ?? {}).map(([key, feature]) => [
				key,
				this.getClassName(feature),
			]),
		);
	}

	private getInterceptorDecoratorNames(module: M): Record<string, string[]> {
		const namesByKey = new Map<string, Set<string>>();

		for (const classTarget of this.getModuleClasses(module)) {
			for (const [decoratorKey, decoratorNames] of this.getDecoratorStateNames(
				classTarget,
			)) {
				const names = namesByKey.get(decoratorKey) ?? new Set<string>();

				for (const decoratorName of decoratorNames) {
					names.add(decoratorName);
				}

				namesByKey.set(decoratorKey, names);
			}
		}

		return Object.fromEntries(
			[...namesByKey.entries()].map(([key, names]) => [key, [...names]]),
		);
	}

	private getModuleClasses(module: M): unknown[] {
		return [
			...Object.values(module.providers ?? {}),
			...(module.controllers ?? []),
			...(module.queryHandlers ?? []),
			...(module.commandHandlers ?? []),
		].flatMap((value) => {
			const classTarget = hasUseClass(value) ? value.useClass : value;

			return typeof classTarget === "function" ? [classTarget] : [];
		});
	}

	private getDecoratorStateNames(target: unknown): Array<[string, string[]]> {
		const metadataSymbol = (Symbol as { metadata?: symbol }).metadata;
		if (!metadataSymbol) return [];

		const metadata = (target as { [metadataSymbol]?: unknown })?.[
			metadataSymbol
		];
		if (!metadata || typeof metadata !== "object") return [];

		return [
			...Object.getOwnPropertyNames(metadata),
			...Object.getOwnPropertySymbols(metadata),
		].flatMap((metadataKey) => {
			const state = (metadata as Record<PropertyKey, unknown>)[metadataKey];
			const decoratorKey = this.getDecoratorKey(metadataKey);
			const decoratorNames = this.getDecoratorNames(state);

			return decoratorKey && decoratorNames.length > 0
				? [[decoratorKey, decoratorNames] as [string, string[]]]
				: [];
		});
	}

	private getDecoratorKey(metadataKey: string | symbol): string | null {
		if (typeof metadataKey !== "symbol") return null;

		const description = metadataKey.description;
		if (!description?.startsWith("DecoratorState:")) return null;

		return description.slice("DecoratorState:".length);
	}

	private getDecoratorNames(state: unknown): string[] {
		const decoratorNames = (state as { decoratorNames?: unknown })
			?.decoratorNames;

		if (!(decoratorNames instanceof Map)) return [];

		return [...new Set([...decoratorNames.values()])].filter(
			(name): name is string => typeof name === "string" && name.length > 0,
		);
	}

	// Maps each handler's static mediator key ("cats/get-cats") to its class
	// name so the playground can invoke handlers through the mediator.
	private getHandlerKeys(
		handlers: readonly unknown[] | undefined,
	): Record<string, string> {
		const entries: [string, string][] = [];

		for (const handler of handlers ?? []) {
			const handlerClass = hasUseClass(handler) ? handler.useClass : handler;
			const key = (handlerClass as { key?: unknown })?.key;

			if (typeof key === "string") {
				entries.push([key, this.getClassName(handler)]);
			}
		}

		return Object.fromEntries(entries);
	}

	private getClassName(value: unknown): string {
		if (typeof value === "function") return value.name || "anonymous";

		if (hasUseClass(value)) {
			return value.useClass.name || "anonymous";
		}

		return "anonymous";
	}

	private createModuleId(module: M): string {
		const baseId = this.slugify(module.name);
		let id = baseId;
		let index = 2;

		while (this.modules.has(id)) {
			id = `${baseId}-${index}`;
			index += 1;
		}

		return id;
	}

	private findModuleId(module: M): string | null {
		for (const [id, existingModule] of this.moduleByGraphId) {
			if (existingModule === module) return id;
		}

		return null;
	}

	private slugify(value: string): string {
		return value
			.trim()
			.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
			.replace(/[^a-zA-Z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.toLowerCase();
	}
}
