import { type Static, Type } from "@sinclair/typebox";

export const ProviderImpactItemSchema = Type.Object(
	{
		moduleId: Type.String(),
		moduleName: Type.String(),
		provider: Type.String(),
	},
	{ $id: "ProviderImpactItem" },
);

export type ProviderImpactItem = Static<typeof ProviderImpactItemSchema>;

export const GetProviderImpactResponseSchema = Type.Object(
	{
		changedFiles: Type.Array(Type.String()),
		newFiles: Type.Array(Type.String()),
		deletedFiles: Type.Array(Type.String()),
		changedProviders: Type.Array(ProviderImpactItemSchema),
		deletedProviders: Type.Array(ProviderImpactItemSchema),
		newProviders: Type.Array(ProviderImpactItemSchema),
		affectedProviders: Type.Array(ProviderImpactItemSchema),
	},
	{ $id: "GetProviderImpactResponse" },
);

export type GetProviderImpactResponse = Static<
	typeof GetProviderImpactResponseSchema
>;

// Alias for backwards compatibility
export type ProviderImpact = GetProviderImpactResponse;

export const GetProviderImpactSchema = {
	response: {
		200: GetProviderImpactResponseSchema,
	},
	tags: ["Impact"],
	summary: "Get provider impact analysis",
	description: "Analyzes git changes to determine which providers are affected",
};
