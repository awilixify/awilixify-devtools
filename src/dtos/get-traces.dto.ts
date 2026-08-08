import { type Static, Type } from "@sinclair/typebox";
import { TraceSchema, TraceSpanStatusSchema } from "./trace.dto.js";

export const GetTracesQuerySchema = Type.Object(
	{
		distributedTraceId: Type.Optional(Type.String({ minLength: 1 })),
		method: Type.Optional(Type.String({ minLength: 1 })),
		path: Type.Optional(Type.String({ minLength: 1 })),
		status: Type.Optional(TraceSpanStatusSchema),
		since: Type.Optional(Type.Number({ minimum: 0 })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
		latest: Type.Optional(Type.Boolean()),
	},
	{ $id: "GetTracesQuery", additionalProperties: false },
);

export type GetTracesQuery = Static<typeof GetTracesQuerySchema>;

export const GetTracesResponseSchema = Type.Array(TraceSchema, {
	$id: "GetTracesResponse",
});

export type GetTracesResponse = Static<typeof GetTracesResponseSchema>;

export const GetTracesSchema = {
	querystring: GetTracesQuerySchema,
	response: {
		200: GetTracesResponseSchema,
	},
	tags: ["Traces"],
	summary: "Get traces",
	description:
		"Returns traces newest-first, optionally filtered by distributed trace, entrypoint, status, or start time",
};
