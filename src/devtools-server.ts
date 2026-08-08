import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { DEVTOOLS_API_PATH } from "./devtools.constants.js";
import type { Deps } from "./devtools.module.js";

export class DevtoolsServer {
	constructor(
		private readonly fastify: Deps["fastify"],
		private readonly options: Deps["options"],
		private readonly tracer: Deps["tracer"],
	) {}

	async init(): Promise<void> {
		await this.fastify.register(fastifyCors, {
			methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		});
		await this.registerSwagger();
		this.registerTraceStream();

		this.fastify.setSerializerCompiler(() => {
			return (data) => JSON.stringify(data);
		});
	}

	// Server-Sent Events stream of finished traces so the UI receives new (and
	// async downstream) traces the moment they are recorded, without polling.
	private registerTraceStream(): void {
		this.fastify.get(
			`${DEVTOOLS_API_PATH}/traces/stream`,
			(_request, reply) => {
				// Take over the socket; Fastify will not serialize/close the reply.
				reply.hijack();
				const raw = reply.raw;

				raw.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache, no-transform",
					Connection: "keep-alive",
					// Ask intermediaries (e.g. nginx) not to buffer the stream.
					"X-Accel-Buffering": "no",
				});
				// Tell EventSource how long to wait before reconnecting.
				raw.write("retry: 3000\n\n");

				const unsubscribe = this.tracer.subscribe((trace) => {
					raw.write(`data: ${JSON.stringify(trace)}\n\n`);
				});
				// Comment lines keep the connection alive through idle proxies.
				const heartbeat = setInterval(() => {
					raw.write(": ping\n\n");
				}, 15_000);

				const close = () => {
					clearInterval(heartbeat);
					unsubscribe();
				};
				raw.on("close", close);
			},
		);
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
		const port = this.options.port ?? 3221;

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
