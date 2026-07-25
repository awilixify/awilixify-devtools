import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const devtoolsApiUrl = process.env.DEVTOOLS_API_URL ?? "http://127.0.0.1:3221";

export default defineConfig({
	root: __dirname,
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	build: {
		emptyOutDir: true,
		outDir: "dist",
	},
	server: {
		port: 3222,
		proxy: {
			"/__devtools": {
				target: devtoolsApiUrl,
				changeOrigin: true,
			},
		},
	},
});
