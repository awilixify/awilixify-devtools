import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const devtoolsApiUrl = process.env.DEVTOOLS_API_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
	root: "devtools-ui",
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	build: {
		emptyOutDir: true,
		outDir: "../dist/devtools-ui",
	},
	server: {
		proxy: {
			"/__devtools": {
				target: devtoolsApiUrl,
				changeOrigin: true,
			},
		},
	},
});
