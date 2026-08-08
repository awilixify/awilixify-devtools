import { type Static, Type } from "@sinclair/typebox";

export const TraceSpanStatusSchema = Type.Union(
	[Type.Literal("ok"), Type.Literal("error")],
	{ $id: "TraceSpanStatus" },
);

export type TraceSpanStatus = Static<typeof TraceSpanStatusSchema>;

export const TraceSpanKindSchema = Type.Union(
	[
		Type.Literal("controller"),
		Type.Literal("handler"),
		Type.Literal("interceptor"),
		Type.Literal("mediator"),
		Type.Literal("prehandler"),
		Type.Literal("provider"),
	],
	{ $id: "TraceSpanKind" },
);

export type TraceSpanKind = Static<typeof TraceSpanKindSchema>;

// How the failure surfaced: an exception ("thrown") or an error returned as a
// value, e.g. Result.error ("returned"). Absent on ok spans and old traces.
export const TraceErrorKindSchema = Type.Union(
	[Type.Literal("thrown"), Type.Literal("returned")],
	{ $id: "TraceErrorKind" },
);

export type TraceErrorKind = Static<typeof TraceErrorKindSchema>;

export const TraceErrorSchema = Type.Object(
	{
		name: Type.String(),
		message: Type.String(),
		stack: Type.Optional(Type.String()),
	},
	{ $id: "TraceError" },
);

export type TraceError = Static<typeof TraceErrorSchema>;

export const ConsoleEntryLevelSchema = Type.Union(
	[
		Type.Literal("log"),
		Type.Literal("info"),
		Type.Literal("warn"),
		Type.Literal("error"),
	],
	{ $id: "ConsoleEntryLevel" },
);

export const ConsoleEntrySchema = Type.Object(
	{
		level: ConsoleEntryLevelSchema,
		args: Type.Array(Type.Any()),
	},
	{ $id: "ConsoleEntry" },
);

export type ConsoleEntry = Static<typeof ConsoleEntrySchema>;

export const TraceRequestSchema = Type.Object(
	{
		args: Type.Optional(Type.Any()),
		body: Type.Optional(Type.Any()),
		headers: Type.Optional(Type.Any()),
		params: Type.Optional(Type.Any()),
		query: Type.Optional(Type.Any()),
	},
	{ $id: "TraceRequest" },
);

export type TraceRequest = Static<typeof TraceRequestSchema>;

// Present on root traces that entered through a non-HTTP entrypoint (rabbit,
// cron, events, …). `type` is the entrypoint kind and `label` is the listener
// name (queue/routing key), both sourced from the entrypoint's decorator.
export const TraceEntrypointSchema = Type.Object(
	{
		type: Type.String(),
		label: Type.String(),
	},
	{ $id: "TraceEntrypoint" },
);

export type TraceEntrypoint = Static<typeof TraceEntrypointSchema>;

export const TraceSpanSchema = Type.Object(
	{
		id: Type.String(),
		parentId: Type.Union([Type.String(), Type.Null()]),
		kind: TraceSpanKindSchema,
		label: Type.String(),
		moduleId: Type.Union([Type.String(), Type.Null()]),
		moduleName: Type.Union([Type.String(), Type.Null()]),
		className: Type.String(),
		registrationKey: Type.String(),
		methodName: Type.String(),
		args: Type.Array(Type.Any()),
		result: Type.Any(),
		error: Type.Union([TraceErrorSchema, Type.Null()]),
		errorKind: Type.Optional(TraceErrorKindSchema),
		startedAt: Type.Number(),
		durationMs: Type.Number(),
		selfDurationMs: Type.Number(),
		status: TraceSpanStatusSchema,
		console: Type.Array(ConsoleEntrySchema),
	},
	{ $id: "TraceSpan" },
);

export type TraceSpan = Static<typeof TraceSpanSchema>;

export const TraceSchema = Type.Object(
	{
		id: Type.String(),
		distributedTraceId: Type.String(),
		spanId: Type.String(),
		parentSpanId: Type.Union([Type.String(), Type.Null()]),
		serviceName: Type.String(),
		method: Type.String(),
		entrypoint: Type.Optional(TraceEntrypointSchema),
		path: Type.String(),
		url: Type.String(),
		statusCode: Type.Union([Type.Number(), Type.Null()]),
		request: TraceRequestSchema,
		response: Type.Any(),
		error: Type.Union([TraceErrorSchema, Type.Null()]),
		errorKind: Type.Optional(TraceErrorKindSchema),
		startedAt: Type.Number(),
		durationMs: Type.Number(),
		status: TraceSpanStatusSchema,
		spans: Type.Array(TraceSpanSchema),
		console: Type.Array(ConsoleEntrySchema),
	},
	{ $id: "Trace" },
);

export type Trace = Static<typeof TraceSchema>;
