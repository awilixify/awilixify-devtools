import {
	Badge,
	Button,
	Group,
	Paper,
	Select,
	Stack,
	Text,
	Textarea,
} from "@mantine/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	useGetDevtoolsPlaygroundMethods,
	usePostDevtoolsPlaygroundInvoke,
} from "@/api/playground/playground.js";
import { useGetDevtoolsTraces } from "@/api/traces/traces";
import { useRefreshEntryTraces } from "../../entry-traces";
import type { RoutePlaygroundSearch } from "../../route";
import { packUrlState, unpackUrlState } from "../../url-state";
import {
	RoutePlaygroundViewModes,
	useRoutePlaygroundSettings,
} from "../../use-route-playground-settings";
import { parseFlexibleJson } from "./flexible-json";
import { InvocationPreview } from "./InvocationPreview";
import { useProviderSelectOptions } from "./use-provider-select-options";

export function ProviderInvocationPaper() {
	const routeSearch = useSearch({ from: "/routes" });
	const navigate = useNavigate({ from: "/routes" });

	const { setSelectedTraceId, setViewMode } = useRoutePlaygroundSettings();
	const { refetch: refetchTraces } = useGetDevtoolsTraces();
	const refreshEntryTraces = useRefreshEntryTraces();

	const selectedScopeModuleId = routeSearch.module ?? null;
	const selectedProviderKey = routeSearch.provider ?? null;
	const selectedMethod = routeSearch.method ?? null;
	const argsText = useMemo(
		() => unpackProviderArgsText(routeSearch.state),
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

	const {
		graph,
		providers,
		resolvedProviderKey,
		playgroundProviderKey,
		moduleOptions,
		providerOptions,
		selectedProvider,
	} = useProviderSelectOptions(selectedScopeModuleId, selectedProviderKey);

	// A provider is imported when it is defined in a module other than the
	// scope it is being invoked from.
	const importedFromModuleName =
		selectedProvider &&
		selectedProvider.ownerModuleId !== selectedProvider.scopeModuleId
			? selectedProvider.ownerModuleName
			: null;

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

	const { data: { methods } = { methods: [] } } =
		useGetDevtoolsPlaygroundMethods(
			{
				scopeModuleId: selectedProvider?.scopeModuleId ?? "",
				providerKey: selectedProvider?.providerKey ?? "",
			},
			{
				query: {
					enabled: !!selectedProvider,
				},
			},
		);

	// The textarea is controlled from local state, not from the search param:
	// navigate() updates the URL asynchronously, and re-rendering with the stale
	// value in between moves the caret to the end on every keystroke. The URL
	// syncs back in only while the field is not focused (curl import,
	// back/forward navigation).
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
	const hasArgsError = parsedArgs === null;

	useEffect(() => {
		if (!selectedScopeModuleId) return;

		if (graph.modules.some((module) => module.id === selectedScopeModuleId)) {
			return;
		}

		const moduleByName = graph.modules.find(
			(module) => module.name === selectedScopeModuleId,
		);
		if (moduleByName) {
			updateRouteSearch({ module: moduleByName.id });
		}
	}, [graph, selectedScopeModuleId, updateRouteSearch]);

	useEffect(() => {
		if (!selectedProviderKey) return;
		if (!resolvedProviderKey || selectedProviderKey === resolvedProviderKey) {
			return;
		}

		updateRouteSearch({ provider: resolvedProviderKey });
	}, [resolvedProviderKey, selectedProviderKey, updateRouteSearch]);

	useEffect(() => {
		if (!selectedScopeModuleId) return;
		if (graph.modules.some((module) => module.name === selectedScopeModuleId)) {
			return;
		}
		if (
			moduleOptions.some(
				(moduleOption) => moduleOption.value === selectedScopeModuleId,
			)
		) {
			return;
		}

		updateRouteSearch({
			method: undefined,
			module: undefined,
			provider: undefined,
		});
	}, [graph, moduleOptions, selectedScopeModuleId, updateRouteSearch]);

	useEffect(() => {
		if (!selectedProviderKey) return;
		if (resolvedProviderKey) return;
		if (
			selectedScopeModuleId &&
			graph.modules.some((module) => module.name === selectedScopeModuleId)
		) {
			return;
		}
		if (
			providerOptions.some(
				(providerOption) => providerOption.value === selectedProviderKey,
			)
		) {
			return;
		}

		updateRouteSearch({ method: undefined, provider: undefined });
	}, [
		graph,
		providerOptions,
		resolvedProviderKey,
		selectedProviderKey,
		selectedScopeModuleId,
		updateRouteSearch,
	]);

	const selectProvider = (providerKey: string | null) => {
		if (!providerKey) {
			updateRouteSearch({ method: undefined, provider: undefined });
			return;
		}

		if (selectedScopeModuleId) {
			updateRouteSearch({ method: undefined, provider: providerKey });
			return;
		}

		const ownerOccurrence = providers.find(
			(provider) =>
				provider.providerKey === providerKey &&
				provider.scopeModuleId === provider.ownerModuleId,
		);

		updateRouteSearch({
			method: undefined,
			module:
				ownerOccurrence?.ownerModuleId ??
				providers.find((provider) => provider.providerKey === providerKey)
					?.scopeModuleId,
			provider: providerKey,
		});
	};

	const invocationPreview = selectedProvider
		? `${selectedProvider.providerKey}.${selectedMethod ?? "<method>"}(${argsInput.trim() || ""})`
		: "provider.method()";

	// Every provider invocation is traced by the backend, so unlike routes there
	// is no synthetic-trace fallback: select the returned trace directly.
	const runInvocation = () => {
		if (!selectedProvider || !selectedMethod || !parsedArgs) return;

		invokeMutation.mutate({
			data: {
				scopeModuleId: selectedProvider.scopeModuleId,
				providerKey: selectedProvider.providerKey,
				methodName: selectedMethod,
				args: parsedArgs,
				traceMethod: "INVOKE",
			},
		});
	};

	return (
		<Stack gap="md">
			<Group align="flex-start" grow wrap="nowrap">
				<Select
					clearable
					data={moduleOptions}
					label="Module"
					nothingFoundMessage="No modules"
					onChange={(module) =>
						updateRouteSearch({
							method: undefined,
							provider: undefined,
							module: module ?? undefined,
						})
					}
					placeholder="Select module"
					searchable
					value={selectedScopeModuleId}
				/>

				<Select
					clearable
					data={providerOptions}
					label="Provider"
					nothingFoundMessage="No providers"
					onChange={selectProvider}
					placeholder="Select provider"
					searchable
					value={playgroundProviderKey}
				/>

				<Select
					clearable
					data={methods}
					disabled={!selectedProvider}
					label="Method"
					nothingFoundMessage="No methods"
					onChange={(method) =>
						updateRouteSearch({ method: method ?? undefined })
					}
					placeholder="Select method"
					searchable
					value={selectedMethod}
				/>
			</Group>

			<Stack gap={6}>
				<Group gap="xs">
					<Text fw={700} size="sm">
						Invocation
					</Text>
					{importedFromModuleName ? (
						<Badge color="grape" size="sm" variant="light">
							imported from {importedFromModuleName}
						</Badge>
					) : null}
				</Group>
				<Group gap="sm" wrap="nowrap">
					<InvocationPreview code={invocationPreview} />
					<Button
						disabled={!selectedProvider || !selectedMethod || hasArgsError}
						loading={invokeMutation.isPending}
						onClick={runInvocation}
					>
						Run
					</Button>
				</Group>
			</Stack>

			<Stack gap={6}>
				<Text fw={700} size="sm">
					Arguments
				</Text>

				<Textarea
					autosize
					error={hasArgsError}
					maxRows={6}
					minRows={6}
					onChange={(event) => {
						const value = event.currentTarget.value;
						setArgsInput(value);

						// Invalid JSON keeps the last valid URL state; it syncs
						// again once fixed.
						const packed = packProviderArgs(value);
						if (packed !== null) {
							updateRouteSearch({ state: packed });
						}
					}}
					placeholder={'"arg1", "arg2"'}
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
		</Stack>
	);
}

type ProviderUrlState = {
	a?: unknown;
};

function unpackProviderArgsText(packed: string | undefined): string {
	const state = unpackUrlState<ProviderUrlState>(packed);

	if (!Array.isArray(state?.a)) return "";

	return state.a.map((arg) => JSON.stringify(arg, null, 2)).join(", ");
}

// Returns undefined to clear the state param, null when the text is not
// parseable yet and the URL should keep its last valid value.
function packProviderArgs(text: string): string | undefined | null {
	const trimmed = text.trim();

	if (!trimmed) return undefined;

	try {
		return packUrlState({ a: parseFlexibleJson(`[${trimmed}]`) });
	} catch {
		return null;
	}
}
