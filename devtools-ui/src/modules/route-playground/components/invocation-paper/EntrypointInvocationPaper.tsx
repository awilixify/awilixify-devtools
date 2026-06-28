import {
	Box,
	Button,
	Group,
	Select,
	Stack,
	Text,
	Textarea,
} from "@mantine/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGetDevtoolsGraphSuspense } from "@/api/graph/graph";
import type { GetGraphResponse, ModuleGraphEntrypoint } from "@/api/model";
import { usePostDevtoolsPlaygroundInvoke } from "@/api/playground/playground";
import { useGetDevtoolsTraces } from "@/api/traces/traces";
import type { RoutePlaygroundSearch } from "../../route";
import { packUrlState, unpackUrlState } from "../../url-state";
import {
	RoutePlaygroundViewModes,
	useRoutePlaygroundSettings,
} from "../../use-route-playground-settings";
import { parseFlexibleJson } from "./flexible-json";
import { InvocationPreview } from "./InvocationPreview";

type EntrypointOccurrence = ModuleGraphEntrypoint & {
	id: string;
	moduleId: string;
	moduleName: string;
};

type EntrypointUrlState = {
	a?: unknown[];
};

export function EntrypointInvocationPaper() {
	const routeSearch = useSearch({ from: "/routes" });
	const navigate = useNavigate({ from: "/routes" });
	const { data: graph } = useGetDevtoolsGraphSuspense();
	const { refetch: refetchTraces } = useGetDevtoolsTraces();
	const { setSelectedTraceId, setViewMode } = useRoutePlaygroundSettings();

	const selectedModuleId = routeSearch.module ?? null;
	const selectedEntrypointId = routeSearch.entrypoint ?? null;
	const argsText = useMemo(
		() => unpackEntrypointArgsText(routeSearch.state),
		[routeSearch.state],
	);

	const updateRouteSearch = useCallback(
		(next: Partial<RoutePlaygroundSearch>) => {
			navigate({
				replace: true,
				search: (previous) => ({ ...previous, ...next }),
			});
		},
		[navigate],
	);

	const occurrences = useMemo(() => getEntrypointOccurrences(graph), [graph]);
	const selectedModule = useMemo(
		() =>
			graph.modules.find((module) => module.id === selectedModuleId) ?? null,
		[graph, selectedModuleId],
	);

	useEffect(() => {
		if (!selectedModuleId || selectedModule) return;

		const moduleByName = graph.modules.find(
			(module) => module.name === selectedModuleId,
		);
		if (moduleByName) {
			updateRouteSearch({ module: moduleByName.id });
		}
	}, [graph, selectedModule, selectedModuleId, updateRouteSearch]);

	const moduleOptions = useMemo(
		() => getModuleOptions(graph, occurrences),
		[graph, occurrences],
	);
	const entrypointOptions = useMemo(
		() => getEntrypointOptions(occurrences, selectedModuleId),
		[occurrences, selectedModuleId],
	);
	const selectedEntrypoint = useMemo(
		() =>
			occurrences.find(
				(entrypoint) =>
					entrypoint.id === selectedEntrypointId &&
					(!selectedModuleId || entrypoint.moduleId === selectedModuleId),
			) ?? null,
		[occurrences, selectedEntrypointId, selectedModuleId],
	);

	const [argsInput, setArgsInput] = useState(argsText);
	const argsInputRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (document.activeElement === argsInputRef.current) return;
		setArgsInput(argsText);
	}, [argsText]);

	const parsedArgs = useMemo<unknown[] | null>(() => {
		try {
			const parsed = parseFlexibleJson(`[${argsInput}]`);
			return Array.isArray(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}, [argsInput]);

	const changeArgsInput = (value: string) => {
		setArgsInput(value);

		try {
			const parsed = parseFlexibleJson(`[${value}]`);
			updateRouteSearch({
				state:
					Array.isArray(parsed) && parsed.length > 0
						? packUrlState({ a: parsed })
						: undefined,
			});
		} catch {
			// Invalid JSON keeps the last valid URL state.
		}
	};

	const invokeMutation = usePostDevtoolsPlaygroundInvoke({
		mutation: {
			onSuccess: async (response) => {
				await refetchTraces();
				setSelectedTraceId(response.traceId);
				setViewMode(RoutePlaygroundViewModes.trace);
			},
		},
	});

	const runEntrypoint = () => {
		if (!selectedEntrypoint || !parsedArgs) return;

		invokeMutation.mutate({
			data: {
				scopeModuleId: selectedEntrypoint.moduleId,
				providerKey: selectedEntrypoint.controller,
				methodName: selectedEntrypoint.handler,
				args: parsedArgs,
				traceMethod: "ENTRYPOINT",
			},
		});
	};

	const invocationPreview = selectedEntrypoint
		? `${formatEntrypointDecorator(selectedEntrypoint)}\n${formatEntrypointName(selectedEntrypoint)}(${argsInput.trim() || ""})`
		: "@entrypoint\nentrypoint.handler()";

	return (
		<Stack gap="md">
			<Group align="flex-start" grow wrap="nowrap">
				<Select
					clearable
					data={moduleOptions}
					label="Module"
					nothingFoundMessage="No modules with entrypoints"
					onChange={(module) =>
						updateRouteSearch({
							entrypoint: undefined,
							module: module ?? undefined,
							state: undefined,
						})
					}
					placeholder="Select module"
					searchable
					styles={selectEllipsisStyles}
					value={selectedModuleId}
				/>

				<Select
					clearable
					data={entrypointOptions}
					disabled={!selectedModule}
					label="Entrypoint"
					nothingFoundMessage="No entrypoints"
					onChange={(entrypoint) =>
						updateRouteSearch({
							entrypoint: entrypoint ?? undefined,
							state: undefined,
						})
					}
					placeholder="Select entrypoint"
					renderOption={({ option }) => (
						<Box
							style={{
								minWidth: 0,
								overflow: "hidden",
								width: "100%",
							}}
							title={option.label}
						>
							<Text
								size="sm"
								style={{
									display: "block",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{truncateSelectOptionLabel(option.label)}
							</Text>
						</Box>
					)}
					searchable
					styles={selectEllipsisStyles}
					value={selectedEntrypointId}
				/>
			</Group>

			<Group gap="sm" wrap="nowrap">
				<InvocationPreview code={invocationPreview} multiline />
				<Button
					disabled={!selectedEntrypoint || parsedArgs === null}
					loading={invokeMutation.isPending}
					onClick={runEntrypoint}
				>
					Run
				</Button>
			</Group>

			<Textarea
				autosize
				error={parsedArgs === null}
				label="Arguments"
				maxRows={8}
				minRows={4}
				onChange={(event) => changeArgsInput(event.currentTarget.value)}
				placeholder={'{ "id": 1 }'}
				ref={argsInputRef}
				spellCheck={false}
				styles={{
					input: {
						fontSize: 13,
						fontFamily:
							"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
					},
				}}
				value={argsInput}
			/>
		</Stack>
	);
}

function getEntrypointOccurrences(
	graph: GetGraphResponse,
): EntrypointOccurrence[] {
	return graph.modules.flatMap((module) =>
		(module.entrypoints ?? [])
			.filter((entrypoint) => entrypoint.type !== "http")
			.map((entrypoint) => ({
				...entrypoint,
				id: formatEntrypointId(module.id, entrypoint),
				moduleId: module.id,
				moduleName: module.name,
			})),
	);
}

function getModuleOptions(
	graph: GetGraphResponse,
	occurrences: EntrypointOccurrence[],
) {
	const moduleIds = new Set(
		occurrences.map((entrypoint) => entrypoint.moduleId),
	);

	return graph.modules
		.filter((module) => moduleIds.has(module.id))
		.map((module) => ({ value: module.id, label: module.name }))
		.sort((a, b) => a.label.localeCompare(b.label));
}

function getEntrypointOptions(
	occurrences: EntrypointOccurrence[],
	selectedModuleId: string | null,
) {
	const filtered = occurrences.filter(
		(entrypoint) =>
			!selectedModuleId || entrypoint.moduleId === selectedModuleId,
	);
	const entrypointsByType = new Map<string, EntrypointOccurrence[]>();

	for (const entrypoint of filtered) {
		entrypointsByType.set(entrypoint.type, [
			...(entrypointsByType.get(entrypoint.type) ?? []),
			entrypoint,
		]);
	}

	return [...entrypointsByType.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([type, entrypoints]) => ({
			group: type,
			items: entrypoints
				.map((entrypoint) => ({
					value: entrypoint.id,
					label: formatEntrypointName(entrypoint),
				}))
				.sort((a, b) => a.label.localeCompare(b.label)),
		}));
}

function formatEntrypointName(
	entrypoint: Pick<ModuleGraphEntrypoint, "controller" | "handler">,
): string {
	return `${entrypoint.controller}.${entrypoint.handler}`;
}

function formatEntrypointDecorator(
	entrypoint: Pick<ModuleGraphEntrypoint, "decoratorName" | "label" | "type">,
): string {
	const decoratorName =
		entrypoint.decoratorName ?? entrypoint.type.replace(/\s+/g, "");

	return entrypoint.label && entrypoint.label !== entrypoint.type
		? `@${decoratorName}(${entrypoint.label})`
		: `@${decoratorName}`;
}

export function formatEntrypointId(
	moduleId: string,
	entrypoint: Pick<
		ModuleGraphEntrypoint,
		"type" | "label" | "controller" | "handler" | "initializerKey"
	>,
): string {
	return [
		moduleId,
		entrypoint.type,
		entrypoint.label,
		entrypoint.controller,
		entrypoint.handler,
		entrypoint.initializerKey,
	]
		.map(encodeURIComponent)
		.join(":");
}

function unpackEntrypointArgsText(stateParam: string | undefined): string {
	const args = unpackUrlState<EntrypointUrlState>(stateParam)?.a;

	return Array.isArray(args) ? args.map(stringifyArg).join(",\n") : "";
}

function stringifyArg(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

function truncateSelectOptionLabel(label: string): string {
	const maxLength = 36;

	return label.length > maxLength
		? `${label.slice(0, maxLength - 3)}...`
		: label;
}

const selectEllipsisStyles = {
	dropdown: {
		overflowX: "hidden",
		"& *": {
			maxWidth: "100%",
			overflowX: "hidden",
		},
	},
	input: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	option: {
		maxWidth: "100%",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	options: {
		overflowX: "hidden",
	},
} as const;
