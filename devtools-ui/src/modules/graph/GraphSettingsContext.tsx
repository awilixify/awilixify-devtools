import { useNavigate, useSearch } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { GraphRouteSearch } from "../app/router";
import type {
	GraphViewMode,
	ProviderFocusHighlight,
	ProviderFocusInput,
} from "./types";

export type CenterModuleRequest = { key: string; seq: number };

type GraphSettings = {
	centerModuleRequest: CenterModuleRequest | null;
	groupDynamicModules: boolean;
	impactOnly: boolean;
	providerFocus: ProviderFocusInput;
	providerFocusHighlight: ProviderFocusHighlight;
	requestCenterModule: (moduleKey: string) => void;
	searchInput: string;
	searchQuery: string;
	// Incremented when the user submits the search (Enter) so the graph can
	// select the best-matching module.
	searchSubmitSeq: number;
	submitSearch: () => void;
	selectedModuleId: string | null;
	selectedModuleAvailable: boolean;
	setGroupDynamicModules: (checked: boolean) => void;
	setImpactOnly: (checked: boolean) => void;
	setProviderFocus: (focus: ProviderFocusInput) => void;
	setProviderFocusHighlight: (highlight: ProviderFocusHighlight) => void;
	setSearchInput: (query: string) => void;
	setSelectedModuleId: (moduleId: string | null) => void;
	setSelectedModuleAvailable: (available: boolean) => void;
	setShowGlobalEdges: (checked: boolean) => void;
	setShowRelatedOnly: (checked: boolean) => void;
	setViewMode: (viewMode: GraphViewMode) => void;
	showGlobalEdges: boolean;
	showRelatedOnly: boolean;
	viewMode: GraphViewMode;
};

type PersistedGraphSettings = {
	groupDynamicModules: boolean;
	impactOnly: boolean;
	providerFocus: ProviderFocusInput;
	providerFocusHighlight: ProviderFocusHighlight;
	searchQuery: string;
	selectedModuleId: string;
	showGlobalEdges: boolean;
	showRelatedOnly: boolean;
	viewMode: GraphViewMode;
};

const defaultSettings: PersistedGraphSettings = {
	groupDynamicModules: false,
	impactOnly: false,
	providerFocus: null,
	providerFocusHighlight: "dependants",
	searchQuery: "",
	selectedModuleId: "",
	showGlobalEdges: false,
	showRelatedOnly: false,
	viewMode: "dependencies" satisfies GraphViewMode,
};

const queryParamNames = {
	groupDynamicModules: "groupDynamic",
	impactOnly: "impactOnly",
	providerFocusProvider: "focusProvider",
	providerFocusOccurrence: "focusOccurrence",
	providerFocusHighlight: "focusHighlight",
	searchQuery: "q",
	selectedModuleId: "selectedModule",
	showGlobalEdges: "globals",
	showRelatedOnly: "relatedOnly",
	viewMode: "view",
} as const;

const GraphSettingsContext = createContext<GraphSettings | null>(null);

export function GraphSettingsProvider({ children }: { children: ReactNode }) {
	const routeSearch = useSearch({ from: "/" });
	const navigate = useNavigate({ from: "/" });
	const initialSettings = useMemo(
		() => readSettingsFromSearch(routeSearch),
		[routeSearch],
	);
	const [groupDynamicModules, setGroupDynamicModules] = useState(
		initialSettings.groupDynamicModules,
	);
	const [impactOnly, setImpactOnly] = useState(initialSettings.impactOnly);
	const [providerFocus, setProviderFocus] = useState<ProviderFocusInput>(
		initialSettings.providerFocus,
	);
	const [providerFocusHighlight, setProviderFocusHighlight] =
		useState<ProviderFocusHighlight>(initialSettings.providerFocusHighlight);
	const [searchInput, setSearchInput] = useState(initialSettings.searchQuery);
	const [searchQuery, setSearchQuery] = useState(initialSettings.searchQuery);
	const [selectedModuleId, setSelectedModuleIdState] = useState<string | null>(
		initialSettings.selectedModuleId || null,
	);
	const [selectedModuleAvailable, setSelectedModuleAvailable] = useState(false);
	const [centerModuleRequest, setCenterModuleRequest] =
		useState<CenterModuleRequest | null>(null);
	// A monotonic seq lets the graph re-center on repeat clicks of the same
	// module. Centering only moves the camera — it never changes the selection.
	const requestCenterModule = useCallback((moduleKey: string) => {
		setCenterModuleRequest((previous) => ({
			key: moduleKey,
			seq: (previous?.seq ?? 0) + 1,
		}));
	}, []);
	const [searchSubmitSeq, setSearchSubmitSeq] = useState(0);
	const submitSearch = useCallback(
		() => setSearchSubmitSeq((seq) => seq + 1),
		[],
	);
	const [showGlobalEdges, setShowGlobalEdges] = useState(
		initialSettings.showGlobalEdges,
	);
	const [showRelatedOnly, setShowRelatedOnly] = useState(
		initialSettings.showRelatedOnly,
	);
	const [viewMode, setViewMode] = useState<GraphViewMode>(
		initialSettings.viewMode,
	);
	const setSelectedModuleId = useCallback((moduleId: string | null) => {
		setSelectedModuleIdState(moduleId);
	}, []);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			setSearchQuery(searchInput);
		}, 220);

		return () => window.clearTimeout(timeoutId);
	}, [searchInput]);

	useEffect(() => {
		navigate({
			replace: true,
			search: writeSettingsToSearch({
				groupDynamicModules,
				impactOnly,
				providerFocus,
				providerFocusHighlight,
				searchQuery,
				selectedModuleId: selectedModuleId ?? "",
				showGlobalEdges,
				showRelatedOnly,
				viewMode,
			}),
		});
	}, [
		groupDynamicModules,
		impactOnly,
		navigate,
		providerFocus,
		providerFocusHighlight,
		searchQuery,
		selectedModuleId,
		showGlobalEdges,
		showRelatedOnly,
		viewMode,
	]);

	const value = useMemo<GraphSettings>(
		() => ({
			centerModuleRequest,
			groupDynamicModules,
			impactOnly,
			providerFocus,
			providerFocusHighlight,
			requestCenterModule,
			searchInput,
			searchQuery,
			searchSubmitSeq,
			submitSearch,
			selectedModuleId,
			selectedModuleAvailable,
			setGroupDynamicModules,
			setImpactOnly,
			setProviderFocus,
			setProviderFocusHighlight,
			setSearchInput,
			setSelectedModuleId,
			setSelectedModuleAvailable,
			setShowGlobalEdges,
			setShowRelatedOnly,
			setViewMode,
			showGlobalEdges,
			showRelatedOnly,
			viewMode,
		}),
		[
			centerModuleRequest,
			groupDynamicModules,
			impactOnly,
			providerFocus,
			providerFocusHighlight,
			requestCenterModule,
			searchInput,
			searchQuery,
			searchSubmitSeq,
			submitSearch,
			selectedModuleId,
			selectedModuleAvailable,
			setSelectedModuleId,
			showGlobalEdges,
			showRelatedOnly,
			viewMode,
		],
	);

	return (
		<GraphSettingsContext.Provider value={value}>
			{children}
		</GraphSettingsContext.Provider>
	);
}

