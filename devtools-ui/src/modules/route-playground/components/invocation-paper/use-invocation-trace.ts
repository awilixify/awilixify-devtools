import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type { GetTracesResponse, Trace } from "@/api/model";
import { TraceSpanStatus } from "@/api/model";
import { useTargets } from "../../../targets/TargetsContext";
import {
	getEntryTracesQueryKey,
	useRefreshEntryTraces,
} from "../../entry-traces";
import {
	RoutePlaygroundViewModes,
	useRoutePlaygroundSettings,
} from "../../use-route-playground-settings";

const SYNTHETIC_TRACE_ID_PREFIX = "synthetic:";

export type SyntheticTraceInput = {
	method: string;
	url: string;
	statusCode: number | null;
	response: unknown;
	ok: boolean;
};

export function isSyntheticTrace(trace: Trace): boolean {
	return trace.id.startsWith(SYNTHETIC_TRACE_ID_PREFIX);
}

export function useInvocationTrace() {
	const queryClient = useQueryClient();
	const refreshEntryTraces = useRefreshEntryTraces();
	const { setSelectedTraceId, setViewMode } = useRoutePlaygroundSettings();
	const { selectedTarget } = useTargets();

	// History and details read per-service entry traces, and a route request is
	// sent to the active playground target — so detect the newly recorded trace
	// from that target's entry traces, not the origin-only default query.
	const entryTracesKey = getEntryTracesQueryKey(selectedTarget.serviceName);
	const previousFirstTraceIdRef = useRef<string | undefined>(undefined);

	const readEntryTraces = useCallback(
		(): Trace[] =>
			queryClient.getQueryData<GetTracesResponse>(entryTracesKey) ?? [],
		[queryClient, entryTracesKey],
	);

	const newestRealTraceId = (traces: Trace[]): string | undefined =>
		traces.find((trace) => !isSyntheticTrace(trace))?.id;

	const startInvocation = () => {
		previousFirstTraceIdRef.current = newestRealTraceId(readEntryTraces());
		setSelectedTraceId(null);
	};

	const finishInvocation = async (
		fallback: SyntheticTraceInput,
		traceId?: string,
	) => {
		await refreshEntryTraces();

		const newFirstTraceId = traceId ?? newestRealTraceId(readEntryTraces());

		if (
			newFirstTraceId &&
			newFirstTraceId !== previousFirstTraceIdRef.current
		) {
			// Late distributed legs arrive via the SSE trace stream, so no polling.
			setSelectedTraceId(newFirstTraceId, "full");
			setViewMode(RoutePlaygroundViewModes.trace);
			return;
		}

		// No trace was recorded (e.g. the request never reached a traced handler);
		// show the raw response via a synthetic entry. No follow-up refresh here —
		// it would wipe the synthetic before the user sees it.
		const syntheticTrace = createSyntheticTrace(
			fallback,
			selectedTarget.serviceName,
		);
		queryClient.setQueryData<GetTracesResponse>(
			entryTracesKey,
			(current = []) => [syntheticTrace, ...current],
		);
		setSelectedTraceId(syntheticTrace.id);
		setViewMode(RoutePlaygroundViewModes.response);
	};

	return { startInvocation, finishInvocation };
}

function createSyntheticTrace(
	input: SyntheticTraceInput,
	serviceName: string,
): Trace {
	const id = `${SYNTHETIC_TRACE_ID_PREFIX}${crypto.randomUUID()}`;

	return {
		id,
		distributedTraceId: id,
		spanId: id,
		parentSpanId: null,
		serviceName,
		method: input.method,
		path: input.url,
		url: input.url,
		statusCode: input.statusCode,
		request: {},
		response: input.response,
		error: null,
		startedAt: Date.now(),
		durationMs: 0,
		status: input.ok ? TraceSpanStatus.ok : TraceSpanStatus.error,
		spans: [],
		console: [],
	};
}
