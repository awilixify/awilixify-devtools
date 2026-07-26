import { resolveDecoratorState } from "awilixify";
import {
	getControllerMethodNames,
	type InternalModuleLike as M,
	type ModuleDecoratorMetadata,
} from "awilixify/devtools";
import {
	HTTP_DECORATOR_STATE_TOKEN,
	type RouteSchema,
	rollUpHttpDecoratorState,
} from "awilixify/http";
import type {
	ModuleGraphEntrypoint,
	ModuleGraphNode,
	ModuleGraphRoute,
} from "./types.js";

type ModuleGraphRouteCollectorOptions = {
	getServiceName(): string;
	getOrCreateModule(module: M): string;
	getModuleNode(moduleId: string): ModuleGraphNode | undefined;
};

export class ModuleGraphRouteCollector {
	constructor(private readonly options: ModuleGraphRouteCollectorOptions) {}

	collectModuleRoutes({
		module,
		controllers,
		initializers,
	}: ModuleDecoratorMetadata): void {
		for (const { controllerClass: controller } of controllers) {
			for (const methodName of getControllerMethodNames(controller)) {
				for (const [initializerKey, resolveInitializer] of initializers) {
					const initializer = resolveInitializer();
					const decoratorState = resolveDecoratorState(
						controller,
						initializer.token,
					);

					if (decoratorState === null) continue;

					const metadata = decoratorState.methods.get(methodName);

					if (metadata === undefined) continue;
					const isHttpEntrypoint =
						initializer.token.stateSymbol.description ===
						HTTP_DECORATOR_STATE_TOKEN.stateSymbol.description;
					const entrypointType = getEntrypointType(
						initializer.token.stateSymbol.description,
					);
					const decoratorName =
						decoratorState.decoratorNames.get(methodName) ?? initializerKey;

					if (!isHttpEntrypoint) {
						this.collectMessageSubscription(module, metadata);
						this.addEntrypoint(module, {
							type: entrypointType,
							label: this.formatEntrypointLabel(entrypointType, metadata),
							controller: controller.name,
							handler: String(methodName),
							initializerKey,
							decoratorName,
							metadata: this.toJsonSafeValue(metadata),
						});
						continue;
					}

					const httpState = rollUpHttpDecoratorState(
						decoratorState.root,
						metadata,
					);

					for (const method of httpState.verbs) {
						for (const path of httpState.paths) {
							this.addRoute(module, {
								method,
								path,
								controller: controller.name,
								handler: String(methodName),
								operationId: String(methodName),
								schema: this.getRequestSchema(httpState.schema),
							});
							this.addEntrypoint(module, {
								type: "http",
								label: `${method} ${path}`,
								controller: controller.name,
								handler: String(methodName),
								initializerKey,
								decoratorName: method,
								metadata: {
									method,
									path,
									schema: this.getRequestSchema(httpState.schema),
								},
							});
						}
					}
				}
			}
		}
	}

	private collectMessageSubscription(module: M, metadata: unknown): void {
		const message = getMessageRef(metadata);
		if (!message) return;

		const normalized = {
			serviceName: message.serviceName ?? this.options.getServiceName(),
			type: message.type,
		};
		const id = this.options.getOrCreateModule(module);
		const node = this.options.getModuleNode(id);
		if (!node) return;

		const key = `${normalized.serviceName}:${normalized.type}`;
		if (
			node.subscribedMessages.some(
				(existing) => `${existing.serviceName}:${existing.type}` === key,
			)
		) {
			return;
		}

		node.subscribedMessages.push(normalized);
	}

	private addRoute(module: M, route: ModuleGraphRoute): void {
		const id = this.options.getOrCreateModule(module);
		const node = this.options.getModuleNode(id);

		if (!node) return;

		const routeKey = this.getRouteKey(route);
		if (
			node.routes.some((existing) => this.getRouteKey(existing) === routeKey)
		) {
			return;
		}

		node.routes.push(route);
		if (!node.ownOperationIds.includes(route.operationId)) {
			node.ownOperationIds.push(route.operationId);
		}
	}

	private addEntrypoint(module: M, entrypoint: ModuleGraphEntrypoint): void {
		const id = this.options.getOrCreateModule(module);
		const node = this.options.getModuleNode(id);

		if (!node) return;

		const entrypointKey = this.getEntrypointKey(entrypoint);
		if (
			node.entrypoints.some(
				(existing) => this.getEntrypointKey(existing) === entrypointKey,
			)
		) {
			return;
		}

		node.entrypoints.push(entrypoint);
	}

	private getRouteKey(route: ModuleGraphRoute): string {
		return `${route.method}:${route.path}:${route.controller}:${route.handler}`;
	}

	private getEntrypointKey(entrypoint: ModuleGraphEntrypoint): string {
		return `${entrypoint.type}:${entrypoint.label}:${entrypoint.controller}:${entrypoint.handler}:${entrypoint.initializerKey}`;
	}

	private formatEntrypointLabel(type: string, metadata: unknown): string {
		const metadataName = getMetadataName(metadata);

		return metadataName ?? type;
	}

	private toJsonSafeValue(
		value: unknown,
		seen = new WeakSet<object>(),
	): unknown {
		if (typeof value === "function") {
			if (seen.has(value)) return "[Circular]";

			seen.add(value);

			const staticEntries = Object.entries(value).map(([key, item]) => [
				key,
				this.toJsonSafeValue(item, seen),
			]);

			return {
				name: value.name || "anonymous",
				...Object.fromEntries(staticEntries),
			};
		}

		if (!value || typeof value !== "object") {
			return value;
		}

		if (Array.isArray(value)) {
			if (seen.has(value)) return "[Circular]";

			seen.add(value);

			return value.map((item) => this.toJsonSafeValue(item, seen));
		}

		if (seen.has(value)) return "[Circular]";

		seen.add(value);

		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				this.toJsonSafeValue(item, seen),
			]),
		);
	}

	private getRequestSchema(schema: RouteSchema): ModuleGraphRoute["schema"] {
		const requestSchema = {
			...(schema.body ? { body: schema.body } : {}),
			...(schema.headers ? { headers: schema.headers } : {}),
			...(schema.params ? { params: schema.params } : {}),
			...(schema.querystring ? { querystring: schema.querystring } : {}),
		};

		return Object.keys(requestSchema).length > 0 ? requestSchema : undefined;
	}
}

function getMessageRef(
	metadata: unknown,
): { serviceName?: string; type: string } | null {
	if (!metadata || typeof metadata !== "object") return null;

	const message = (metadata as { message?: unknown }).message;
	if (!message || typeof message !== "object") return null;

	const candidate = message as { serviceName?: unknown; type?: unknown };
	if (
		typeof candidate.type !== "string" ||
		(candidate.serviceName !== undefined &&
			typeof candidate.serviceName !== "string")
	) {
		return null;
	}

	return candidate as { serviceName?: string; type: string };
}

function getEntrypointType(description: string | undefined): string {
	return description?.replace(/^DecoratorState:/, "") || "decorator";
}

function getMetadataName(metadata: unknown): string | null {
	if (typeof metadata === "function") {
		return metadata.name || null;
	}

	if (!metadata || typeof metadata !== "object") {
		return null;
	}

	const value = metadata as {
		name?: unknown;
		queueName?: unknown;
		routingKey?: unknown;
	};

	if (typeof value.name === "string") return value.name;
	if (typeof value.queueName === "string") return value.queueName;
	if (typeof value.routingKey === "string") return value.routingKey;

	return null;
}
