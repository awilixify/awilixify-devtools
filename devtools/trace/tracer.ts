import path from "node:path";
import * as Awilix from "awilix";
import type {
	Tracer as ITracer,
	RecordSpanInput,
	WrapResolverInput,
} from "awilixify/devtools";
import { isPromiseLike } from "awilixify/devtools";
import type { Deps } from "../devtools.module.js";
import {
	DevtoolsTraceStore,
	type TraceCreationListenerInput,
} from "./store.js";

const DEFAULT_TRACE_HISTORY_FILE = ".awilixify-devtools/traces.json";

export class Tracer implements ITracer {
	private readonly traceStore: DevtoolsTraceStore;

	constructor(options: Deps["options"]) {
		this.traceStore = new DevtoolsTraceStore(
			resolveTraceHistoryFile(options.traceHistoryFile),
		);
	}

	getTraces() {
		return this.traceStore.getTraces();
	}

	getTrace(traceId: string) {
		return this.traceStore.getTrace(traceId);
	}

	clearTraces() {
		this.traceStore.clearTraces();
	}

	deleteTrace(traceId: string) {
		return this.traceStore.deleteTrace(traceId);
	}

	recordSpan<T>(input: RecordSpanInput<T>): T | Promise<T> {
		return this.traceStore.recordSpan(input);
	}

	runInCurrentSpan<T>(callback: () => T | Promise<T>): T | Promise<T> {
		return this.traceStore.runInCurrentSpan(callback);
	}

	runInControllerTrace<T>(
		input: TraceCreationListenerInput<T>,
	): T | Promise<T> {
		return this.traceStore.runInControllerTrace(input);
	}

	wrapResolver(input: WrapResolverInput): ReturnType<ITracer["wrapResolver"]> {
		if (input.module.name === "DevtoolsModule") {
			return input.resolver;
		}

		return Awilix.createBuildResolver({
			...input.options,
			resolve: (container) =>
				this.createTracedInstance({
					...input,
					instance: input.resolver.resolve(container),
				}),
		});
	}

	private createTracedInstance<T>({
		className,
		instance,
		isFactory = false,
		kind,
		module,
		moduleId,
		registrationKey,
	}: WrapResolverInput & {
		instance: T;
	}): T {
		if (!instance || typeof instance !== "object") {
			return instance;
		}

		// Cache wrappers so repeated property access keeps method identity stable.
		// Some methods must skip the proxy receiver because they access JS private fields.
		const targetBoundMethods = new Set<PropertyKey>();
		const wrappers = new Map<PropertyKey, (...args: unknown[]) => unknown>();

		return new Proxy(instance, {
			get: (target, propertyKey, proxyReceiver) => {
				const value = Reflect.get(target, propertyKey, proxyReceiver);

				if (typeof value !== "function") return value;
				if (propertyKey === "constructor") return value;
				if (isConstructor(value)) return value;

				if (kind === "prehandler" && propertyKey === "execute") {
					return (...args: unknown[]) => {
						try {
							const result = value.apply(proxyReceiver, args);

							if (isPromiseLike(result)) {
								return result.catch((error: unknown) => {
									if (!isPrivateMemberAccessError(error)) throw error;

									return value.apply(target, args);
								});
							}

							return result;
						} catch (error) {
							if (!isPrivateMemberAccessError(error)) throw error;

							return value.apply(target, args);
						}
					};
				}

				const existing = wrappers.get(propertyKey);
				if (existing) return existing;

				const methodName = String(propertyKey);
				const wrapped = (...args: unknown[]) =>
					this.traceStore.recordSpan({
						kind,
						moduleId,
						moduleName: module.name,
						className,
						registrationKey,
						methodName,
						args,
						callback: () => {
							if (targetBoundMethods.has(propertyKey)) {
								return value.apply(target, args);
							}

							try {
								const result = value.apply(
									isFactory ? target : proxyReceiver,
									args,
								);

								if (isPromiseLike(result)) {
									return result.catch((error: unknown) => {
										if (!isPrivateMemberAccessError(error)) throw error;

										// Proxy receivers are useful because `this.otherMethod()`
										// stays traceable, but JS private fields are branded to the
										// real instance. If a method touches `#field`/`#method`, the
										// proxy receiver throws, so retry it with the original target.
										targetBoundMethods.add(propertyKey);
										return value.apply(target, args);
									});
								}

								return result;
							} catch (error) {
								if (!isPrivateMemberAccessError(error)) throw error;

								// Proxy receivers are useful because `this.otherMethod()`
								// stays traceable, but JS private fields are branded to the
								// real instance. If a method touches `#field`/`#method`, the
								// proxy receiver throws, so retry it with the original target.
								targetBoundMethods.add(propertyKey);
								return value.apply(target, args);
							}
						},
					});

				wrappers.set(propertyKey, wrapped);

				return wrapped;
			},
		});
	}
}

function resolveTraceHistoryFile(
	traceHistoryFile: string | false | undefined,
): string | null {
	if (traceHistoryFile === false) return null;

	return path.resolve(traceHistoryFile ?? DEFAULT_TRACE_HISTORY_FILE);
}

function isConstructor(value: { prototype?: unknown }): boolean {
	return Boolean(value.prototype && value.prototype.constructor === value);
}

function isPrivateMemberAccessError(error: unknown): boolean {
	return (
		error instanceof TypeError &&
		/Cannot (read|access) private (member|method)/.test(error.message)
	);
}
