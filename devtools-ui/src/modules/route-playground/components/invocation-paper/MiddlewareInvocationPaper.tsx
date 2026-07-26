import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGetDevtoolsGraphSuspense } from "@/api/graph/graph";
import type { GetGraphResponse } from "@/api/model";
import { usePostDevtoolsPlaygroundInvoke } from "@/api/playground/playground";
import { useGetDevtoolsTraces } from "@/api/traces/traces";
import { useRefreshEntryTraces } from "../../entry-traces";
import type { RoutePlaygroundSearch } from "../../route";
import {
	formatStateField,
	isDefaultStateField,
	packUrlState,
	unpackUrlState,
} from "../../url-state";
import {
	RoutePlaygroundViewModes,
	useRoutePlaygroundSettings,
} from "../../use-route-playground-settings";
import { InvocationPreview } from "./InvocationPreview";
import {
	formatJsonPretty,
	indentTail,
	JsonInput,
	parseJsonInput,
} from "./JsonInput";

export function MiddlewareInvocationPaper() {
	const routeSearch = useSearch({ from: "/routes" });
	const navigate = useNavigate({ from: "/routes" });

	const { setSelectedTraceId, setViewMode } = useRoutePlaygroundSettings();
	const { data: graph } = useGetDevtoolsGraphSuspense();
	const { refetch: refetchTraces } = useGetDevtoolsTraces();
	const refreshEntryTraces = useRefreshEntryTraces();

	const selectedModuleId = routeSearch.module ?? null;
	const selectedMiddleware = routeSearch.middleware ?? null;

	const updateRouteSearch = useCallback(
		(next: Partial<RoutePlaygroundSearch>) => {
			navigate({
				replace: true,
				search: (previous) => ({ ...previous, ...next }),
			});
		},
		[navigate],
	);

	// The JSON editors live in the URL as one packed `state` param so an
	// invocation survives reloads and can be opened from a trace. Local state
	// only keeps the caret stable while typing.
	const editorsRef = useRef<HTMLDivElement>(null);
	const [payloadText, setPayloadText] = useState(() =>
		formatStateField(unpackUrlState<MiddlewareUrlState>(routeSearch.state)?.p),
	);
	const [contextText, setContextText] = useState(() =>
		formatStateField(unpackUrlState<MiddlewareUrlState>(routeSearch.state)?.c),
	);
	const [execContextText, setExecContextText] = useState(() =>
		formatStateField(unpackUrlState<MiddlewareUrlState>(routeSearch.state)?.x),
	);

	useEffect(() => {
		if (editorsRef.current?.contains(document.activeElement)) return;

		const state = unpackUrlState<MiddlewareUrlState>(routeSearch.state);
		setPayloadText(formatStateField(state?.p));
		setContextText(formatStateField(state?.c));
		setExecContextText(formatStateField(state?.x));
	}, [routeSearch.state]);

	const writeUrlState = (
		payloadValue: string,
		contextValue: string,
		execValue: string,
	) => {
		const payload = parseJsonInput(payloadValue);
		const context = parseJsonInput(contextValue);
		const execContext = parseJsonInput(execValue);

		// Invalid JSON keeps the last valid URL state; it syncs again once fixed.
		if (!payload.ok || !context.ok || !execContext.ok) return;

		const state: MiddlewareUrlState = {};
		if (!isDefaultStateField(payload.value)) state.p = payload.value;
		if (!isDefaultStateField(context.value)) state.c = context.value;
		if (!isDefaultStateField(execContext.value)) state.x = execContext.value;

		updateRouteSearch({
			state: Object.keys(state).length > 0 ? packUrlState(state) : undefined,
		});
	};

	const changePayloadText = (value: string) => {
		setPayloadText(value);
		writeUrlState(value, contextText, execContextText);
	};

	const changeContextText = (value: string) => {
		setContextText(value);
		writeUrlState(payloadText, value, execContextText);
	};

	const changeExecContextText = (value: string) => {
		setExecContextText(value);
		writeUrlState(payloadText, contextText, value);
	};

	const selectedModule = useMemo(
		() =>
			graph.modules.find((module) => module.id === selectedModuleId) ?? null,
		[graph, selectedModuleId],
	);

	// Trace spans only carry the module name; resolve it to the graph id.
	useEffect(() => {
		if (!selectedModuleId || selectedModule) return;

		const moduleByName = graph.modules.find(
			(module) => module.name === selectedModuleId,
		);
		if (moduleByName) {
			updateRouteSearch({ module: moduleByName.id });
		}
	}, [graph, selectedModule, selectedModuleId, updateRouteSearch]);

	const moduleOptions = useMemo(() => getModuleOptions(graph), [graph]);

	const middlewareOptions = useMemo(() => {
		if (!selectedModule) return [];

		return [
			...new Set([
				...selectedModule.queryPreHandlers,
				...selectedModule.commandPreHandlers,
			]),
		].sort((a, b) => a.localeCompare(b));
	}, [selectedModule]);

	// Trace spans reference middlewares by class name; resolve it to the
	// module's pre-handler key, which is what registration and options use.
	useEffect(() => {
		if (!selectedModule || !selectedMiddleware) return;
		if (middlewareOptions.includes(selectedMiddleware)) return;

		const classNamesByKey = {
			...selectedModule.queryPreHandlerClassNames,
			...selectedModule.commandPreHandlerClassNames,
		};
		const resolvedKey = Object.entries(classNamesByKey).find(
			([, className]) => className === selectedMiddleware,
		)?.[0];

		if (resolvedKey) {
			updateRouteSearch({ middleware: resolvedKey });
		}
	}, [
		middlewareOptions,
		selectedMiddleware,
		selectedModule,
		updateRouteSearch,
	]);

	const parsedPayload = useMemo(
		() => parseJsonInput(payloadText),
		[payloadText],
	);
	const parsedContext = useMemo(
		() => parseJsonInput(contextText),
		[contextText],
	);
	const parsedExecContext = useMemo(
		() => parseJsonInput(execContextText),
		[execContextText],
	);

	const invokeMutation = usePostDevtoolsPlaygroundInvoke({
		mutation: {
			onSuccess: async (response) => {
				await refetchTraces();
				await refreshEntryTraces();
				setSelectedTraceId(response.traceId, "full");
				setViewMode(RoutePlaygroundViewModes.trace);
			},
		},
	});

	// Pre-handlers are plain providers with a uniform
	// execute(payload, context, executionContext) signature, so standalone
	// middleware debugging reuses the provider invocation endpoint.
	const runMiddleware = () => {
		if (!selectedModule || !selectedMiddleware) return;
		if (!parsedPayload.ok || !parsedContext.ok || !parsedExecContext.ok) {
			return;
		}

		invokeMutation.mutate({
			data: {
				scopeModuleId: selectedModule.id,
				providerKey: selectedMiddleware,
				methodName: "execute",
				args: [
					parsedPayload.value,
					parsedContext.value ?? {},
					parsedExecContext.value ?? {},
				],
				traceMethod: "MIDDLEWARE",
			},
		});
	};

	const invocationPreview = selectedMiddleware
		? `${selectedMiddleware}.execute(\n${[
				formatJsonPretty(payloadText, "undefined"),
				formatJsonPretty(contextText, "{}"),
				formatJsonPretty(execContextText, "{}"),
			]
				.map((arg) => `  ${indentTail(arg, "  ")}`)
				.join(",\n")}\n)`
		: "middleware.execute(payload, context, executionContext)";

	const canRun =
		!!selectedModule &&
		!!selectedMiddleware &&
		parsedPayload.ok &&
		parsedContext.ok &&
		parsedExecContext.ok;

	return (
		<Stack gap="md">
			<Group align="flex-start" grow wrap="nowrap">
				<Select
					clearable
					data={moduleOptions}
					label="Module"
					nothingFoundMessage="No modules with pre-handlers"
					onChange={(module) =>
						updateRouteSearch({
							middleware: undefined,
							module: module ?? undefined,
							state: undefined,
						})
					}
					placeholder="Select module"
					searchable
					value={selectedModuleId}
				/>

				<Select
					clearable
					data={middlewareOptions}
					disabled={!selectedModule}
					label="Middleware"
					nothingFoundMessage="No pre-handlers"
					onChange={(middleware) =>
						updateRouteSearch({ middleware: middleware ?? undefined })
					}
					placeholder="Select middleware"
					searchable
					value={selectedMiddleware}
				/>
			</Group>

			<Stack gap={6}>
				<Text fw={700} size="sm">
					Invocation
				</Text>
				<Group gap="sm" wrap="nowrap">
					<InvocationPreview code={invocationPreview} />
					<Button
						disabled={!canRun}
						loading={invokeMutation.isPending}
						onClick={runMiddleware}
					>
						Run
					</Button>
				</Group>
			</Stack>

			<Group align="flex-start" grow ref={editorsRef} wrap="nowrap">
				<JsonInput
					error={!parsedPayload.ok}
					label="Payload"
					onChange={changePayloadText}
					placeholder={'{ "id": 1 }'}
					value={payloadText}
				/>
				<JsonInput
					error={!parsedContext.ok}
					label="Context"
					onChange={changeContextText}
					placeholder={'{ "userId": "user-1" }'}
					value={contextText}
				/>
				<JsonInput
					error={!parsedExecContext.ok}
					label="Execution context"
					onChange={changeExecContextText}
					placeholder={'{ "requestId": "req-1" }'}
					value={execContextText}
				/>
			</Group>
		</Stack>
	);
}

type MiddlewareUrlState = {
	p?: unknown;
	c?: unknown;
	x?: unknown;
};

function getModuleOptions(graph: GetGraphResponse) {
	return graph.modules
		.filter(
			(module) =>
				module.queryPreHandlers.length > 0 ||
				module.commandPreHandlers.length > 0,
		)
		.map((module) => ({ value: module.id, label: module.name }))
		.sort((a, b) => a.label.localeCompare(b.label));
}
