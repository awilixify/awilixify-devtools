import type {
	GetGraphResponse,
	LifetimeType,
	ModuleGraphGlobalProviderGroup,
	ModuleGraphNode,
} from "@/api/model";
import type { ModuleProviderGroup } from "../types";

type LifetimeTypeRecord = Record<string, LifetimeType>;

const GLOBAL_PROVIDER_GROUP_COLOR = "var(--mantine-color-grape-6)";

// A curated palette of well-separated, saturated hues for per-module provider
// grouping (used identically for the group tint/border and its dependency arrow).
// Fixed set instead of a hashed hue so colors stay distinct and never fall in the
// teal/green band of the selected-module highlight — a group must never blend
// into the current selection.
// Muted, deeper tones (lower saturation / lightness than vivid hues): easier on
// the eyes as solid fills while still dark enough for white text.
const PROVIDER_GROUP_COLORS = [
	"hsl(214 48% 47%)", // blue
	"hsl(255 34% 54%)", // indigo
	"hsl(322 34% 48%)", // magenta
	"hsl(344 42% 50%)", // rose
	"hsl(6 46% 52%)", // red
	"hsl(24 48% 46%)", // orange
	"hsl(38 52% 41%)", // amber
	"hsl(200 44% 42%)", // sky
	"hsl(236 32% 54%)", // blue-violet
];

// Assigns each of the selected module's direct dependencies a palette color by
// its position (not a hash), so adjacent dependency groups never share a color
// until the palette actually wraps. Keyed by dependency module id — the same
// color is reused for that dependency's imported group in the selected module,
// its own providers group, and the arrow between them.
export function getProviderGroupColorByModuleId(
	edges: GetGraphResponse["edges"],
	selectedModuleId: string | null | undefined,
): Record<string, string> {
	const byModuleId: Record<string, string> = {};
	if (!selectedModuleId) return byModuleId;

	let index = 0;
	for (const edge of edges) {
		if (edge.type !== "imports") continue;
		if (edge.from !== selectedModuleId) continue;
		if (byModuleId[edge.to]) continue;
		byModuleId[edge.to] =
			PROVIDER_GROUP_COLORS[index % PROVIDER_GROUP_COLORS.length];
		index += 1;
	}

	return byModuleId;
}

// The API now delivers global provider groups with the same provider metadata
// as a module node (dependencies, lifetimes, impact), so they render exactly
// like own/imported providers. This must come from the group itself: global
// modules are frequently filtered out of the returned module list, so there is
// no node to resolve the metadata from.
export function getGlobalProviderGroups(
	globalProviderGroups: ModuleGraphGlobalProviderGroup[],
	globalModules: ModuleGraphNode[],
	lifetimeTypeByName: Record<string, LifetimeType>,
	availableByClassName: Record<string, string[]>,
	usedByKey: Record<string, string[]>,
): ModuleProviderGroup[] {
	const globalGroupByModuleId = new Map(
		globalProviderGroups.map((group) => [group.moduleId, group]),
	);

	return globalModules
		.map((module) => {
			const group = globalGroupByModuleId.get(module.id);
			const members = module
				? getExportedMembers(module, (key, className) => ({
						used: usedByKey[key] ?? [],
						available: availableByClassName[className] ?? [],
					}))
				: [];

			return {
				color: GLOBAL_PROVIDER_GROUP_COLOR,
				exports: group?.exports ?? module.exports,
				moduleId: module.id,
				moduleName: module.name,
				providerAllowCircular:
					group?.providerAllowCircular ?? module.providerAllowCircular ?? {},
				providerDependencies:
					group?.providerDependencies ?? module.providerDependencies ?? {},
				providerEager: group?.providerEager ?? module.providerEager ?? {},
				providerInitAfter:
					group?.providerInitAfter ?? module.providerInitAfter ?? {},
				// The global module is in the graph now, so its provider kinds can be
				// looked up to gate invocation.
				providerIsClass: module.providerIsClass ?? {},
				providerIsFactory: module.providerIsFactory ?? {},
				providerClassNames:
					(module as MemberSourceModule).providerClassNames ?? {},
				providerValues: (module as MemberSourceModule).providerValues ?? {},
				lifetimeTypeByName,
				lifetimeTypes: (group?.lifetimeTypes ??
					module.lifetimeTypes ??
					{}) as LifetimeTypeRecord,
				providers:
					group?.providers ??
					module.providers.filter((provider) =>
						module.exports.includes(provider),
					),
				members,
				impact: group?.impact ?? module.impact,
			};
		})
		.filter((group) => group.providers.length > 0 || group.members.length > 0);
}

