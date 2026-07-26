import { useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { type DevtoolsTarget, getConfiguredTargets } from "./target-config";
import { initializeTargetRouting, setActiveTarget } from "./target-routing";

type TargetsContextValue = {
	targets: DevtoolsTarget[];
	selectedTarget: DevtoolsTarget;
	selectTarget: (serviceName: string) => void;
};

const targets = getConfiguredTargets();
const initialServiceName = initializeTargetRouting(targets);
const TargetsContext = createContext<TargetsContextValue | undefined>(
	undefined,
);

export function TargetsProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const [selectedServiceName, setSelectedServiceName] =
		useState(initialServiceName);
	const selectedTarget =
		targets.find((target) => target.serviceName === selectedServiceName) ??
		targets[0];

	if (!selectedTarget) {
		throw new Error("At least one DevTools target must be configured");
	}

	const selectTarget = useCallback(
		(serviceName: string) => {
			const target = targets.find(
				(candidate) => candidate.serviceName === serviceName,
			);
			if (!target || target.serviceName === selectedServiceName) return;

			setActiveTarget(target);
			// Invalidate (refetch in the background) rather than clear (remove): the
			// module-graph query is keyed without a service, so clearing leaves the
			// Suspense boundary with no data and blanks the whole page. Invalidating
			// keeps the previous data on screen until the new target's data loads.
			queryClient.invalidateQueries();
			setSelectedServiceName(target.serviceName);
		},
		[queryClient, selectedServiceName],
	);

	const value = useMemo(
		() => ({ selectedTarget, selectTarget, targets }),
		[selectedTarget, selectTarget],
	);

	return (
		<TargetsContext.Provider value={value}>{children}</TargetsContext.Provider>
	);
}

export function useTargets(): TargetsContextValue {
	const context = useContext(TargetsContext);

	if (!context) {
		throw new Error("useTargets must be used inside TargetsProvider");
	}

	return context;
}
