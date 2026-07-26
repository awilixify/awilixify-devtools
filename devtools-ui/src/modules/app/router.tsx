import {
	createHashHistory,
	createRootRoute,
	createRoute,
	createRouter,
	type RouteComponent,
} from "@tanstack/react-router";
import type { GraphViewMode, ProviderFocusHighlight } from "../graph/types";
import { createRoutePlaygroundRoute } from "../route-playground/route";
import { AppShell } from "./AppShell";
import { readBooleanSearch, readStringSearch } from "./search-params";

export type GraphRouteSearch = {
	groupDynamic?: boolean;
	impactOnly?: boolean;
	q?: string;
	selectedModule?: string;
	globals?: boolean;
	relatedOnly?: boolean;
	view?: GraphViewMode;
	focusHighlight?: ProviderFocusHighlight;
	focusProvider?: string;
	focusOccurrence?: string;
};

export type RouterComponents = {
	GraphView: RouteComponent;
	RoutePlaygroundView: RouteComponent;
	TargetsView: RouteComponent;
};

export function createAppRouter(components: RouterComponents) {
	const rootRoute = createRootRoute({
		component: AppShell,
	});

	const graphRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		validateSearch: (search: Record<string, unknown>): GraphRouteSearch => ({
			groupDynamic: readBooleanSearch(search.groupDynamic),
			impactOnly: readBooleanSearch(search.impactOnly),
			q: readStringSearch(search.q),
			selectedModule: readStringSearch(search.selectedModule),
			globals: readBooleanSearch(search.globals),
			relatedOnly: readBooleanSearch(search.relatedOnly),
			view: isGraphViewMode(search.view) ? search.view : undefined,
			focusHighlight: isProviderFocusHighlight(search.focusHighlight)
				? search.focusHighlight
				: undefined,
			focusProvider: readStringSearch(search.focusProvider),
			focusOccurrence: readStringSearch(search.focusOccurrence),
		}),
		component: components.GraphView,
	});

	const routesRoute = createRoutePlaygroundRoute(
		rootRoute,
		components.RoutePlaygroundView,
	);

	const targetsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/targets",
		component: components.TargetsView,
	});

	const routeTree = rootRoute.addChildren([
		graphRoute,
		routesRoute,
		targetsRoute,
	]);

	return createRouter({
		history: createHashHistory(),
		routeTree,
	});
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
	interface Register {
		router: AppRouter;
	}
}

function isGraphViewMode(value: unknown): value is GraphViewMode {
	return value === "dependencies" || value === "providers";
}

function isProviderFocusHighlight(
	value: unknown,
): value is ProviderFocusHighlight {
	return value === "dependencies" || value === "dependants";
}
