import {
	CodeHighlightAdapterProvider,
	createHighlightJsAdapter,
} from "@mantine/code-highlight";
import { MantineProvider, Paper } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import typescript from "highlight.js/lib/languages/typescript";
import { useMemo } from "react";
import { GraphView } from "../graph/GraphView";
import { RoutePlaygroundView } from "../route-playground/RoutePlaygroundView";
import { createAppRouter } from "./router";

import "highlight.js/styles/atom-one-light.css";

hljs.registerLanguage("json", json);
hljs.registerLanguage("typescript", typescript);

const highlightJsAdapter = createHighlightJsAdapter(hljs);

const queryClient = new QueryClient({
	defaultOptions: { queries: { staleTime: 2000 } },
});

export function App() {
	const router = useMemo(
		() =>
			createAppRouter({
				GraphView,
				RoutePlaygroundView,
			}),
		[],
	);

	return (
		<MantineProvider
			theme={{
				primaryColor: "teal",
				defaultRadius: "md",
				fontFamily:
					"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
				headings: {
					fontFamily:
						"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
				},
				components: {
					Paper: Paper.extend({
						defaultProps: {
							withBorder: true,
							radius: "sm",
							p: "md",
						},
					}),
				},
			}}
		>
			<CodeHighlightAdapterProvider adapter={highlightJsAdapter}>
				<QueryClientProvider client={queryClient}>
					<RouterProvider router={router} />
				</QueryClientProvider>
			</CodeHighlightAdapterProvider>
		</MantineProvider>
	);
}
