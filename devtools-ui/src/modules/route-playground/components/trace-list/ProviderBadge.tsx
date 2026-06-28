import { Badge, Menu } from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { useGetDevtoolsGraphSuspense } from "@/api/graph/graph";
import type { GetGraphResponse, ModuleGraphNode, TraceSpan } from "@/api/model";
import type { GraphRouteSearch } from "../../../app/router";
import type { RoutePlaygroundSearch } from "../../route";
import { packDefinedFields, packUrlState } from "../../url-state";
import { RoutePlaygroundModes } from "../../use-route-playground-settings";
import { getSpanColor } from "../trace-tree/traceFormatting";

type InvocableTraceSpan = TraceSpan & {
	kind: "provider" | "handler" | "mediator" | "prehandler";
};

type ProviderBadgeProps = {
	span: TraceSpan;
	spans: TraceSpan[];
};

export function ProviderBadge({ span, spans }: ProviderBadgeProps) {
	const navigate = useNavigate({ from: "/routes" });
	const { data: graph } = useGetDevtoolsGraphSuspense();
	const color = getSpanColor(span.kind);

	if (!isInvocableSpan(span)) {
		return (
			<Badge
				styles={{ label: { textTransform: "none" } }}
				color={color}
				size="sm"
				variant="light"
			>
				{span.className}
			</Badge>
		);
	}

	const moduleSearchValue =
		span.moduleId ??
		graph.modules.find((module) => module.name === span.moduleName)?.id ??
		span.moduleName;
	const isPrehandlerSpan = span.kind === "prehandler";
	const isMiddlewareExecuteSpan =
		isPrehandlerSpan && span.methodName === "execute";
	const isMediator = isMediatorSpan(span);
	const canOpenInPlayground = canOpenSpanInPlayground(span, moduleSearchValue);
	const graphFocusTarget = getGraphProviderFocusTarget(
		graph,
		span,
		spans,
		moduleSearchValue,
	);

	if (!canOpenInPlayground && !graphFocusTarget) {
		return (
			<Badge
				styles={{ label: { textTransform: "none" } }}
				color={color}
				size="sm"
				variant="light"
			>
				{span.className}
			</Badge>
		);
	}

	const openInGraph = () => {
		if (!graphFocusTarget) return;

		navigate({
			to: "/",
			search: {
				focusOccurrence: graphFocusTarget.occurrenceId,
				focusProvider: graphFocusTarget.provider,
				selectedModule: graphFocusTarget.moduleId,
				view: "providers",
			} satisfies GraphRouteSearch,
		});
	};

	const openInPlayground = () => {
		if (!moduleSearchValue) return;

		// Pre-handlers have the uniform execute(payload, context, executionContext)
		// signature and their own playground tab.
		if (isPrehandlerSpan) {
			if (!isMiddlewareExecuteSpan) return;

			navigate({
				to: "/routes",
				search: {
					middleware: span.registrationKey,
					mode: RoutePlaygroundModes.middleware,
					module: moduleSearchValue,
					state: packDefinedFields({
						p: span.args?.[0],
						c: span.args?.[1],
						x: span.args?.[2],
					}),
				} satisfies RoutePlaygroundSearch,
			});
			return;
		}

		if (isMediator) {
			const [handlerKey, payload, options] = span.args as [
				unknown,
				unknown,
				(
					| { executionContext?: unknown; includePreHandlerKeys?: unknown }
					| undefined
				),
			];

			if (typeof handlerKey !== "string") return;

			navigate({
				to: "/routes",
				search: {
					handler: handlerKey,
					middlewares: Array.isArray(options?.includePreHandlerKeys)
						? options.includePreHandlerKeys.join(",")
						: undefined,
					mode: RoutePlaygroundModes.mediator,
					module: moduleSearchValue,
					state: packDefinedFields({
						p: payload,
						x: options?.executionContext,
					}),
				} satisfies RoutePlaygroundSearch,
			});
			return;
		}

		navigate({
			to: "/routes",
			search: {
				method: span.methodName,
				mode: RoutePlaygroundModes.provider,
				module: moduleSearchValue,
				provider: span.registrationKey,
				state: packUrlState({ a: span.args }),
			} satisfies RoutePlaygroundSearch,
		});
	};

	return (
		<Menu position="bottom-start" shadow="md" withArrow>
			<Menu.Target>
				<Badge
					styles={{
						label: {
							cursor: "pointer",
							textTransform: "none",
						},
					}}
					color={color}
					onClick={(event) => {
						event.stopPropagation();
					}}
					size="sm"
					variant="light"
				>
					{span.className}
				</Badge>
			</Menu.Target>
			<Menu.Dropdown onClick={(event) => event.stopPropagation()}>
				{canOpenInPlayground && (
					<Menu.Item onClick={openInPlayground}>
						{isPrehandlerSpan
							? "Open in middleware playground"
							: isMediator
								? "Open in mediator playground"
								: "Open in provider playground"}
					</Menu.Item>
				)}
				{graphFocusTarget && (
					<Menu.Item onClick={openInGraph}>Open in graph</Menu.Item>
				)}
			</Menu.Dropdown>
		</Menu>
	);
}

// Handler classes are registered in the module scope under their class name,
// so handler spans can open in the provider playground like provider spans;
// pre-handler spans open in the middleware playground.
function isInvocableSpan(span: TraceSpan): span is InvocableTraceSpan {
	return (
		span.kind === "provider" ||
		span.kind === "handler" ||
		span.kind === "mediator" ||
		span.kind === "prehandler"
	);
}

function isMediatorSpan(span: TraceSpan): span is TraceSpan & {
	kind: "mediator";
} {
	return span.kind === "mediator";
}

