import type { CommandContract, Handler } from "awilixify";
import type { Deps } from "../devtools.module.js";
import type {
	InvokeProviderBody as Payload,
	InvokeProviderResponse as Response,
} from "../dtos/index.js";

type ProviderInstance = object | ((...args: unknown[]) => unknown);
type ConsoleEntry = Response["console"][number];

export class InvokeProviderCommandHandler
	implements Handler<InvokeProviderCommandHandler["contract"]>
{
	static readonly key = "devtools/invoke-provider";
	declare readonly contract: CommandContract<
		typeof InvokeProviderCommandHandler.key,
		Payload,
		Response
	>;

	constructor(
		private readonly graphCollector: Deps["graphCollector"],
		private readonly tracer: Deps["tracer"],
	) {}

	async executor(payload: Payload): Promise<Response> {
		const consoleEntries: ConsoleEntry[] = [];
		const restoreConsole = this.captureConsole(consoleEntries);
		let traceId: string | undefined;
		let response: Omit<Response, "traceId">;

		try {
			const provider = this.resolveProvider(
				payload.scopeModuleId,
				payload.providerKey,
			);
			const className = this.getProviderClassName(provider);
			const moduleName =
				this.graphCollector.getModule(payload.scopeModuleId)?.name ??
				payload.scopeModuleId;
			const traceUrl = `${moduleName}.${className}.${payload.methodName}`;

			const result = await this.tracer.runInControllerTrace({
				moduleName,
				className,
				registrationKey: payload.providerKey,
				methodName: payload.methodName,
				args: [
					{
						method: payload.traceMethod,
						url: traceUrl,
						routeOptions: { url: traceUrl },
						body: {
							args: payload.args,
							methodName: payload.methodName,
							providerKey: payload.providerKey,
							scopeModuleId: payload.scopeModuleId,
						},
					},
				],
				onTraceCreated: (createdTraceId: string) => {
					traceId = createdTraceId;
				},
				callback: () =>
					this.resolveMethod(provider, payload.methodName).apply(
						provider,
						payload.args,
					),
			});
			response = {
				ok: true,
				result: this.toJsonSafeValue(result),
				console: consoleEntries,
			};
		} catch (error) {
			response = {
				ok: false,
				invokeError: this.serializeError(error),
				console: consoleEntries,
			};
		} finally {
			restoreConsole();
		}

		if (!traceId) {
			throw new Error(
				"Provider invocation completed without creating a trace.",
			);
		}

		return {
			...response,
			traceId,
		};
	}

	private getProviderClassName(provider: ProviderInstance): string {
		if (typeof provider === "function") return provider.name || "anonymous";

		return provider.constructor?.name || "anonymous";
	}

	private resolveProvider(
		scopeModuleId: string,
		providerKey: string,
	): ProviderInstance {
		const scope = this.graphCollector.getModuleScope(scopeModuleId);

		if (!scope) {
			throw new Error(`Module scope "${scopeModuleId}" was not found.`);
		}

		const registrationKey = scope.registrations[providerKey]
			? providerKey
			: (this.findHandlerRegistrationSymbol(scope, providerKey) ??
				this.findControllerRegistrationSymbol(scope, providerKey));

		if (!registrationKey) {
			throw new Error(
				`Provider "${providerKey}" is not available in module scope "${scopeModuleId}".`,
			);
		}

		const provider = scope.resolve(registrationKey);

		if (
			provider === null ||
			(typeof provider !== "object" && typeof provider !== "function")
		) {
			throw new Error(
				`Provider "${providerKey}" in module scope "${scopeModuleId}" is not a class instance.`,
			);
		}

		return provider;
	}

	// Query/command handlers are registered under Symbol("<key>_<ClassName>")
	// rather than their class name, so class-name lookups scan symbol
	// registrations by description suffix.
	private findHandlerRegistrationSymbol(
		scope: NonNullable<ReturnType<Deps["graphCollector"]["getModuleScope"]>>,
		providerKey: string,
	): symbol | null {
		return (
			Object.getOwnPropertySymbols(scope.registrations).find((symbol) =>
				symbol.description?.endsWith(`_${providerKey}`),
			) ?? null
		);
	}

	private findControllerRegistrationSymbol(
		scope: NonNullable<ReturnType<Deps["graphCollector"]["getModuleScope"]>>,
		providerKey: string,
	): symbol | null {
		return (
			Object.getOwnPropertySymbols(scope.registrations).find(
				(symbol) => symbol.description === `controller_${providerKey}`,
			) ?? null
		);
	}

	private resolveMethod(
		provider: unknown,
		methodName: string,
	): (...args: unknown[]) => unknown {
		if (!methodName) {
			throw new Error("Method name is required.");
		}

		if (
			provider === null ||
			(typeof provider !== "object" && typeof provider !== "function")
		) {
			throw new Error(`Cannot resolve method "${methodName}".`);
		}

		const value = (provider as Record<string, unknown>)[methodName];

		if (typeof value !== "function") {
			throw new Error(`"${methodName}" is not a function.`);
		}

		return value as (...args: unknown[]) => unknown;
	}

	private captureConsole(entries: ConsoleEntry[]): () => void {
		const original = {
			log: console.log,
			info: console.info,
			warn: console.warn,
			error: console.error,
		};

		const wrap =
			(level: ConsoleEntry["level"]) =>
			(...args: unknown[]) => {
				entries.push({
					level,
					args: args.map((arg) => this.toJsonSafeValue(arg)),
				});
				original[level](...args);
			};

		console.log = wrap("log");
		console.info = wrap("info");
		console.warn = wrap("warn");
		console.error = wrap("error");

		return () => {
			console.log = original.log;
			console.info = original.info;
			console.warn = original.warn;
			console.error = original.error;
		};
	}

	private serializeError(error: unknown): Response["invokeError"] {
		if (error instanceof Error) {
			return {
				name: error.name,
				message: error.message,
				...(error.stack ? { stack: error.stack } : {}),
			};
		}

		return {
			name: "Error",
			message: String(error),
		};
	}

	private toJsonSafeValue(value: unknown): unknown {
		if (value === undefined) return undefined;

		const seen = new WeakSet<object>();
		const serialized = JSON.stringify(value, (_key, item) => {
			if (typeof item === "bigint") return item.toString();
			if (typeof item === "function") {
				return `[Function ${item.name || "anonymous"}]`;
			}
			if (typeof item === "symbol") return item.toString();
			if (item instanceof Error) return this.serializeError(item);
			if (item && typeof item === "object") {
				if (seen.has(item)) return "[Circular]";
				seen.add(item);
			}

			return item;
		});

		return serialized === undefined ? undefined : JSON.parse(serialized);
	}
}
