import type { Constructor } from "awilix";

import type { Handler, QueryContract } from "awilixify";
import { hasUseClass, isConstructorProvider } from "awilixify/devtools";
import type { Deps } from "../devtools.module.js";
import type {
	GetProviderMethodsQuery as Payload,
	GetProviderMethodsResponse as Response,
} from "../dtos/index.js";

export class GetProviderMethodsQueryHandler
	implements Handler<GetProviderMethodsQueryHandler["contract"]>
{
	static readonly key = "devtools/get-provider-methods";
	declare readonly contract: QueryContract<
		typeof GetProviderMethodsQueryHandler.key,
		Payload,
		Response
	>;

	constructor(private readonly graphCollector: Deps["graphCollector"]) {}

	async executor(payload: Payload): Promise<Response> {
		const graph = this.graphCollector.getModuleGraph();
		const scopeModule = this.graphCollector.getModule(payload.scopeModuleId);

		const providerDefinition = scopeModule?.providers?.[payload.providerKey]
			? scopeModule.providers[payload.providerKey]
			: graph.edges
					.filter((edge) => edge.from === payload.scopeModuleId)
					.map((edge) => this.graphCollector.getModule(edge.to))
					.find((module) => module?.exports?.includes(payload.providerKey))
					?.providers?.[payload.providerKey];

		const useClass =
			this.getProviderClass(providerDefinition) ??
			this.findHandlerClass(scopeModule, payload.providerKey);

		return {
			methods: (useClass
				? this.getTargetMethodNames(useClass.prototype)
				: []
			).sort((a, b) => a.localeCompare(b)),
		};
	}

	// Query/command handlers are registered in the module scope under their
	// class name, so the playground can invoke them like any other provider.
	private findHandlerClass(
		scopeModule: ReturnType<Deps["graphCollector"]["getModule"]>,
		providerKey: string,
	): Constructor<object> | null {
		const handlers = [
			...(scopeModule?.queryHandlers ?? []),
			...(scopeModule?.commandHandlers ?? []),
		];

		for (const handler of handlers) {
			const handlerClass = hasUseClass(handler) ? handler.useClass : handler;

			if (
				typeof handlerClass === "function" &&
				handlerClass.name === providerKey
			) {
				return handlerClass as Constructor<object>;
			}
		}

		return null;
	}

	private getProviderClass(
		providerDefinition: unknown,
	): Constructor<object> | null {
		if (isConstructorProvider(providerDefinition)) {
			return providerDefinition;
		}

		if (hasUseClass(providerDefinition)) {
			return providerDefinition.useClass;
		}

		return null;
	}

	private getTargetMethodNames(target: object): string[] {
		return Object.getOwnPropertyNames(target).filter(
			(name) =>
				name !== "constructor" &&
				typeof (target as Record<string, unknown>)[name] === "function",
		);
	}
}