export function useGraphSettings() {
	const context = useContext(GraphSettingsContext);
	if (!context) {
		throw new Error(
			"useGraphSettings must be used within GraphSettingsProvider",
		);
	}

	return context;
}

function readSettingsFromSearch(
	search: GraphRouteSearch,
): PersistedGraphSettings {
	const focusProvider = search[queryParamNames.providerFocusProvider];
	const focusOccurrence = search[queryParamNames.providerFocusOccurrence];

	return {
		groupDynamicModules:
			search[queryParamNames.groupDynamicModules] ??
			defaultSettings.groupDynamicModules,
		impactOnly:
			search[queryParamNames.impactOnly] ?? defaultSettings.impactOnly,
		providerFocus:
			focusProvider && focusOccurrence
				? { provider: focusProvider, occurrenceId: focusOccurrence }
				: null,
		providerFocusHighlight:
			search[queryParamNames.providerFocusHighlight] ??
			defaultSettings.providerFocusHighlight,
		searchQuery: search[queryParamNames.searchQuery] ?? "",
		selectedModuleId:
			search[queryParamNames.selectedModuleId] ??
			defaultSettings.selectedModuleId,
		showGlobalEdges:
			search[queryParamNames.showGlobalEdges] ??
			defaultSettings.showGlobalEdges,
		showRelatedOnly:
			search[queryParamNames.showRelatedOnly] ??
			defaultSettings.showRelatedOnly,
		viewMode: search[queryParamNames.viewMode] ?? defaultSettings.viewMode,
	};
}

function writeSettingsToSearch(
	settings: PersistedGraphSettings,
): GraphRouteSearch {
	return {
		[queryParamNames.groupDynamicModules]:
			settings.groupDynamicModules === defaultSettings.groupDynamicModules
				? undefined
				: settings.groupDynamicModules,
		[queryParamNames.impactOnly]:
			settings.impactOnly === defaultSettings.impactOnly
				? undefined
				: settings.impactOnly,
		[queryParamNames.providerFocusProvider]: settings.providerFocus?.provider,
		[queryParamNames.providerFocusOccurrence]:
			settings.providerFocus?.occurrenceId,
		[queryParamNames.providerFocusHighlight]:
			settings.providerFocusHighlight === defaultSettings.providerFocusHighlight
				? undefined
				: settings.providerFocusHighlight,
		[queryParamNames.searchQuery]:
			settings.searchQuery.trim() === defaultSettings.searchQuery
				? undefined
				: settings.searchQuery.trim(),
		[queryParamNames.selectedModuleId]:
			settings.selectedModuleId.trim() === defaultSettings.selectedModuleId
				? undefined
				: settings.selectedModuleId.trim(),
		[queryParamNames.showGlobalEdges]:
			settings.showGlobalEdges === defaultSettings.showGlobalEdges
				? undefined
				: settings.showGlobalEdges,
		[queryParamNames.showRelatedOnly]:
			settings.showRelatedOnly === defaultSettings.showRelatedOnly
				? undefined
				: settings.showRelatedOnly,
		[queryParamNames.viewMode]:
			settings.viewMode === defaultSettings.viewMode
				? undefined
				: settings.viewMode,
	};
}
