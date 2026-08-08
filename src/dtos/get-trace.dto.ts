import { type Static, Type } from "@sinclair/typebox";
import { TraceSchema } from "./trace.dto.js";

export const GetTraceParamsSchema = Type.Object(
	{
		traceId: Type.String(),
	},
	{ $id: "GetTraceParams" },
);

export const GetTraceResponseSchema = Type.Object(
	{
		data: Type.Union([TraceSchema, Type.Null()]),
	},
	{ $id: "GetTraceResponse" },
);

export type GetTraceResponse = Static<typeof GetTraceResponseSchema>;
export type GetTraceParams = Static<typeof GetTraceParamsSchema>;

export const GetTraceSchema = {
	params: GetTraceParamsSchema,
	response: {
		200: GetTraceResponseSchema,
	},
	tags: ["Traces"],
	summary: "Get trace by ID",
	description: "Returns a specific trace by its ID",
};
