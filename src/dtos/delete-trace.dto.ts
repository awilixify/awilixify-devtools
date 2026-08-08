import { type Static, Type } from "@sinclair/typebox";
import { GetTraceParamsSchema } from "./get-trace.dto.js";

export const DeleteTraceResponseSchema = Type.Object(
	{
		deleted: Type.Boolean(),
	},
	{ $id: "DeleteTraceResponse" },
);

export type DeleteTraceResponse = Static<typeof DeleteTraceResponseSchema>;

export const DeleteTraceSchema = {
	params: GetTraceParamsSchema,
	response: {
		200: DeleteTraceResponseSchema,
	},
	tags: ["Traces"],
	summary: "Delete trace by ID",
	description: "Removes a single trace from memory and the persisted history",
};
