import type { Constructor, LifetimeType } from "awilix";
import {
	hasInitAfter,
	hasUseClass,
	isCostructorProvider,
	isEagerProvider,
	isFactoryProvider,
	type InternalModuleLike as M,
} from "awilixify/devtools";
import type { ModuleGraphNode } from "./types.js";

type ModuleGraphProviderMetadata = Pick<
	ModuleGraphNode,
	| "lifetimeTypes"
	| "providerAllowCircular"
	| "providerClassNames"
	| "providerDependencies"
	| "providerEager"
	| "providerInitAfter"
	| "providerIsClass"
	| "providerIsFactory"
	| "providerValues"
	| "providers"
>;

export class ModuleGraphProviderCollector {
	collectProviders(module: M): ModuleGraphProviderMetadata {
		const providers = module.providers ?? {};

		return {
			providers: Object.keys(providers),
			providerAllowCircular: this.getProviderAllowCircular(providers),
			providerIsClass: this.getProviderIsClass(providers),
			providerIsFactory: this.getProviderIsFactory(providers),
			providerClassNames: this.getProviderClassNames(providers),
			providerValues: this.getProviderValues(providers),
			providerDependencies: this.getProviderDependencies(providers),
			providerEager: this.getProviderEager(providers),
			providerInitAfter: this.getProviderInitAfter(providers),
			lifetimeTypes: this.getLifetimeTypes(
				providers,
				module.providerOptions?.lifetime,
			),
		};
	}

	private getProviderAllowCircular(
		providers: NonNullable<M["providers"]>,
	): Record<string, boolean> {
		return Object.fromEntries(
			Object.entries(providers).map(([providerName, provider]) => [
				providerName,
				(provider as { allowCircular?: boolean })?.allowCircular === true,
			]),
		);
	}

	// Value/factory providers have no invocable prototype methods; consumers
	// like the playground use this to offer only class-backed providers.
	private getProviderIsClass(
		providers: NonNullable<M["providers"]>,
	): Record<string, boolean> {
		return Object.fromEntries(
			Object.entries(providers).map(([providerName, provider]) => [
				providerName,
				isCostructorProvider(provider) || hasUseClass(provider),
			]),
		);
	}

	// Factory providers ({ useFactory }) have neither a class name nor a static
	// value, so the tooltip marks them explicitly rather than showing nothing.
	private getProviderIsFactory(
		providers: NonNullable<M["providers"]>,
	): Record<string, boolean> {
		return Object.fromEntries(
			Object.entries(providers).map(([providerName, provider]) => [
				providerName,
				isFactoryProvider(provider),
			]),
		);
	}

	// Registration key -> implementation class name, for class-backed providers
	// (bare constructor or { useClass }). Value/factory providers are omitted.
	private getProviderClassNames(
		providers: NonNullable<M["providers"]>,
	): Record<string, string> {
		const result: Record<string, string> = {};

		for (const [name, provider] of Object.entries(providers)) {
			if (isCostructorProvider(provider)) {
				result[name] = provider.name;
			} else if (hasUseClass(provider)) {
				result[name] = provider.useClass.name;
			}
		}

		return result;
	}

	// Registration key -> serialized value, for value providers only (primitives,
	// plain objects, arrays). Class/factory/function providers are omitted since
	// they have no static value to show.
	private getProviderValues(
		providers: NonNullable<M["providers"]>,
	): Record<string, string> {
		const result: Record<string, string> = {};

		for (const [name, provider] of Object.entries(providers)) {
			const value = this.extractProviderValue(provider);
			if (value !== undefined) result[name] = value;
		}

		return result;
	}

	private extractProviderValue(provider: unknown): string | undefined {
		switch (typeof provider) {
			case "string":
			case "number":
			case "boolean":
			case "bigint":
			case "symbol":
				return formatValueLiteral(provider);
			case "object": {
				if (provider === null) return "null";
				// Exclude class/factory config objects and forward refs — not values.
				if (
					hasUseClass(provider) ||
					"useFactory" in provider ||
					"__forward_ref__" in provider
				) {
					return undefined;
				}
				return formatValueLiteral(provider);
			}
			default:
				// Bare functions/constructors are class providers, surfaced via
				// providerClassNames — not values.
				return undefined;
		}
	}

	private getProviderEager(
		providers: NonNullable<M["providers"]>,
	): Record<string, boolean> {
		return Object.fromEntries(
			Object.entries(providers).map(([providerName, provider]) => [
				providerName,
				isEagerProvider(provider),
			]),
		);
	}

	private getProviderInitAfter(
		providers: NonNullable<M["providers"]>,
	): Record<string, string[]> {
		return Object.fromEntries(
			Object.entries(providers).map(([providerName, provider]) => [
				providerName,
				hasInitAfter(provider) ? [...provider.initAfter] : [],
			]),
		);
	}

