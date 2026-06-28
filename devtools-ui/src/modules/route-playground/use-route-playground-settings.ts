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

// All playground settings live in the route search params, so a plain hook is
// enough — no context/provider needed.
export function useRoutePlaygroundSettings() {
	const routeSearch = useSearch({ from: "/routes" });
	const navigate = useNavigate({ from: "/routes" });

	const selectedRouteId = routeSearch.route ?? null;
	const selectedTraceId = routeSearch.trace ?? null;
	const viewMode = routeSearch.view ?? defaultViewMode;
	const playgroundMode = routeSearch.mode ?? defaultPlaygroundMode;

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
		(traceId: string | null) => {
			updateSearch({ trace: traceId ?? undefined });
		},
		[updateSearch],
	);

	const setViewMode = useCallback(
		(mode: RoutePlaygroundViewMode) => {
			updateSearch({ view: mode === defaultViewMode ? undefined : mode });
		},
		[updateSearch],
	);

	return {
		playgroundMode,
		selectedRouteId,
		selectedTraceId,
		viewMode,
		setPlaygroundMode,
		setSelectedRouteId,
		setSelectedTraceId,
		setViewMode,
	};
}
