import { type Static, Type } from "@sinclair/typebox";

export const GetSettingsResponseSchema = Type.Object(
	{
		appUrl: Type.Union([Type.String(), Type.Null()]),
		serviceName: Type.String(),
	},
	{ $id: "GetSettingsResponse" },
);

export type GetSettingsResponse = Static<typeof GetSettingsResponseSchema>;

export const GetSettingsSchema = {
	response: {
		200: GetSettingsResponseSchema,
	},
	tags: ["Settings"],
	summary: "Get devtools settings",
	description: "Returns the service identity and DevTools configuration",
};
