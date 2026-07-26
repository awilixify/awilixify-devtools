import { Button, Checkbox, Group, Select, Stack, Text } from "@mantine/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGetDevtoolsGraphSuspense } from "@/api/graph/graph";
import type { GetGraphResponse } from "@/api/model";
import { usePostDevtoolsPlaygroundInvokeHandler } from "@/api/playground/playground";
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
import { JsonEditor } from "./JsonEditor";
import { formatJsonPretty, indentTail, parseJsonInput } from "./JsonInput";

type HandlerKind = "query" | "command";

type HandlerOccurrence = {
	handlerKey: string;
	className: string;
	kind: HandlerKind;
	moduleId: string;
	moduleName: string;
};

type MediatorOptions = {
	executionContext: unknown;
	includePreHandlerKeys: string[];
};

export function MediatorInvocationPaper() {
	const routeSearch = useSearch({ from: "/routes" });
	const navigate = useNavigate({ from: "/routes" });

	const { setSelectedTraceId, setViewMode } = useRoutePlaygroundSettings();
	const { data: graph } = useGetDevtoolsGraphSuspense();
	const { refetch: refetchTraces } = useGetDevtoolsTraces();
	const refreshEntryTraces = useRefreshEntryTraces();

	const selectedModuleId = routeSearch.module ?? null;
	const selectedHandlerKey = routeSearch.handler ?? null;

	const updateRouteSearch = useCallback(
		(next: Partial<RoutePlaygroundSearch>) => {
			navigate({
				replace: true,
				search: (previous) => ({ ...previous, ...next }),
			});
		},
		[navigate],
	);

	const handlers = useMemo(() => getHandlerOccurrences(graph), [graph]);

	const selectedHandler = useMemo(
		() =>
			selectedHandlerKey
				? (handlers.find(
						(handler) =>
							handler.handlerKey === selectedHandlerKey &&
							(!selectedModuleId || handler.moduleId === selectedModuleId),
					) ?? null)
				: null,
		[handlers, selectedHandlerKey, selectedModuleId],
	);

	const selectedModule = useMemo(
		() =>
			graph.modules.find(
				(module) =>
					module.id === (selectedHandler?.moduleId ?? selectedModuleId),
			) ?? null,
		[graph, selectedHandler, selectedModuleId],
	);

	// The JSON editors live in the URL as one packed `state` param so an
	// invocation survives reloads and can be opened from trace history. Local
	// state only exists to keep the caret stable while typing.
	const editorsRef = useRef<HTMLDivElement>(null);
	const [payloadText, setPayloadText] = useState(() =>
		formatStateField(unpackUrlState<MediatorUrlState>(routeSearch.state)?.p),
	);
	const [optionsText, setOptionsText] = useState(() =>
		formatMediatorOptions(routeSearch.state, routeSearch.middlewares),
	);

	useEffect(() => {
		if (editorsRef.current?.contains(document.activeElement)) return;

		const state = unpackUrlState<MediatorUrlState>(routeSearch.state);
		setPayloadText(formatStateField(state?.p));
		setOptionsText(
			formatMediatorOptions(routeSearch.state, routeSearch.middlewares),
		);
	}, [routeSearch.middlewares, routeSearch.state]);

	const writeUrlState = (payloadValue: string, optionsValue: string) => {
		const payload = parseJsonInput(payloadValue);
		const options = parseMediatorOptions(optionsValue);

		// Invalid JSON keeps the last valid URL state; it syncs again once fixed.
		if (!payload.ok || !options.ok) return;

		const state: MediatorUrlState = {};
		if (!isDefaultStateField(payload.value)) state.p = payload.value;
		state.o = options.value;

		updateRouteSearch({
			middlewares: options.value.includePreHandlerKeys.join(","),
			state: Object.keys(state).length > 0 ? packUrlState(state) : undefined,
		});
	};

	const changePayloadText = (value: string) => {
		setPayloadText(value);
		writeUrlState(value, optionsText);
	};

	const changeOptionsText = (value: string) => {
		setOptionsText(value);
		writeUrlState(payloadText, value);
	};

	const availablePreHandlers = useMemo(() => {
		if (!selectedModule || !selectedHandler) return [];

		return selectedHandler.kind === "query"
			? selectedModule.queryPreHandlers
			: selectedModule.commandPreHandlers;
	}, [selectedHandler, selectedModule]);

	const moduleOptions = useMemo(() => getModuleOptions(graph), [graph]);
	const handlerOptions = useMemo(
		() => getHandlerOptions(handlers, selectedModuleId),
		[handlers, selectedModuleId],
	);

	const parsedPayload = useMemo(
		() => parseJsonInput(payloadText),
		[payloadText],
	);
	const parsedOptions = useMemo(
		() => parseMediatorOptions(optionsText),
		[optionsText],
	);
	const selectedPreHandlers = parsedOptions.ok
		? parsedOptions.value.includePreHandlerKeys
		: [];

	const changeSelectedPreHandlers = (values: string[]) => {
		if (!parsedOptions.ok) return;

		const nextOptions: MediatorOptions = {
			...parsedOptions.value,
			includePreHandlerKeys: values,
		};
		const value = JSON.stringify(nextOptions, null, 2);
		setOptionsText(value);
		writeUrlState(payloadText, value);
	};

	const invokeHandlerMutation = usePostDevtoolsPlaygroundInvokeHandler({
		mutation: {
			onSuccess: async (response) => {
				await refetchTraces();
				await refreshEntryTraces();
				setSelectedTraceId(response.traceId, "full");
				setViewMode(RoutePlaygroundViewModes.trace);
			},
		},
	});

	const selectHandler = (handlerKey: string | null) => {
		if (!handlerKey) {
			updateRouteSearch({
				handler: undefined,
				middlewares: undefined,
				state: undefined,
			});
			return;
		}

		const occurrence = handlers.find(
			(handler) =>
				handler.handlerKey === handlerKey &&
				(!selectedModuleId || handler.moduleId === selectedModuleId),
		);

		updateRouteSearch({
			handler: handlerKey,
			middlewares: undefined,
			module: occurrence?.moduleId ?? selectedModuleId ?? undefined,
			state: undefined,
		});
	};

	const runHandler = () => {
		if (!selectedHandler || !parsedPayload.ok || !parsedOptions.ok) return;

		invokeHandlerMutation.mutate({
			data: {
				scopeModuleId: selectedHandler.moduleId,
				kind: selectedHandler.kind,
				handlerKey: selectedHandler.handlerKey,
				payload: parsedPayload.value,
				executionContext: parsedOptions.value.executionContext,
				includePreHandlerKeys: parsedOptions.value.includePreHandlerKeys,
			},
		});
	};

	const invocationPreview = useMemo(() => {
		if (!selectedHandler) {
			return 'queryMediator.execute("<handler>", payload, options)';
		}

		const args = [
			`"${selectedHandler.handlerKey}"`,
			formatJsonPretty(payloadText, "undefined"),
			formatJsonPretty(optionsText, "{}"),
		];

		return `${selectedHandler.kind}Mediator.execute(\n${args
			.map((arg) => `  ${indentTail(arg, "  ")}`)
			.join(",\n")}\n)`;
	}, [optionsText, payloadText, selectedHandler]);

	const canRun = !!selectedHandler && parsedPayload.ok && parsedOptions.ok;

	return (
		<Stack gap="md">
			<Group align="flex-start" grow wrap="nowrap">
				<Select
					clearable
					data={moduleOptions}
					label="Module"
					nothingFoundMessage="No modules with handlers"
					onChange={(module) =>
						updateRouteSearch({
							handler: undefined,
							middlewares: undefined,
							module: module ?? undefined,
							state: undefined,
						})
					}
					placeholder="Select module"
					searchable
					value={selectedHandler?.moduleId ?? selectedModuleId}
				/>

				<Select
					clearable
					data={handlerOptions}
					label="Handler"
					nothingFoundMessage="No handlers"
					onChange={selectHandler}
					placeholder="Select handler"
					searchable
					value={selectedHandlerKey}
				/>
			</Group>

			{selectedHandler && availablePreHandlers.length > 0 && (
				<Stack gap={6}>
					<Text fw={700} size="sm">
						Pre-handlers
					</Text>
					<Checkbox.Group
						onChange={changeSelectedPreHandlers}
						value={selectedPreHandlers}
					>
						<Group gap="md">
							{availablePreHandlers.map((preHandlerKey) => (
								<Checkbox
									key={preHandlerKey}
									label={preHandlerKey}
									value={preHandlerKey}
								/>
							))}
						</Group>
					</Checkbox.Group>
				</Stack>
			)}

			<Stack gap={6}>
				<Text fw={700} size="sm">
					Invocation
				</Text>
				<Group gap="sm" wrap="nowrap">
					<InvocationPreview code={invocationPreview} />
					<Button
						disabled={!canRun}
						loading={invokeHandlerMutation.isPending}
						onClick={runHandler}
					>
						Run
					</Button>
				</Group>
			</Stack>

			<Group align="flex-start" grow ref={editorsRef} wrap="nowrap">
				<Stack gap={6} style={{ minWidth: 0 }}>
					<Text fw={500} size="sm">
						Payload
					</Text>
					<JsonEditor
						fixedRows={4}
						hasError={!parsedPayload.ok}
						onChange={changePayloadText}
						placeholder={'{ "id": 1 }'}
						value={payloadText}
					/>
				</Stack>
				<Stack gap={6} style={{ minWidth: 0 }}>
					<Text fw={500} size="sm">
						Options
					</Text>
					<JsonEditor
						fixedRows={4}
						hasError={!parsedOptions.ok}
						onChange={changeOptionsText}
						placeholder={
							'{ "executionContext": {}, "includePreHandlerKeys": [] }'
						}
						value={optionsText}
					/>
				</Stack>
			</Group>
		</Stack>
	);
}