	private getLifetimeTypes(
		providers: NonNullable<M["providers"]>,
		moduleLifetime?: LifetimeType,
	): Record<string, LifetimeType> {
		return Object.fromEntries(
			Object.entries(providers).map(([providerName, provider]) => [
				providerName,
				(provider as { lifetime?: LifetimeType })?.lifetime ??
					moduleLifetime ??
					"SINGLETON",
			]),
		);
	}

	private getProviderDependencies(
		providers: NonNullable<M["providers"]>,
	): Record<string, string[]> {
		return Object.fromEntries(
			Object.entries(providers).map(([providerName, provider]) => [
				providerName,
				this.getProviderDependencyNames(provider),
			]),
		);
	}

	private getProviderDependencyNames(provider: unknown): string[] {
		const inject = (provider as { inject?: unknown })?.inject;

		if (Array.isArray(inject)) return inject;

		const useClass = isCostructorProvider(provider)
			? provider
			: hasUseClass(provider)
				? provider.useClass
				: null;

		return useClass ? this.getConstructorParamNames(useClass) : [];
	}

	private getConstructorParamNames(useClass: Constructor<object>): string[] {
		// Use the intrinsic function source, not a possibly overridden toString().
		const source = Function.prototype.toString.call(useClass);
		const match = source.match(/constructor\s*\(([^)]*)\)/);
		const params = match?.[1];

		if (!params) return [];

		return this.splitParams(params).flatMap((param) => {
			const name = this.getParamName(param);

			return name ? [name] : [];
		});
	}

	private splitParams(params: string): string[] {
		const result: string[] = [];
		let depth = 0;
		let current = "";

		for (const char of params) {
			if (char === "," && depth === 0) {
				result.push(current);
				current = "";
				continue;
			}

			// Ignore commas inside destructuring, tuple/object types, or defaults.
			if ("([{<".includes(char)) depth += 1;
			if (")]}>".includes(char)) depth = Math.max(0, depth - 1);
			current += char;
		}

		if (current.trim()) result.push(current);

		return result;
	}

	private getParamName(param: string): string | null {
		// Strip TS parameter syntax down to the runtime identifier name.
		const signatureName = param
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/.*$/g, "")
			.replace(/\s+/g, " ")
			.trim()
			.replace(/^(public|private|protected|readonly|override)\s+/g, "")
			.replace(/^(public|private|protected|readonly|override)\s+/g, "")
			.replace(/^\.\.\./, "")
			.split("=")[0]
			?.split(":")[0]
			?.trim();

		if (!signatureName || /^[{[]/.test(signatureName)) return null;

		return signatureName.match(/^[A-Za-z_$][\w$]*/)?.[0] ?? null;
	}
}

// Render a value provider as a TS-style literal for a syntax-highlighted,
// read-only preview: strings quoted, class/function entries shown as their bare
// identifier name (so `{ CatsViewedQueueJob: CatsViewedQueueJob }` instead of
// `{"CatsViewedQueueJob":"[Function]"}`), objects/arrays pretty-printed. Not
// runtime-valid code — class refs are names only. No truncation by design.
function formatValueLiteral(value: unknown): string {
	const seen = new WeakSet<object>();

	function fmt(val: unknown, indent: string): string {
		switch (typeof val) {
			case "string":
				return `'${val.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
			case "number":
			case "boolean":
				return String(val);
			case "bigint":
				return `${val}n`;
			case "symbol":
				return val.toString();
			case "undefined":
				return "undefined";
			case "function":
				// A class/function used as a value — its bare identifier reads and
				// highlights like a real reference.
				return val.name || "(anonymous)";
			case "object": {
				if (val === null) return "null";
				if (seen.has(val)) return "[Circular]";
				seen.add(val);

				const inner = `${indent}  `;
				if (Array.isArray(val)) {
					if (val.length === 0) return "[]";
					const items = val.map((item) => `${inner}${fmt(item, inner)}`);
					return `[\n${items.join(",\n")}\n${indent}]`;
				}

				// Class instances passed as value providers (e.g. a Kysely or
				// ToadScheduler built outside the module) usually expose no enumerable
				// own props — show the constructor name so `{}` becomes `Kysely {}`.
				const ctor = (val as { constructor?: unknown }).constructor;
				const className =
					typeof ctor === "function" && ctor !== Object && ctor.name
						? `${ctor.name} `
						: "";

				const entries = Object.entries(val as Record<string, unknown>);
				if (entries.length === 0) return `${className}{}`;
				const props = entries.map(([key, item]) => {
					const label = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`;
					return `${inner}${label}: ${fmt(item, inner)}`;
				});
				return `${className}{\n${props.join(",\n")}\n${indent}}`;
			}
			default:
				return String(val);
		}
	}

	try {
		return fmt(value, "");
	} catch {
		return String(value);
	}
}
