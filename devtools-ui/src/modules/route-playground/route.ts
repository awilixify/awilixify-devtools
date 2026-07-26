import {
	type AnyRoute,
	createRoute,
	type RouteComponent,
} from "@tanstack/react-router";
import { readStringSearch } from "../app/search-params";
import {
	type RoutePlaygroundMode,
	RoutePlaygroundModes,
	type RoutePlaygroundViewMode,
	RoutePlaygroundViewModes,
	type TraceHistoryMode,
	TraceHistoryModes,
} from "./use-route-playground-settings";

export type RoutePlaygroundSearch = {
	entrypoint?: string;
	handler?: string;
	history?: TraceHistoryMode;
	method?: string;
	middleware?: string;
	middlewares?: string;
	mode?: RoutePlaygroundMode;
	module?: string;
	provider?: string;
	route?: string;
	// Packed JSON parts of the active mode (payloads, args, request fields);
	// see url-state.ts.
	state?: string;
	trace?: string;
	// "full" selects the whole distributed trace (all service legs) rather than
	// the single `trace` entry; absent means a single-entry selection.
	traceScope?: "full";
	view?: RoutePlaygroundViewMode;
};

export function createRoutePlaygroundRoute<TParentRoute extends AnyRoute>(
	parentRoute: TParentRoute,
	component: RouteComponent,
) {
	return createRoute({
		getParentRoute: () => parentRoute,
		path: "/routes",
		validateSearch: (
			search: Record<string, unknown>,
		): RoutePlaygroundSearch => ({
			entrypoint: readStringSearch(search.entrypoint),
			handler: readStringSearch(search.handler),
			history: isTraceHistoryMode(search.history) ? search.history : undefined,
			method: readStringSearch(search.method),
			middleware: readStringSearch(search.middleware),
			middlewares: readStringSearch(search.middlewares),
			mode: isRoutePlaygroundMode(search.mode) ? search.mode : undefined,
			module: readStringSearch(search.module),
			provider: readStringSearch(search.provider),
			route: readStringSearch(search.route),
			state: readStringSearch(search.state),
			trace: readStringSearch(search.trace),
			traceScope: search.traceScope === "full" ? "full" : undefined,
			view: isRoutePlaygroundViewMode(search.view) ? search.view : undefined,
		}),
		component,
	});
}

function isTraceHistoryMode(value: unknown): value is TraceHistoryMode {
	return (
		value === TraceHistoryModes.merged || value === TraceHistoryModes.service
	);
}

function isRoutePlaygroundViewMode(
	value: unknown,
): value is RoutePlaygroundViewMode {
	return (
		value === RoutePlaygroundViewModes.trace ||
		value === RoutePlaygroundViewModes.graph ||
		value === RoutePlaygroundViewModes.response
	);
}

function isRoutePlaygroundMode(value: unknown): value is RoutePlaygroundMode {
	return (
		value === RoutePlaygroundModes.entrypoint ||
		value === RoutePlaygroundModes.route ||
		value === RoutePlaygroundModes.provider ||
		value === RoutePlaygroundModes.mediator ||
		value === RoutePlaygroundModes.middleware
	);
}
