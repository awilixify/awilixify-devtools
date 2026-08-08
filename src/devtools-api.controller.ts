import { DELETE, GET, POST, schema } from "awilixify/http";
import type { Deps } from "./devtools.module.js";
import {
	ClearTracesSchema,
	DeleteTraceSchema,
	GetGraphSchema,
	GetModuleDetailsSchema,
	GetProviderImpactSchema,
	GetProviderMethodsSchema,
	GetSettingsSchema,
	GetTraceSchema,
	GetTracesSchema,
	InvokeHandlerSchema,
	InvokeProviderSchema,
} from "./dtos/index.js";
import type { Request } from "./types.js";

export class DevtoolsApiController {
	constructor(
		private readonly queryMediator: Deps["queryMediator"],
		private readonly commandMediator: Deps["commandMediator"],
	) {}

	@GET("/graph")
	@schema(GetGraphSchema)
	getModuleGraph() {
		return this.queryMediator.execute("devtools/get-module-graph", {});
	}

	@GET("/graph/modules/:moduleId")
	@schema(GetModuleDetailsSchema)
	getModuleDetails(request: Request<typeof GetModuleDetailsSchema>) {
		return this.queryMediator.execute(
			"devtools/get-module-details",
			request.params,
		);
	}

	@GET("/traces")
	@schema(GetTracesSchema)
	getTraces(request: Request<typeof GetTracesSchema>) {
		return this.queryMediator.execute("devtools/get-traces", request.query);
	}

	@DELETE("/traces")
	@schema(ClearTracesSchema)
	clearTraces() {
		return this.commandMediator.execute("devtools/clear-traces", {});
	}

	@GET("/traces/:traceId")
	@schema(GetTraceSchema)
	getTrace(request: Request<typeof GetTraceSchema>) {
		return this.queryMediator.execute("devtools/get-trace", request.params);
	}

	@DELETE("/traces/:traceId")
	@schema(DeleteTraceSchema)
	deleteTrace(request: Request<typeof DeleteTraceSchema>) {
		return this.commandMediator.execute(
			"devtools/delete-trace",
			request.params,
		);
	}

	@GET("/playground/methods")
	@schema(GetProviderMethodsSchema)
	getProviderMethods(request: Request<typeof GetProviderMethodsSchema>) {
		return this.queryMediator.execute(
			"devtools/get-provider-methods",
			request.query,
		);
	}

	@POST("/playground/invoke")
	@schema(InvokeProviderSchema)
	invokeProvider(request: Request<typeof InvokeProviderSchema>) {
		return this.commandMediator.execute(
			"devtools/invoke-provider",
			request.body,
		);
	}

	// The query/command mediator is itself a provider in every module scope, so
	// handler invocation is an invoke-provider call with a prepared payload and
	// inherits its tracing, console capture, and traceId selection.
	@POST("/playground/invoke-handler")
	@schema(InvokeHandlerSchema)
	invokeHandler(request: Request<typeof InvokeHandlerSchema>) {
		const body = request.body;
		const options: Record<string, unknown> = {};

		if (body.executionContext !== undefined) {
			options.executionContext = body.executionContext;
		}

		if (body.includePreHandlerKeys?.length) {
			options.includePreHandlerKeys = body.includePreHandlerKeys;
		}

		return this.commandMediator.execute("devtools/invoke-provider", {
			scopeModuleId: body.scopeModuleId,
			providerKey: body.kind === "query" ? "queryMediator" : "commandMediator",
			methodName: "execute",
			args:
				Object.keys(options).length > 0
					? [body.handlerKey, body.payload, options]
					: [body.handlerKey, body.payload],
			traceMethod: body.kind === "query" ? "QUERY" : "COMMAND",
		});
	}

	@GET("/impact")
	@schema(GetProviderImpactSchema)
	getProviderImpact() {
		return this.queryMediator.execute("devtools/get-provider-impact", {});
	}

	@GET("/settings")
	@schema(GetSettingsSchema)
	getSettings() {
		return this.queryMediator.execute("devtools/get-settings", {});
	}
}
