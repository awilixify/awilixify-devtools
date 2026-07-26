export type DevtoolsTarget = {
	serviceName: string;
	basePath: string;
};

declare global {
	interface Window {
		__AWILIXIFY_DEVTOOLS_TARGETS__?: unknown;
	}
}

export function getConfiguredTargets(): DevtoolsTarget[] {
	const value = window.__AWILIXIFY_DEVTOOLS_TARGETS__;

	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		!value.every(isDevtoolsTarget)
	) {
		throw new Error(
			"DevTools targets were not provided by the UI runtime configuration",
		);
	}

	return value;
}

function isDevtoolsTarget(value: unknown): value is DevtoolsTarget {
	if (!value || typeof value !== "object") return false;

	const target = value as Record<string, unknown>;
	return (
		typeof target.serviceName === "string" &&
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.serviceName) &&
		typeof target.basePath === "string" &&
		target.basePath === `/__devtools/${target.serviceName}/api`
	);
}
