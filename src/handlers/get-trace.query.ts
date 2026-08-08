import type { Handler, QueryContract } from "awilixify";
import type { Deps } from "../devtools.module.js";
import type {
	GetTraceResponse,
	GetTraceParams as Payload,
} from "../dtos/index.js";

type Response = GetTraceResponse | null;

export class GetTraceQueryHandler
	implements Handler<GetTraceQueryHandler["contract"]>
{
	static readonly key = "devtools/get-trace";
	declare readonly contract: QueryContract<
		typeof GetTraceQueryHandler.key,
		Payload,
		Response
	>;

	constructor(private readonly tracer: Deps["tracer"]) {}

	async executor(payload: Payload): Promise<Response> {
		return { data: this.tracer.getTrace(payload.traceId) };
	}
}
