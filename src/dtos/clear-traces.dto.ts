import { type Static, Type } from "@sinclair/typebox";

export const ClearTracesResponseSchema = Type.Object(
	{
		cleared: Type.Boolean(),
	},
	{ $id: "ClearTracesResponse" },
);

export type ClearTracesResponse = Static<typeof ClearTracesResponseSchema>;

export const ClearTracesSchema = {
	response: {
		200: ClearTracesResponseSchema,
	},
	tags: ["Traces"],
	summary: "Clear trace history",
	description: "Removes all traces from memory and the persisted history file",
};
