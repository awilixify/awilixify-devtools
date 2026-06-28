import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { GetTracesResponse, Trace } from "@/api/model";
import { TraceSpanStatus } from "@/api/model";
import {
	getGetDevtoolsTracesQueryKey,
	useGetDevtoolsTraces,
} from "@/api/traces/traces";
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
	const { setSelectedTraceId, setViewMode } = useRoutePlaygroundSettings();
	const { data: traces = [], refetch } = useGetDevtoolsTraces();

	const previousFirstTraceIdRef = useRef<string | undefined>(undefined);

	const startInvocation = () => {
		previousFirstTraceIdRef.current = traces.find(
			(trace) => !isSyntheticTrace(trace),
		)?.id;
		setSelectedTraceId(null);
	};

	const finishInvocation = async (
		fallback: SyntheticTraceInput,
		traceId?: string,
	) => {
		const result = await refetch();
		const newFirstTraceId = traceId ?? result.data?.[0]?.id;

		if (
			newFirstTraceId &&
			newFirstTraceId !== previousFirstTraceIdRef.current
		) {
			setSelectedTraceId(newFirstTraceId);
			setViewMode(RoutePlaygroundViewModes.trace);
			return;
		}

		const syntheticTrace = createSyntheticTrace(fallback);
		queryClient.setQueryData<GetTracesResponse>(
			getGetDevtoolsTracesQueryKey(),
			(current = []) => [syntheticTrace, ...current],
		);
		setSelectedTraceId(syntheticTrace.id);
		setViewMode(RoutePlaygroundViewModes.response);
	};

	return { startInvocation, finishInvocation };
}

function createSyntheticTrace(input: SyntheticTraceInput): Trace {
	return {
		id: `${SYNTHETIC_TRACE_ID_PREFIX}${crypto.randomUUID()}`,
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