type MediatorUrlState = {
	o?: unknown;
	p?: unknown;
	x?: unknown;
};

function formatMediatorOptions(
	packedState: string | undefined,
	middlewares: string | undefined,
): string {
	const state = unpackUrlState<MediatorUrlState>(packedState);
	const parsed = parseMediatorOptionsValue(state?.o);

	if (parsed) return JSON.stringify(parsed, null, 2);

	return JSON.stringify(
		{
			executionContext: state?.x ?? {},
			includePreHandlerKeys: middlewares?.split(",").filter(Boolean) ?? [],
		} satisfies MediatorOptions,
		null,
		2,
	);
}

function parseMediatorOptions(
	text: string,
): { ok: true; value: MediatorOptions } | { ok: false; value: undefined } {
	const parsed = parseJsonInput(text);
	const value = parseMediatorOptionsValue(parsed.value);

	return parsed.ok && value
		? { ok: true, value }
		: { ok: false, value: undefined };
}

function parseMediatorOptionsValue(value: unknown): MediatorOptions | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;

	const options = value as Partial<MediatorOptions>;
	if (
		!Array.isArray(options.includePreHandlerKeys) ||
		!options.includePreHandlerKeys.every(
			(preHandler): preHandler is string => typeof preHandler === "string",
		)
	) {
		return null;
	}

	return {
		executionContext: hasOwn(options, "executionContext")
			? options.executionContext
			: {},
		includePreHandlerKeys: options.includePreHandlerKeys,
	};
}