export function getImportedProviderGroups(
	moduleId: string,
	edges: GetGraphResponse["edges"],
	moduleById: Map<string, ModuleGraphNode>,
	lifetimeTypeByName: Record<string, LifetimeType>,
	selectedModuleId: string | null | undefined,
	// Decorators actually used in the importing module, keyed by member key —
	// rendered active; the rest of the catalog renders greyed.
	importerUsedByKey: Record<string, string[]>,
	// Full decorator catalog per class name (static analysis), so imported members
	// show the same used/available split as the owning module.
	availableByClassName: Record<string, string[]>,
	// Palette color per dependency module id (by index), shared with the arrow.
	colorByModuleId: Record<string, string>,
): ModuleProviderGroup[] {
	return edges
		.filter((edge) => edge.from === moduleId && edge.type === "imports")
		.flatMap((edge) => {
			const module = moduleById.get(edge.to);

			if (!module) return [];

			const providers = module.providers.filter((provider) =>
				module.exports.includes(provider),
			);
			const members = getExportedMembers(module, (key, className) => ({
				used: importerUsedByKey[key] ?? [],
				available: availableByClassName[className] ?? [],
			}));

			// A module can be imported purely for exported interceptors/
			// initializers/middlewares, so keep the group whenever it exports any
			// member — not just providers.
			if (providers.length === 0 && members.length === 0) return [];

			return [
				{
					color: isFocusedDependencyEdge(edge, selectedModuleId)
						? colorByModuleId[module.id]
						: undefined,
					exports: module.exports,
					moduleId: module.id,
					moduleName: module.name,
					providerAllowCircular: module.providerAllowCircular ?? {},
					providerDependencies: module.providerDependencies ?? {},
					providerEager: module.providerEager ?? {},
					providerInitAfter: module.providerInitAfter ?? {},
					providerIsClass: module.providerIsClass ?? {},
					providerIsFactory: module.providerIsFactory ?? {},
					providerClassNames:
						(module as MemberSourceModule).providerClassNames ?? {},
					providerValues: (module as MemberSourceModule).providerValues ?? {},
					lifetimeTypeByName,
					lifetimeTypes: (module.lifetimeTypes ?? {}) as LifetimeTypeRecord,
					providers,
					members,
					impact: module.impact,
				},
			];
		});
}

// Class names for interceptors/initializers/middlewares are carried by the graph
// payload but aren't all in the generated client type yet (pending
// `pnpm generate:api` in some places), so they're read through this cast.
type MemberSourceModule = ModuleGraphNode & {
	interceptorClassNames?: Record<string, string>;
	interceptorDecoratorNames?: Record<string, string[]>;
	initializerClassNames?: Record<string, string>;
	queryPreHandlerClassNames?: Record<string, string>;
	commandPreHandlerClassNames?: Record<string, string>;
	providerClassNames?: Record<string, string>;
	providerValues?: Record<string, string>;
};

// Decorators actually applied within a single module, keyed by member key —
// interceptors from the module's decorator-state usage, initializers from its
// entrypoints. Used to show what an *importing* module applies.
export function getUsedDecoratorsByKey(
	module: ModuleGraphNode,
): Record<string, string[]> {
	const byKey: Record<string, string[]> = {};
	const add = (key: string, name: string) => {
		if (!byKey[key]) byKey[key] = [];
		if (!byKey[key].includes(name)) byKey[key].push(name);
	};

	const source = module as MemberSourceModule;

	for (const [key, names] of Object.entries(
		source.interceptorDecoratorNames ?? {},
	)) {
		for (const name of names) add(key, name);
	}

	for (const entrypoint of module.entrypoints) {
		if (!entrypoint.initializerKey || !entrypoint.decoratorName) continue;
		add(entrypoint.initializerKey, entrypoint.decoratorName);
	}

	return byKey;
}

// Builds members for a group. `resolveDecorators` returns the used/available
// split for a member: for a module's own group `used` is what the module itself
// applies and `available` is the static catalog; for an imported group `used` is
// what the importer applies against the same catalog.
function getMembers(
	module: ModuleGraphNode,
	resolveDecorators: (
		key: string,
		className: string,
	) => { used: string[]; available: string[] },
	{
		commandPreHandlerNames,
		commandPreHandlerExports,
		initializerNames,
		initializerExports,
		interceptorNames,
		interceptorExports,
		queryPreHandlerNames,
		queryPreHandlerExports,
	}: {
		commandPreHandlerNames: string[];
		commandPreHandlerExports: string[];
		initializerNames: string[];
		initializerExports: string[];
		interceptorNames: string[];
		interceptorExports: string[];
		queryPreHandlerNames: string[];
		queryPreHandlerExports: string[];
	},
): ModuleProviderGroup["members"] {
	const source = module as MemberSourceModule;
	const exportedInterceptors = new Set(interceptorExports);
	const exportedInitializers = new Set(initializerExports);
	const exportedQueryPreHandlers = new Set(queryPreHandlerExports);
	const exportedCommandPreHandlers = new Set(commandPreHandlerExports);

	const resolve = (name: string, className: string) => {
		const { used, available } = resolveDecorators(name, className);
		return { usedDecorators: used, availableDecorators: available };
	};

	return [
		...interceptorNames.map((name) => {
			const className = source.interceptorClassNames?.[name] ?? name;
			return {
				name,
				kind: "interceptor" as const,
				className,
				exported: exportedInterceptors.has(name),
				...resolve(name, className),
			};
		}),
		...initializerNames.map((name) => {
			const className = source.initializerClassNames?.[name] ?? name;
			return {
				name,
				kind: "initializer" as const,
				className,
				exported: exportedInitializers.has(name),
				...resolve(name, className),
			};
		}),
		...getMiddlewareMemberSources({
			commandPreHandlerNames,
			exportedCommandPreHandlers,
			exportedQueryPreHandlers,
			queryPreHandlerNames,
			source,
		}).map(({ className, exported, name, middlewareTypes }) => ({
			name,
			kind: "middleware" as const,
			className,
			exported,
			middlewareTypes,
			usedDecorators: [],
			availableDecorators: [],
		})),
	];
}

