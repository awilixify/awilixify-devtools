import type { DevtoolsTarget } from "./target-config";

const STORAGE_KEY = "awilixify-devtools-target";

let activeTarget: DevtoolsTarget | undefined;

export function initializeTargetRouting(targets: DevtoolsTarget[]): string {
	const storedServiceName = window.localStorage.getItem(STORAGE_KEY);
	activeTarget =
		targets.find((target) => target.serviceName === storedServiceName) ??
		targets[0];

	if (!activeTarget) {
		throw new Error("At least one DevTools target must be configured");
	}

	return activeTarget.serviceName;
}

export function setActiveTarget(target: DevtoolsTarget): void {
	activeTarget = target;
	window.localStorage.setItem(STORAGE_KEY, target.serviceName);
}

export function getActiveTargetBasePath(): string {
	if (!activeTarget) {
		throw new Error("No active DevTools service");
	}

	return activeTarget.basePath;
}

export function getTargetAppPath(
	target: DevtoolsTarget,
	requestPath: string,
): string {
	const path = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;

	return `${target.basePath.replace(/\/api$/, "/app")}${path}`;
}

export function getActiveTargetAppPath(requestPath: string): string {
	if (!activeTarget) {
		throw new Error("No active DevTools service");
	}

	return getTargetAppPath(activeTarget, requestPath);
}
