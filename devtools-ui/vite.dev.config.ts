import {
	defineConfig,
	mergeConfig,
	type Plugin,
	type ProxyOptions,
} from "vite";
import { parse } from "yaml";
import { baseConfig } from "./vite.config";

type TargetConfig = {
	serviceName: string;
	url: string;
};

export default defineConfig(() => {
	const targets = readTargets();
	const proxyEntries: [string, ProxyOptions][] = targets.flatMap((target) => {
		const servicePath = `/__devtools/${target.serviceName}`;
		const apiPath = `${servicePath}/api`;
		const appPath = `${servicePath}/app`;
		const appOptions: ProxyOptions = {
			target: target.url,
			changeOrigin: true,
			rewrite: (requestPath) => requestPath.replace(appPath, "") || "/",
		};
		const apiOptions: ProxyOptions = {
			target: target.url,
			changeOrigin: true,
			rewrite: (requestPath) =>
				requestPath.replace(apiPath, "/__devtools"),
		};

		return [
			[appPath, appOptions] as [string, ProxyOptions],
			[apiPath, apiOptions] as [string, ProxyOptions],
		];
	});
	const proxy = Object.fromEntries(proxyEntries);

	return mergeConfig(baseConfig, {
		plugins: [targetsConfigPlugin(targets)],
		server: {
			port: 3222,
			proxy,
		},
	});
});

function readTargets(): TargetConfig[] {
	const rawTargets = process.env.DEVTOOLS_TARGETS;

	if (!rawTargets) {
		throw new Error("DEVTOOLS_TARGETS is required when starting the UI");
	}

	const value: unknown = parse(rawTargets);

	if (!Array.isArray(value) || value.length === 0 || !value.every(isTarget)) {
		throw new Error(
			"DEVTOOLS_TARGETS must be a non-empty YAML list of { serviceName, url } objects",
		);
	}

	const serviceNames = value.map((target) => target.serviceName);
	if (new Set(serviceNames).size !== serviceNames.length) {
		throw new Error("DEVTOOLS_TARGETS service names must be unique");
	}

	return value;
}

function isTarget(value: unknown): value is TargetConfig {
	if (!value || typeof value !== "object") return false;

	const target = value as Record<string, unknown>;
	return (
		typeof target.serviceName === "string" &&
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.serviceName) &&
		typeof target.url === "string" &&
		/^https?:\/\/[a-zA-Z0-9._:-]+\/?$/.test(target.url)
	);
}

function targetsConfigPlugin(configuredTargets: TargetConfig[]): Plugin {
	const publicTargets = configuredTargets.map(({ serviceName }) => ({
		serviceName,
		basePath: `/__devtools/${serviceName}/api`,
	}));
	const script = `window.__AWILIXIFY_DEVTOOLS_TARGETS__ = ${JSON.stringify(publicTargets)};`;

	return {
		name: "devtools-targets-config",
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				if (request.url === "/devtools-targets.js") {
					response.setHeader("Content-Type", "text/javascript");
					response.end(script);
					return;
				}

				const isConfiguredTarget = publicTargets.some(
					({ basePath, serviceName }) =>
						request.url?.startsWith(`${basePath}/`) ||
						request.url?.startsWith(
							`/__devtools/${serviceName}/app/`,
						),
				);

				if (request.url?.startsWith("/__devtools/") && !isConfiguredTarget) {
					response.statusCode = 404;
					response.end();
					return;
				}

				next();
			});
		},
	};
}
