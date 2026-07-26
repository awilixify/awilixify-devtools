import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { GetTracesResponse, Trace } from "@/api/model";
import { useTargets } from "../targets/TargetsContext";
import { getEntryTracesQueryKey } from "./entry-traces";

// Keep the client-side history bounded like the server store does.
const MAX_TRACES = 50;

// Subscribes to each target's Server-Sent Events trace stream and merges pushed
// traces into that service's entry-traces cache. New traces — including async
// downstream legs of a distributed trace — appear the moment they are recorded,
// so the UI no longer depends on polling or a tab revisit to stay current.
export function useTraceStream() {
	const queryClient = useQueryClient();
	const { targets } = useTargets();

	useEffect(() => {
		const sources = targets.map((target) => {
			const source = new EventSource(`${target.basePath}/traces/stream`);
			const queryKey = getEntryTracesQueryKey(target.serviceName);

			source.onmessage = (event) => {
				let trace: Trace;
				try {
					trace = JSON.parse(event.data) as Trace;
				} catch {
					return;
				}

				queryClient.setQueryData<GetTracesResponse>(queryKey, (current = []) =>
					[
						trace,
						...current.filter((existing) => existing.id !== trace.id),
					].slice(0, MAX_TRACES),
				);
			};

			// EventSource reconnects on its own; don't spam the console on drops.
			source.onerror = () => {};

			return source;
		});

		return () => {
			for (const source of sources) {
				source.close();
			}
		};
	}, [queryClient, targets]);
}
