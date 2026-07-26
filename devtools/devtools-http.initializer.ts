import { Initializer, type InitializerContext, isResultLike } from "awilixify";
import {
	HTTP_DECORATOR_STATE_TOKEN,
	type RouteSchema,
	rollUpHttpDecoratorState,
} from "awilixify/http";
import type { FastifyReply, FastifyRequest } from "fastify";
import { DEVTOOLS_API_PATH } from "./devtools.constants.js";
import type { Deps } from "./devtools.module.js";

type HttpToken = typeof HTTP_DECORATOR_STATE_TOKEN;

export class DevtoolsHttpInitializer extends Initializer<HttpToken> {
	readonly token = HTTP_DECORATOR_STATE_TOKEN;
	private readonly registeredMethods = new Set<string>();
	private readonly registeredSchemas = new Set<string>();

	constructor(private readonly fastify: Deps["fastify"]) {
		super();
	}

	initialize(context: InitializerContext<HttpToken>): void {
		const methodKey = `${context.target.name}:${String(context.methodName)}`;

		if (this.registeredMethods.has(methodKey)) return;

		this.registeredMethods.add(methodKey);

		const methodState = rollUpHttpDecoratorState(
			context.decoratorState.root,
			context.metadata,
		);

		for (const verb of methodState.verbs) {
			for (const path of methodState.paths) {
				this.fastify.route({
					method: verb,
					url: this.withDevtoolsPath(path),
					handler: (request, reply) =>
						this.handleRequest(context, request, reply),
					preHandler: methodState.beforeMiddleware,
					schema: this.buildRouteSchema(
						methodState.schema,
						String(context.methodName),
					),
				});
			}
		}
	}

	private buildRouteSchema(
		schema: RouteSchema,
		operationId: string,
	): RouteSchema & { operationId: string } {
		const result = { ...schema, operationId };

		// Register and replace params with $ref
		if (this.hasSchemaId(schema.params)) {
			this.registerSchema(schema.params);
			result.params = { $ref: `${(schema.params as { $id: string }).$id}#` };
		}

		// Register and replace querystring with $ref
		if (this.hasSchemaId(schema.querystring)) {
			this.registerSchema(schema.querystring);
			result.querystring = {
				$ref: `${(schema.querystring as { $id: string }).$id}#`,
			};
		}

		// Register and replace body with $ref
		if (this.hasSchemaId(schema.body)) {
			this.registerSchema(schema.body);
			result.body = { $ref: `${(schema.body as { $id: string }).$id}#` };
		}

		// Register and replace response schemas with $ref
		if (schema.response && typeof schema.response === "object") {
			const response = schema.response as Record<string, unknown>;
			const newResponse: Record<string, unknown> = {};

			for (const [code, responseSchema] of Object.entries(response)) {
				if (this.hasSchemaId(responseSchema)) {
					this.registerSchema(responseSchema);
					newResponse[code] = {
						$ref: `${(responseSchema as { $id: string }).$id}#`,
					};
				} else {
					newResponse[code] = responseSchema;
				}
			}

			result.response = newResponse;
		}

		return result;
	}

	private hasSchemaId(schema: unknown): schema is { $id: string } {
		return (
			schema !== null &&
			typeof schema === "object" &&
			"$id" in schema &&
			typeof (schema as { $id: unknown }).$id === "string"
		);
	}

	private registerSchema(schema: unknown): void {
		if (!this.hasSchemaId(schema)) return;

		if (this.registeredSchemas.has(schema.$id)) return;

		// First, recursively register and replace nested schemas with $ref
		const processedSchema = this.processNestedSchemas(schema);

		this.registeredSchemas.add(schema.$id);
		this.fastify.addSchema(processedSchema);
	}

	private processNestedSchemas(obj: unknown): unknown {
		if (!obj || typeof obj !== "object") return obj;

		if (Array.isArray(obj)) {
			return obj.map((item) => this.processNestedSchemas(item));
		}

		const record = obj as Record<string, unknown>;
		const result: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(record)) {
			// Skip the $id of the current schema
			if (key === "$id") {
				result[key] = value;
				continue;
			}

			// If this nested value has $id, register it and replace with $ref
			if (this.hasSchemaId(value)) {
				this.registerSchema(value);
				result[key] = { $ref: `${value.$id}#` };
			} else {
				result[key] = this.processNestedSchemas(value);
			}
		}

		return result;
	}

	private async handleRequest(
		context: InitializerContext<HttpToken>,
		request: FastifyRequest,
		reply: FastifyReply,
	): Promise<unknown> {
		const result = await context.invoke(request, reply);

		if (reply.sent || result === undefined) return;

		if (isResultLike(result)) {
			return result.ok
				? reply.status(200).send(result.value)
				: reply.status(500).send(result.error);
		}

		return result;
	}

	private withDevtoolsPath(routePath: string): string {
		return `${DEVTOOLS_API_PATH}/${routePath.replace(/^\//, "")}`;
	}
}