function canOpenSpanInPlayground(
	span: InvocableTraceSpan,
	moduleSearchValue: string | null | undefined,
): boolean {
	if (!moduleSearchValue) return false;

	switch (span.kind) {
		case "mediator":
			return typeof span.args?.[0] === "string";
		case "prehandler":
			return Boolean(span.registrationKey && span.methodName === "execute");
		case "handler":
		case "provider":
			return Boolean(span.registrationKey && span.methodName);
	}
}

type GraphProviderFocusTarget = {
	moduleId: string;
	occurrenceId: string;
	provider: string;
};

function getGraphProviderFocusTarget(
	graph: GetGraphResponse,
	span: InvocableTraceSpan,
	spans: TraceSpan[],
	moduleSearchValue: string | null | undefined,
): GraphProviderFocusTarget | null {
	const ownerModule = findGraphModule(
		graph,
		moduleSearchValue,
		span.moduleName,
	);
	const candidates = getProviderCandidates(span, ownerModule);
	const provider = findProviderInModule(ownerModule, candidates);
	const scopeModule =
		findProviderScopeModule(graph, span, spans) ?? ownerModule;

	if (ownerModule && scopeModule && provider) {
		const importedOccurrence = getImportedProviderOccurrence({
			graph,
			ownerModule,
			provider,
			scopeModule,
		});

		if (importedOccurrence) return importedOccurrence;

		return {
			moduleId: ownerModule.id,
			occurrenceId: `${ownerModule.id}:own:${provider}`,
			provider,
		};
	}

	for (const graphModule of graph.modules) {
		const provider = findProviderInModule(graphModule, candidates);
		if (!provider) continue;

		return {
			moduleId: graphModule.id,
			occurrenceId: `${graphModule.id}:own:${provider}`,
			provider,
		};
	}

	return null;
}

function findProviderScopeModule(
	graph: GetGraphResponse,
	span: InvocableTraceSpan,
	spans: TraceSpan[],
): ModuleGraphNode | null {
	if (span.kind !== "provider") {
		return findGraphModule(graph, span.moduleId, span.moduleName);
	}

	const ancestors = getAncestors(span, spans);
	const parentProvider = ancestors.find(
		(ancestor): ancestor is TraceSpan & { kind: "provider" } =>
			ancestor.kind === "provider",
	);

	if (parentProvider) {
		return findGraphModule(
			graph,
			parentProvider.moduleId,
			parentProvider.moduleName,
		);
	}

	const caller = ancestors.find(
		(ancestor) =>
			ancestor.kind === "controller" ||
			ancestor.kind === "handler" ||
			ancestor.kind === "mediator" ||
			ancestor.kind === "prehandler",
	);

	return caller
		? findGraphModule(graph, caller.moduleId, caller.moduleName)
		: findGraphModule(graph, span.moduleId, span.moduleName);
}

function getAncestors(span: TraceSpan, spans: TraceSpan[]): TraceSpan[] {
	const byId = new Map(spans.map((traceSpan) => [traceSpan.id, traceSpan]));
	const ancestors: TraceSpan[] = [];
	let current = span.parentId ? byId.get(span.parentId) : undefined;

	while (current) {
		ancestors.push(current);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}

	return ancestors;
}

function getImportedProviderOccurrence({
	graph,
	ownerModule,
	provider,
	scopeModule,
}: {
	graph: GetGraphResponse;
	ownerModule: ModuleGraphNode;
	provider: string;
	scopeModule: ModuleGraphNode;
}): GraphProviderFocusTarget | null {
	if (scopeModule.id === ownerModule.id) return null;
	if (!ownerModule.exports.includes(provider)) return null;

	const importsOwnerModule = graph.edges.some(
		(edge) => edge.from === scopeModule.id && edge.to === ownerModule.id,
	);

	if (!importsOwnerModule) return null;

	return {
		moduleId: scopeModule.id,
		occurrenceId: `${scopeModule.id}:${ownerModule.id}:${provider}`,
		provider,
	};
}

function findGraphModule(
	graph: GetGraphResponse,
	moduleSearchValue: string | null | undefined,
	moduleName: string | null | undefined,
): ModuleGraphNode | null {
	return (
		graph.modules.find(
			(module) =>
				module.id === moduleSearchValue ||
				module.name === moduleSearchValue ||
				module.name === moduleName,
		) ?? null
	);
}

function getProviderCandidates(
	span: InvocableTraceSpan,
	module: ModuleGraphNode | null,
): string[] {
	const candidates = [
		span.registrationKey,
		span.className,
		lowerFirst(span.registrationKey),
		lowerFirst(span.className),
	];

	if (module && span.kind === "prehandler") {
		candidates.push(...getPreHandlerKeysByClassName(module, span.className));
	}

	return [...new Set(candidates.filter(isStringWithValue))];
}

function getPreHandlerKeysByClassName(
	module: ModuleGraphNode,
	className: string | null | undefined,
): string[] {
	if (!className) return [];

	return [
		...Object.entries(module.queryPreHandlerClassNames),
		...Object.entries(module.commandPreHandlerClassNames),
	]
		.filter(([, preHandlerClassName]) => preHandlerClassName === className)
		.map(([key]) => key);
}

function findProviderInModule(
	module: ModuleGraphNode | null,
	candidates: string[],
): string | null {
	if (!module) return null;

	return (
		candidates.find((candidate) => module.providers.includes(candidate)) ?? null
	);
}

function lowerFirst(value: string | null | undefined): string | null {
	if (!value) return null;

	return `${value[0].toLowerCase()}${value.slice(1)}`;
}

function isStringWithValue(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}
