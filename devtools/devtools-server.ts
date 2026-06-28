import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { Deps } from "./devtools.module.js";

export class DevtoolsServer {
	constructor(
		private readonly fastify: Deps["fastify"],
		private readonly options: Deps["options"],
	) {}

	async init(): Promise<void> {
		await this.fastify.register(fastifyCors, {
			methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		});
		await this.registerSwagger();

		this.fastify.setSerializerCompiler(() => {
			return (data) => JSON.stringify(data);
		});
	}

	private async registerSwagger(): Promise<void> {
		await this.fastify.register(fastifySwagger, {
			refResolver: {
				buildLocalReference(json, _, __, i) {
					return json.$id?.toString() || `def-${i}`;
				},
			},
			openapi: {
				info: {
					title: "Awilixify Devtools API",
					description:
						"API for inspecting module graphs, traces, and provider impact",
					version: "1.0.0",
				},
				tags: [
					{ name: "Graph", description: "Module graph endpoints" },
					{ name: "Traces", description: "Request tracing endpoints" },
					{ name: "Playground", description: "Provider playground endpoints" },
					{ name: "Impact", description: "Provider impact analysis endpoints" },
				],
			},
		});

		await this.fastify.register(fastifySwaggerUi, {
			routePrefix: "/api-docs",
		});
	}

	async postInit(): Promise<void> {
		this.registerAppProxy();

		const host = this.options.host ?? "127.0.0.1";
		const port = this.options.port ?? 3001;

		await this.fastify.listen({
			host,
			port,
		});

		this.fastify.log.info(
			`[awilixify-devtools] Devtools API server started at http://${host}:${port}`,
		);
	}

	async dispose(): Promise<void> {
		await this.fastify.close();
	}

	private registerAppProxy(): void {
		if (!this.options.appUrl) return;

		const appUrl = this.options.appUrl;

		// Use setNotFoundHandler to proxy unmatched routes to the real app
		this.fastify.setNotFoundHandler(async (request, reply) => {
			const targetUrl = new URL(request.url, appUrl);

			const response = await fetch(targetUrl.toString(), {
				method: request.method,
				headers: {
					...Object.fromEntries(
						Object.entries(request.headers).filter(
							([key]) => !["host", "connection"].includes(key.toLowerCase()),
						),
					),
					host: new URL(appUrl).host,
				},
				body:
					request.method !== "GET" && request.method !== "HEAD"
						? JSON.stringify(request.body)
						: undefined,
			});

			reply.status(response.status);

			for (const [key, value] of response.headers.entries()) {
				if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
					reply.header(key, value);
				}
			}

			const body = await response.text();
			return reply.send(body);
		});

		this.fastify.log.info(
			`[awilixify-devtools] Proxying trace requests to ${appUrl}`,
		);
	}
}
