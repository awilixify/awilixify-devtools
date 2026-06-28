import type { Edge, Node } from "@xyflow/react";
import type { LifetimeType } from "awilix";
import type {
	ModuleGraphGlobalProviderGroup,
	ModuleGraphNode,
	ModuleProviderImpact,
} from "@/api/model";

export type ModuleNodeData = ModuleGraphNode & {
	// Registration key -> class name (class providers) / serialized value (value
	// providers). Not in the generated ModuleGraphNode yet (pending generate:api).
	providerClassNames: Record<string, string>;
	providerValues: Record<string, string>;
	globalProviderGroups: ModuleGraphGlobalProviderGroup[];
	globalProviderGroupsDetailed: ModuleProviderGroup[];
	importedProviderGroups: ModuleProviderGroup[];
	moduleStats: ModuleStats;
	// The module's own interceptors/initializers/middlewares, shown in its
	// own-providers group so local members and exports have visible anchors.
	ownMembers: ModuleProviderGroupMember[];
	isSelectedModule: boolean;
	lifetimeTypeByName: Record<string, LifetimeType>;
	providerFocus: ProviderFocusState | null;
	providerRelationColor?: string;
	[key: string]: unknown;
};

export type ModuleFlowNode = Node<ModuleNodeData, "module">;

export type ModuleStatCount = {
	available: number;
	global: number;
	imported: number;
	own: number;
};

export type ModuleStats = {
	imports: ModuleStatCount;
	initializers: ModuleStatCount;
	interceptors: ModuleStatCount;
	middlewares: ModuleStatCount;
};

export type GraphViewMode = "dependencies" | "providers";

export type ProviderFocusState = {
	dependencies: string[];
	dependants: string[];
	occurrenceId: string;
	provider: string;
};

export type ProviderFocusHighlight = "dependencies" | "dependants";

export type ModuleProviderGroupMemberKind =
	| "middleware"
	| "interceptor"
	| "initializer";

// A non-provider member (interceptor/initializer/middleware) a module
// can be imported for, even when it exports no providers.
export type ModuleProviderGroupMember = {
	name: string; // registration key
	className: string;
	exported: boolean;
	middlewareTypes?: ("command" | "query")[];
	// Decorators applied in this context (the own module, or the importer) —
	// rendered "active". A subset of availableDecorators.
	usedDecorators: string[];
	// The full catalog of decorators bound to this member's class (static
	// analysis) — the ones not in usedDecorators render greyed.
	availableDecorators: string[];
	kind: ModuleProviderGroupMemberKind;
};

export type ModuleProviderGroup = {
	color?: string;
	exports: string[];
	moduleId: string;
	moduleName: string;
	providerAllowCircular: Record<string, boolean>;
	providerDependencies: Record<string, string[]>;
	providerEager: Record<string, boolean>;
	providerInitAfter: Record<string, string[]>;
	// false for value/factory providers, which the playground can't invoke.
	providerIsClass: Record<string, boolean>;
	// true for factory ({ useFactory }) providers, so the tooltip can mark them.
	providerIsFactory: Record<string, boolean>;
	// Registration key -> class name (class providers) / serialized value (value
	// providers), shown in the provider tooltip.
	providerClassNames: Record<string, string>;
	providerValues: Record<string, string>;
	lifetimeTypeByName: Record<string, LifetimeType>;
	lifetimeTypes: Record<string, LifetimeType>;
	providers: string[];
	members: ModuleProviderGroupMember[];
	impact: ModuleProviderImpact;
};

export type ProviderImpactStatus = "affected" | "changed" | "new" | "deleted";

export type ProviderImpactStatusByName = Record<string, ProviderImpactStatus>;

export type ModuleEdgeRole =
	| "dependency"
	| "dependent"
	| "cycle"
	| "global"
	| "default";

export type ModuleFlowEdge = Edge<{
	color?: string;
	type: "imports" | "global";
	path?: string;
	role: ModuleEdgeRole;
}>;

export type ProviderFocusInput = {
	occurrenceId: string;
	provider: string;
} | null;
