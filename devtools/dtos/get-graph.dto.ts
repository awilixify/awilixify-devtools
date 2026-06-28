import { type Static, Type } from "@sinclair/typebox";

export const RouteSchemaSchema = Type.Object(
	{
		body: Type.Optional(Type.Any()),
		querystring: Type.Optional(Type.Any()),
		params: Type.Optional(Type.Any()),
		headers: Type.Optional(Type.Any()),
	},
	{ $id: "RouteSchema" },
);

export type RouteSchema = Static<typeof RouteSchemaSchema>;

export const ModuleGraphRouteSchema = Type.Object(
	{
		method: Type.String(),
		path: Type.String(),
		controller: Type.String(),
		handler: Type.String(),
		schema: Type.Optional(RouteSchemaSchema),
	},
	{ $id: "ModuleGraphRoute" },
);

export type ModuleGraphRoute = Static<typeof ModuleGraphRouteSchema>;

export const ModuleGraphEntrypointSchema = Type.Object(
	{
		type: Type.String(),
		label: Type.String(),
		controller: Type.String(),
		handler: Type.String(),
		initializerKey: Type.String(),
		decoratorName: Type.Optional(Type.String()),
		metadata: Type.Optional(Type.Any()),
	},
	{ $id: "ModuleGraphEntrypoint" },
);

export type ModuleGraphEntrypoint = Static<typeof ModuleGraphEntrypointSchema>;

const DynamicModuleInfoSchema = Type.Object(
	{
		hash: Type.String(),
		paramsPreview: Type.String(),
	},
	{ $id: "DynamicModuleInfo" },
);

const ModuleGraphNodeKindSchema = Type.Union(
	[Type.Literal("root"), Type.Literal("global"), Type.Literal("feature")],
	{ $id: "ModuleGraphNodeKind" },
);

export const LifetimeTypeSchema = Type.Union(
	[
		Type.Literal("SINGLETON"),
		Type.Literal("SCOPED"),
		Type.Literal("TRANSIENT"),
	],
	{ $id: "LifetimeType" },
);

// Base node schema without instances (used for nested instances to avoid recursive $ref)
const ModuleGraphNodeBaseSchema = Type.Object(
	{
		id: Type.String(),
		name: Type.String(),
		baseName: Type.Optional(Type.String()),
		dynamic: Type.Optional(DynamicModuleInfoSchema),
		grouped: Type.Boolean(),
		familyInstanceCount: Type.Number(),
		instanceCount: Type.Number(),
		kind: ModuleGraphNodeKindSchema,
		dependencyCount: Type.Number(),
		dependentCount: Type.Number(),
		providers: Type.Array(Type.String()),
		providerAllowCircular: Type.Record(Type.String(), Type.Boolean()),
		providerIsClass: Type.Record(Type.String(), Type.Boolean()),
		// Registration key -> whether the provider is a factory ({ useFactory }).
		// Factory providers have no class name or static value, so the tooltip marks
		// them explicitly instead of rendering empty.
		providerIsFactory: Type.Record(Type.String(), Type.Boolean()),
		// Registration key -> implementation class name (class-backed providers only).
		providerClassNames: Type.Record(Type.String(), Type.String()),
		// Registration key -> serialized value (value providers only: primitives,
		// plain objects, arrays). Shown in the provider tooltip.
		providerValues: Type.Record(Type.String(), Type.String()),
		providerDependencies: Type.Record(Type.String(), Type.Array(Type.String())),
		providerEager: Type.Record(Type.String(), Type.Boolean()),
		providerInitAfter: Type.Record(Type.String(), Type.Array(Type.String())),
		lifetimeTypes: Type.Record(Type.String(), LifetimeTypeSchema),
		exports: Type.Array(Type.String()),
		controllers: Type.Array(Type.String()),
		// Controller class name -> lifetime, so entrypoints (which reference their
		// controller by class name) can show the same scoped/transient mark as
		// providers.
		controllerLifetimeTypes: Type.Record(Type.String(), LifetimeTypeSchema),
		queryHandlers: Type.Array(Type.String()),
		commandHandlers: Type.Array(Type.String()),
		// Mediator handler key ("cats/get-cats") -> handler class name.
		queryHandlerKeys: Type.Record(Type.String(), Type.String()),
		commandHandlerKeys: Type.Record(Type.String(), Type.String()),
		queryPreHandlers: Type.Array(Type.String()),
		queryPreHandlerExports: Type.Array(Type.String()),
		commandPreHandlers: Type.Array(Type.String()),
		commandPreHandlerExports: Type.Array(Type.String()),
		// Pre-handler key ("auth") -> middleware class name ("CatsAuthMiddleware");
		// trace spans reference middlewares by class name.
		queryPreHandlerClassNames: Type.Record(Type.String(), Type.String()),
		commandPreHandlerClassNames: Type.Record(Type.String(), Type.String()),
		// Pre-handler key -> lifetime, mirroring the provider lifetime marks.
		queryPreHandlerLifetimeTypes: Type.Record(
			Type.String(),
			LifetimeTypeSchema,
		),
		commandPreHandlerLifetimeTypes: Type.Record(
			Type.String(),
			LifetimeTypeSchema,
		),
		interceptors: Type.Array(Type.String()),
		interceptorExports: Type.Array(Type.String()),
		// Interceptor/initializer key -> class name and applied decorator names,
		// so the graph can label exported members like the drawer does.
		interceptorClassNames: Type.Record(Type.String(), Type.String()),
		interceptorDecoratorNames: Type.Record(
			Type.String(),
			Type.Array(Type.String()),
		),
		initializers: Type.Array(Type.String()),
		initializerExports: Type.Array(Type.String()),
		initializerClassNames: Type.Record(Type.String(), Type.String()),
		entrypoints: Type.Array(ModuleGraphEntrypointSchema),
	},
	{ $id: "ModuleGraphNodeBase" },
);

