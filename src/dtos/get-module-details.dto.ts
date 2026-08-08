import { type Static, Type } from "@sinclair/typebox";
import {
	LifetimeTypeSchema,
	ModuleGraphEntrypointSchema,
	ModuleGraphNodeSchema,
	ModuleGraphRouteSchema,
} from "./get-graph.dto.js";

export const GetModuleDetailsParamsSchema = Type.Object(
	{
		moduleId: Type.String(),
	},
	{ $id: "GetModuleDetailsParams" },
);

export type GetModuleDetailsParams = Static<
	typeof GetModuleDetailsParamsSchema
>;

export const ModuleFeatureOriginSchema = Type.Union(
	[Type.Literal("own"), Type.Literal("imported"), Type.Literal("global")],
	{ $id: "ModuleFeatureOrigin" },
);

export type ModuleFeatureOrigin = Static<typeof ModuleFeatureOriginSchema>;

export const AvailableModuleFeatureSchema = Type.Object(
	{
		className: Type.String(),
		decoratorNames: Type.Array(Type.String()),
		// Whether the source module exports the feature. Own features may or may
		// not be exported; imported/global features are always exported.
		exported: Type.Boolean(),
		key: Type.String(),
		moduleName: Type.String(),
		origin: ModuleFeatureOriginSchema,
		// Present for pre-handlers (middlewares), which can carry a lifetime like
		// providers do; used to render the scoped/transient mark.
		lifetime: Type.Optional(LifetimeTypeSchema),
	},
	{ $id: "AvailableModuleFeature" },
);

export type AvailableModuleFeature = Static<
	typeof AvailableModuleFeatureSchema
>;

export const GetModuleDetailsResponseSchema = Type.Object(
	{
		availableCommandPreHandlerDetails: Type.Array(AvailableModuleFeatureSchema),
		availableCommandPreHandlers: Type.Array(Type.String()),
		availableInitializerDetails: Type.Array(AvailableModuleFeatureSchema),
		availableInitializers: Type.Array(Type.String()),
		availableInterceptorDetails: Type.Array(AvailableModuleFeatureSchema),
		availableInterceptors: Type.Array(Type.String()),
		availableQueryPreHandlerDetails: Type.Array(AvailableModuleFeatureSchema),
		availableQueryPreHandlers: Type.Array(Type.String()),
		globalModules: Type.Array(Type.String()),
		importedModules: Type.Array(Type.String()),
		module: ModuleGraphNodeSchema,
		entrypoints: Type.Array(ModuleGraphEntrypointSchema),
		routes: Type.Array(ModuleGraphRouteSchema),
		usedByModules: Type.Array(Type.String()),
		// Interceptor/initializer class name -> decorators bound to it (static
		// analysis). Own members show these ("available"); imported/global show
		// only the decorators actually used in this module.
		availableDecorators: Type.Record(Type.String(), Type.Array(Type.String())),
	},
	{ $id: "GetModuleDetailsResponse" },
);

export type GetModuleDetailsResponse = Static<
	typeof GetModuleDetailsResponseSchema
>;

export const GetModuleDetailsSchema = {
	params: GetModuleDetailsParamsSchema,
	response: {
		200: GetModuleDetailsResponseSchema,
	},
	tags: ["Graph"],
	summary: "Get module details",
	description: "Returns detailed information about a specific module",
};
