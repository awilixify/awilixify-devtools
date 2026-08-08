import { type Static, Type } from "@sinclair/typebox";

export const InvokeProviderBodySchema = Type.Object(
	{
		scopeModuleId: Type.String(),
		providerKey: Type.String(),
		methodName: Type.String(),
		args: Type.Array(Type.Any()),
		// Method label for the recorded trace: "QUERY"/"COMMAND" for mediator
		// invocations, "MIDDLEWARE" for pre-handler calls, "INVOKE" for plain
		// provider calls, "ENTRYPOINT" for non-HTTP decorated entrypoints.
		traceMethod: Type.Union([
			Type.Literal("INVOKE"),
			Type.Literal("QUERY"),
			Type.Literal("COMMAND"),
			Type.Literal("MIDDLEWARE"),
			Type.Literal("ENTRYPOINT"),
		]),
	},
	{ $id: "InvokeProviderBody" },
);

export type InvokeProviderBody = Static<typeof InvokeProviderBodySchema>;

const ConsoleEntrySchema = Type.Object(
	{
		level: Type.Union([
			Type.Literal("log"),
			Type.Literal("info"),
			Type.Literal("warn"),
			Type.Literal("error"),
		]),
		args: Type.Array(Type.Any()),
	},
	{ $id: "ConsoleEntry" },
);

const InvokeErrorSchema = Type.Object(
	{
		name: Type.String(),
		message: Type.String(),
		stack: Type.Optional(Type.String()),
	},
	{ $id: "InvokeError" },
);

export const InvokeProviderResponseSchema = Type.Object(
	{
		ok: Type.Boolean(),
		result: Type.Optional(Type.Any()),
		invokeError: Type.Optional(InvokeErrorSchema),
		console: Type.Array(ConsoleEntrySchema),
		traceId: Type.String(),
	},
	{ $id: "InvokeProviderResponse" },
);

export type InvokeProviderResponse = Static<
	typeof InvokeProviderResponseSchema
>;

export const InvokeProviderSchema = {
	body: InvokeProviderBodySchema,
	response: {
		200: InvokeProviderResponseSchema,
	},
	tags: ["Playground"],
	summary: "Invoke provider method",
	description: "Invokes a method on a provider and returns the result",
};