export const ModuleProviderImpactSchema = Type.Object(
	{
		affected: Type.Array(Type.String()),
		added: Type.Array(Type.String()),
		changed: Type.Array(Type.String()),
		deleted: Type.Array(Type.String()),
	},
	{ $id: "ModuleProviderImpact" },
);

export type ModuleProviderImpact = Static<typeof ModuleProviderImpactSchema>;

export const ModuleGraphNodeSchema = Type.Composite(
	[
		ModuleGraphNodeBaseSchema,
		Type.Object({
			routes: Type.Array(ModuleGraphRouteSchema),
			instances: Type.Array(ModuleGraphNodeBaseSchema),
			impact: ModuleProviderImpactSchema,
		}),
	],
	{ $id: "ModuleGraphNode" },
);

export type ModuleGraphNode = Static<typeof ModuleGraphNodeSchema>;

export const ModuleGraphGlobalProviderGroupSchema = Type.Object(
	{
		moduleId: Type.String(),
		moduleName: Type.String(),
		providers: Type.Array(Type.String()),
		// Same provider metadata carried on a regular module node, so the UI can
		// render global providers with constructor dependencies, lifetimes, and
		// impact — identical to own/imported providers. Global modules are often
		// filtered out of the returned module list, so this must travel with the
		// group itself rather than being resolved from the modules array.
		exports: Type.Array(Type.String()),
		providerAllowCircular: Type.Record(Type.String(), Type.Boolean()),
		providerDependencies: Type.Record(Type.String(), Type.Array(Type.String())),
		providerEager: Type.Record(Type.String(), Type.Boolean()),
		providerInitAfter: Type.Record(Type.String(), Type.Array(Type.String())),
		lifetimeTypes: Type.Record(Type.String(), LifetimeTypeSchema),
		impact: ModuleProviderImpactSchema,
	},
	{ $id: "ModuleGraphGlobalProviderGroup" },
);

export type ModuleGraphGlobalProviderGroup = Static<
	typeof ModuleGraphGlobalProviderGroupSchema
>;

export const ModuleGraphEdgeSchema = Type.Object(
	{
		from: Type.String(),
		to: Type.String(),
		type: Type.Union([Type.Literal("imports"), Type.Literal("global")]),
	},
	{ $id: "ModuleGraphEdge" },
);

export type ModuleGraphEdge = Static<typeof ModuleGraphEdgeSchema>;

export const GetGraphResponseSchema = Type.Object(
	{
		globalProviderGroups: Type.Array(ModuleGraphGlobalProviderGroupSchema),
		modules: Type.Array(ModuleGraphNodeSchema),
		edges: Type.Array(ModuleGraphEdgeSchema),
		// Interceptor/initializer class name -> decorators that apply it, found by
		// static analysis so they show even when unused. Keyed by class name
		// because the decorator's state key can differ from the export key (e.g.
		// "Cron Jobs" vs "cron"). Empty when source is unavailable.
		availableDecorators: Type.Record(Type.String(), Type.Array(Type.String())),
	},
	{ $id: "GetGraphResponse" },
);

export type GetGraphResponse = Static<typeof GetGraphResponseSchema>;

export const GetGraphSchema = {
	response: {
		200: GetGraphResponseSchema,
	},
	tags: ["Graph"],
	summary: "Get module graph",
	description: "Returns the module dependency graph",
};
