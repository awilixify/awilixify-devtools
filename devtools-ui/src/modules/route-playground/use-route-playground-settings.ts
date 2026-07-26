import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import type { RoutePlaygroundSearch } from "./route";

export const RoutePlaygroundViewModes = {
	trace: "trace",
	graph: "graph",
	response: "response",
} as const;

export type RoutePlaygroundViewMode =
	(typeof RoutePlaygroundViewModes)[keyof typeof RoutePlaygroundViewModes];

export const TraceHistoryModes = {
	merged: "merged",
	service: "service",
} as const;

export type TraceHistoryMode =
	(typeof TraceHistoryModes)[keyof typeof TraceHistoryModes];

export const RoutePlaygroundModes = {
	entrypoint: "entrypoint",
	route: "route",
	provider: "provider",
	mediator: "mediator",
	middleware: "middleware",
} as const;

export type RoutePlaygroundMode =
	(typeof RoutePlaygroundModes)[keyof typeof RoutePlaygroundModes];

const defaultViewMode = RoutePlaygroundViewModes.trace;
const defaultPlaygroundMode = RoutePlaygroundModes.route;
const defaultTraceHistoryMode = TraceHistoryModes.merged;

// All playground settings live in the route search params, so a plain hook is
// enough — no context/provider needed.
export function useRoutePlaygroundSettings() {
	const routeSearch = useSearch({ from: "/routes" });
	const navigate = useNavigate({ from: "/routes" });

	const selectedRouteId = routeSearch.route ?? null;
	const selectedTraceId = routeSearch.trace ?? null;
	const selectedTraceScope = routeSearch.traceScope ?? null;
	const viewMode = routeSearch.view ?? defaultViewMode;
	const playgroundMode = routeSearch.mode ?? defaultPlaygroundMode;
	const traceHistoryMode = routeSearch.history ?? defaultTraceHistoryMode;

	const updateSearch = useCallback(
		(next: Partial<RoutePlaygroundSearch>) => {
			navigate({
				replace: true,
				search: (previous) => ({ ...previous, ...next }),
			});
		},
		[navigate],
	);

	const setPlaygroundMode = useCallback(
		(mode: RoutePlaygroundMode) => {
			// The packed state param is mode-specific, so it never carries over.
			updateSearch({
				mode: mode === defaultPlaygroundMode ? undefined : mode,
				state: undefined,
			});
		},
		[updateSearch],
	);

	const setSelectedRouteId = useCallback(
		(routeId: string | null) => {
			updateSearch({ route: routeId ?? undefined });
		},
		[updateSearch],
	);

	const setSelectedTraceId = useCallback(
		(traceId: string | null, scope: "full" | "single" = "single") => {
			updateSearch({
				trace: traceId ?? undefined,
				traceScope: scope === "full" ? "full" : undefined,
			});
		},
		[updateSearch],
	);

	const setViewMode = useCallback(
		(mode: RoutePlaygroundViewMode) => {
			updateSearch({ view: mode === defaultViewMode ? undefined : mode });
		},
		[updateSearch],
	);

	const setTraceHistoryMode = useCallback(
		(mode: TraceHistoryMode) => {
			// Merged view only ever shows whole distributed traces. A single-entry
			// selection made in the by-service view has no merged equivalent, so drop
			// it when switching; a full-trace (group) selection carries over fine.
			const dropSingleSelection =
				mode === TraceHistoryModes.merged && routeSearch.traceScope !== "full";

			updateSearch({
				history: mode === defaultTraceHistoryMode ? undefined : mode,
				...(dropSingleSelection
					? { trace: undefined, traceScope: undefined }
					: {}),
			});
		},
		[routeSearch.traceScope, updateSearch],
	);

	return {
		playgroundMode,
		selectedRouteId,
		selectedTraceId,
		selectedTraceScope,
		traceHistoryMode,
		viewMode,
		setPlaygroundMode,
		setSelectedRouteId,
		setSelectedTraceId,
		setTraceHistoryMode,
		setViewMode,
	};
}
