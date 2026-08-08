import { type Static, Type } from "@sinclair/typebox";

export const GetProviderMethodsQuerySchema = Type.Object(
	{
		scopeModuleId: Type.String(),
		providerKey: Type.String(),
	},
	{ $id: "GetProviderMethodsQuery" },
);

export type GetProviderMethodsQuery = Static<
	typeof GetProviderMethodsQuerySchema
>;

export const GetProviderMethodsResponseSchema = Type.Object(
	{
		methods: Type.Array(Type.String()),
	},
	{ $id: "GetProviderMethodsResponse" },
);

export type GetProviderMethodsResponse = Static<
	typeof GetProviderMethodsResponseSchema
>;

export const GetProviderMethodsSchema = {
	querystring: GetProviderMethodsQuerySchema,
	response: {
		200: GetProviderMethodsResponseSchema,
	},
	tags: ["Playground"],
	summary: "Get provider methods",
	description: "Returns available methods for a provider",
};
