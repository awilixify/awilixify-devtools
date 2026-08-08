import type { Handler, QueryContract } from "awilixify";
import type { Deps } from "../devtools.module.js";
import type {
	GetTracesQuery as Payload,
	GetTracesResponse as Response,
} from "../dtos/index.js";

type Trace = Response[number];

export class GetTracesQueryHandler
	implements Handler<GetTracesQueryHandler["contract"]>
{
	static readonly key = "devtools/get-traces";
	declare readonly contract: QueryContract<
		typeof GetTracesQueryHandler.key,
		Payload,
		Response
	>;

	constructor(private readonly tracer: Deps["tracer"]) {}

	async executor(payload: Payload): Promise<Response> {
		return filterTraces(this.tracer.getTraces(), payload);
	}
}

export function filterTraces(traces: Trace[], query: Payload): Response {
	const method = query.method?.toUpperCase();
	const filtered = traces
		.filter(
			(trace) =>
				(!query.distributedTraceId ||
					trace.distributedTraceId === query.distributedTraceId) &&
				(!method || trace.method.toUpperCase() === method) &&
				(!query.path || trace.path === query.path) &&
				(!query.status || trace.status === query.status) &&
				(query.since === undefined || trace.startedAt >= query.since),
		)
		.sort((left, right) => right.startedAt - left.startedAt);

	const limit = query.latest ? 1 : query.limit;
	return limit === undefined ? filtered : filtered.slice(0, limit);
}
