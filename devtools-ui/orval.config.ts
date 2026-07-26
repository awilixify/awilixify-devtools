import { defineConfig } from "orval";

const devtoolsApiUrl = process.env.DEVTOOLS_API_URL ?? "http://127.0.0.1:3221";

export default defineConfig({
	devtools: {
		input: {
			target: `${devtoolsApiUrl}/api-docs/json`,
			override: {
				transformer: (swaggerDocument) => {
					// Flatten anyOf: [type, null] to type with nullable: true
					const cleanAnyOf = (obj: any): any => {
						if (!obj || typeof obj !== "object") return obj;

						// First, recurse into all children (depth-first)
						for (const key in obj) {
							obj[key] = cleanAnyOf(obj[key]);
						}

						// Then handle anyOf transformation at this level
						if ("anyOf" in obj && Array.isArray(obj.anyOf)) {
							const items = obj.anyOf;
							const nullIndex = items.findIndex(
								(item: any) => item.type === "null",
							);

							// If we have exactly 2 items and one is null, merge the other with nullable: true
							if (items.length === 2 && nullIndex !== -1) {
								const nonNullItem = items[nullIndex === 0 ? 1 : 0];
								delete obj.anyOf;
								Object.assign(obj, nonNullItem, { nullable: true });
							}
						}

						return obj;
					};

					return cleanAnyOf(swaggerDocument);
				},
			},
		},
		output: {
			override: {
				mutator: {
					path: "./src/devtools-fetch.ts",
					name: "devtoolsFetch",
				},
				query: {
					useSuspenseQuery: true,
				},
				fetch: {
					includeHttpResponseReturnType: false,
				},
			},
			target: "./src/api/devtools.ts",
			schemas: "./src/api/model",
			client: "react-query",
			formatter: "biome",
			mode: "tags-split",
			clean: true,
			baseUrl: "",
		},
	},
});