export function getOwnMembers(
	module: ModuleGraphNode,
	resolveDecorators: (
		key: string,
		className: string,
	) => { used: string[]; available: string[] },
): ModuleProviderGroup["members"] {
	return getMembers(module, resolveDecorators, {
		commandPreHandlerNames: module.commandPreHandlers ?? [],
		commandPreHandlerExports: module.commandPreHandlerExports ?? [],
		initializerNames: module.initializers ?? [],
		initializerExports: module.initializerExports ?? [],
		interceptorNames: module.interceptors ?? [],
		interceptorExports: module.interceptorExports ?? [],
		queryPreHandlerNames: module.queryPreHandlers ?? [],
		queryPreHandlerExports: module.queryPreHandlerExports ?? [],
	});
}

export function getExportedMembers(
	module: ModuleGraphNode,
	resolveDecorators: (
		key: string,
		className: string,
	) => { used: string[]; available: string[] },
): ModuleProviderGroup["members"] {
	return getMembers(module, resolveDecorators, {
		commandPreHandlerNames: module.commandPreHandlerExports ?? [],
		commandPreHandlerExports: module.commandPreHandlerExports ?? [],
		initializerNames: module.initializerExports ?? [],
		initializerExports: module.initializerExports ?? [],
		interceptorNames: module.interceptorExports ?? [],
		interceptorExports: module.interceptorExports ?? [],
		queryPreHandlerNames: module.queryPreHandlerExports ?? [],
		queryPreHandlerExports: module.queryPreHandlerExports ?? [],
	});
}

function getMiddlewareMemberSources({
	commandPreHandlerNames,
	exportedCommandPreHandlers,
	exportedQueryPreHandlers,
	queryPreHandlerNames,
	source,
}: {
	commandPreHandlerNames: string[];
	exportedCommandPreHandlers: Set<string>;
	exportedQueryPreHandlers: Set<string>;
	queryPreHandlerNames: string[];
	source: MemberSourceModule;
}): {
	className: string;
	exported: boolean;
	middlewareTypes: ("command" | "query")[];
	name: string;
}[] {
	const byName = new Map<
		string,
		{
			className: string;
			exported: boolean;
			middlewareTypes: ("command" | "query")[];
		}
	>();

	for (const name of queryPreHandlerNames) {
		byName.set(name, {
			className: source.queryPreHandlerClassNames?.[name] ?? name,
			exported: exportedQueryPreHandlers.has(name),
			middlewareTypes: ["query"],
		});
	}

	for (const name of commandPreHandlerNames) {
		const existing = byName.get(name);
		if (existing) {
			existing.exported ||= exportedCommandPreHandlers.has(name);
			if (!existing.middlewareTypes.includes("command")) {
				existing.middlewareTypes.push("command");
			}
			continue;
		}
		byName.set(name, {
			className: source.commandPreHandlerClassNames?.[name] ?? name,
			exported: exportedCommandPreHandlers.has(name),
			middlewareTypes: ["command"],
		});
	}

	return [...byName].map(
		([name, { className, exported, middlewareTypes }]) => ({
			className,
			exported,
			middlewareTypes,
			name,
		}),
	);
}

export function getLifetimeTypeByName(
	modules: ModuleGraphNode[],
): LifetimeTypeRecord {
	const byName: LifetimeTypeRecord = {};

	for (const module of modules) {
		for (const [provider, lifetime] of Object.entries(
			module.lifetimeTypes ?? {},
		)) {
			byName[provider] = lifetime as LifetimeType;
		}
	}

	return byName;
}

export function isFocusedDependencyEdge(
	edge: GetGraphResponse["edges"][number],
	selectedModuleId: string | null | undefined,
): boolean {
	return Boolean(selectedModuleId && edge.from === selectedModuleId);
}
