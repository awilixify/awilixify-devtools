import { type Static, Type } from "@sinclair/typebox";
import { InvokeProviderResponseSchema } from "./invoke-provider.dto.js";

export const InvokeHandlerBodySchema = Type.Object(
	{
		scopeModuleId: Type.String(),
		kind: Type.Union([Type.Literal("query"), Type.Literal("command")]),
		handlerKey: Type.String(),
		payload: Type.Any(),
		executionContext: Type.Optional(Type.Any()),
		includePreHandlerKeys: Type.Optional(Type.Array(Type.String())),
	},
	{ $id: "InvokeHandlerBody" },
);

export type InvokeHandlerBody = Static<typeof InvokeHandlerBodySchema>;

export const InvokeHandlerSchema = {
	body: InvokeHandlerBodySchema,
	response: {
		200: InvokeProviderResponseSchema,
	},
	tags: ["Playground"],
	summary: "Invoke query/command handler",
	description:
		"Executes a handler through the module's query or command mediator, optionally running selected pre-handlers",
};
