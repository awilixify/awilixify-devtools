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
} from "./use-route-playground-settings";

export type RoutePlaygroundSearch = {
	entrypoint?: string;
	handler?: string;
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
			method: readStringSearch(search.method),
			middleware: readStringSearch(search.middleware),
			middlewares: readStringSearch(search.middlewares),
			mode: isRoutePlaygroundMode(search.mode) ? search.mode : undefined,
			module: readStringSearch(search.module),
			provider: readStringSearch(search.provider),
			route: readStringSearch(search.route),
			state: readStringSearch(search.state),
			trace: readStringSearch(search.trace),
			view: isRoutePlaygroundViewMode(search.view) ? search.view : undefined,
		}),
		component,
	});
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
