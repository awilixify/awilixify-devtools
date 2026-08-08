import { createModule, type ModuleDef } from "awilixify";
import { AWILIXIFY_DEVTOOLS_PROCESSOR } from "awilixify/devtools";
import Fastify, { type FastifyInstance } from "fastify";

import { DevtoolsApiController } from "./devtools-api.controller.js";
import { DevtoolsHttpInitializer } from "./devtools-http.initializer.js";
import { DevtoolsProcessor } from "./devtools-processor.js";
import { DevtoolsServer } from "./devtools-server.js";
import {
	ClearTracesCommandHandler,
	DeleteTraceCommandHandler,
	GetModuleDetailsQueryHandler,
	GetModuleGraphQueryHandler,
	GetProviderImpactQueryHandler,
	GetProviderMethodsQueryHandler,
	GetSettingsQueryHandler,
	GetTraceQueryHandler,
	GetTracesQueryHandler,
	InvokeProviderCommandHandler,
} from "./handlers/index.js";
import { ModuleGraphCollector } from "./module-graph/collector.js";
import { DecoratorScanner } from "./module-graph/decorator-scanner.js";
import { ProviderImpactAnalyzer } from "./provider-impact/analyzer.js";
import { Tracer } from "./trace/tracer.js";

export type DevtoolsOptions = {
	/** Stable service identifier used to qualify graph module and trace IDs. */
	serviceName: string;
	host?: string;
	port?: number;
	/** URL of the real app to proxy non-devtools requests to (e.g., "http://localhost:3000") */
	appUrl?: string;
	/**
	 * File where trace history is persisted so it survives restarts.
	 * Relative paths resolve against the cwd. Set false to keep traces
	 * in memory only. Defaults to ".awilixify-devtools/traces.json".
	 */
	traceHistoryFile?: string | false;
};

export type DevtoolsModuleDef = ModuleDef<{
	providers: {
		options: DevtoolsOptions;
		fastify: FastifyInstance;
		graphCollector: ModuleGraphCollector;
		providerImpactAnalyzer: ProviderImpactAnalyzer;
		decoratorScanner: DecoratorScanner;
		[AWILIXIFY_DEVTOOLS_PROCESSOR]: DevtoolsProcessor;
		devtoolsServer: DevtoolsServer;
		tracer: Tracer;
	};
	queryHandlers: [
		GetModuleGraphQueryHandler,
		GetModuleDetailsQueryHandler,
		GetTracesQueryHandler,
		GetTraceQueryHandler,
		GetProviderMethodsQueryHandler,
		GetProviderImpactQueryHandler,
		GetSettingsQueryHandler,
	];
	commandHandlers: [
		ClearTracesCommandHandler,
		DeleteTraceCommandHandler,
		InvokeProviderCommandHandler,
	];
	initializers: {
		http: typeof DevtoolsHttpInitializer;
	};
}>;

export type Deps = DevtoolsModuleDef["deps"];

export const DevtoolsModule = (options: DevtoolsOptions) => {
	if (!options || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.serviceName)) {
		throw new Error(
			'DevtoolsModule "serviceName" must contain lowercase letters, numbers, and single hyphens only',
		);
	}

	return createModule<DevtoolsModuleDef>({
		name: "DevtoolsModule",
		controllers: [DevtoolsApiController],
		providers: {
			options,
			fastify: {
				useFactory: () =>
					Fastify({
						logger: true,
					}),
			},
			graphCollector: ModuleGraphCollector,
			providerImpactAnalyzer: ProviderImpactAnalyzer,
			decoratorScanner: DecoratorScanner,
			tracer: Tracer,
			[AWILIXIFY_DEVTOOLS_PROCESSOR]: {
				useClass: DevtoolsProcessor,
			},
			devtoolsServer: {
				useClass: DevtoolsServer,
				eager: true,
			},
		},
		queryHandlers: [
			GetModuleGraphQueryHandler,
			GetModuleDetailsQueryHandler,
			GetTracesQueryHandler,
			GetTraceQueryHandler,
			GetProviderMethodsQueryHandler,
			GetProviderImpactQueryHandler,
			GetSettingsQueryHandler,
		],
		commandHandlers: [
			ClearTracesCommandHandler,
			DeleteTraceCommandHandler,
			InvokeProviderCommandHandler,
		],
		initializers: {
			http: DevtoolsHttpInitializer,
		},
	});
};
