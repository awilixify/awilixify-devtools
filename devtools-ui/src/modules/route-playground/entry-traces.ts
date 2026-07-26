import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export const entryTracesQueryKey = ["devtools-entry-traces"] as const;

// Stable key for the rerun mutation so any component (e.g. the trace details
// paper) can observe it via useIsMutating and show a spinner while it runs.
export const rerunTraceMutationKey = ["devtools-rerun-trace"] as const;

export function getEntryTracesQueryKey(serviceName: string) {
	return [...entryTracesQueryKey, serviceName] as const;
}

export function useRefreshEntryTraces() {
	const queryClient = useQueryClient();

	return useCallback(
		() =>
			queryClient.refetchQueries({
				queryKey: entryTracesQueryKey,
				type: "active",
			}),
		[queryClient],
	);
}