function hasOwn<T extends object, K extends PropertyKey>(
	value: T,
	key: K,
): value is T & Record<K, unknown> {
	return Object.hasOwn(value, key);
}

function getHandlerOccurrences(graph: GetGraphResponse): HandlerOccurrence[] {
	const occurrences: HandlerOccurrence[] = [];

	for (const module of graph.modules) {
		const byKind: [HandlerKind, Record<string, string>][] = [
			["query", module.queryHandlerKeys ?? {}],
			["command", module.commandHandlerKeys ?? {}],
		];

		for (const [kind, handlerKeys] of byKind) {
			for (const [handlerKey, className] of Object.entries(handlerKeys)) {
				occurrences.push({
					handlerKey,
					className,
					kind,
					moduleId: module.id,
					moduleName: module.name,
				});
			}
		}
	}

	return occurrences.sort((a, b) => a.handlerKey.localeCompare(b.handlerKey));
}

function getModuleOptions(graph: GetGraphResponse) {
	return graph.modules
		.filter(
			(module) =>
				Object.keys(module.queryHandlerKeys ?? {}).length > 0 ||
				Object.keys(module.commandHandlerKeys ?? {}).length > 0,
		)
		.map((module) => ({ value: module.id, label: module.name }))
		.sort((a, b) => a.label.localeCompare(b.label));
}

function getHandlerOptions(
	handlers: HandlerOccurrence[],
	selectedModuleId: string | null,
) {
	const filtered = selectedModuleId
		? handlers.filter((handler) => handler.moduleId === selectedModuleId)
		: handlers;

	const toOption = (handler: HandlerOccurrence) => ({
		value: handler.handlerKey,
		label: handler.handlerKey,
	});

	return [
		{
			group: "Queries",
			items: filtered
				.filter((handler) => handler.kind === "query")
				.map(toOption),
		},
		{
			group: "Commands",
			items: filtered
				.filter((handler) => handler.kind === "command")
				.map(toOption),
		},
	].filter((group) => group.items.length > 0);
}
