import type { CommandContract, Handler } from "awilixify";
import type { Deps } from "../devtools.module.js";
import type {
	GetTraceParams as Payload,
	DeleteTraceResponse as Response,
} from "../dtos/index.js";

export class DeleteTraceCommandHandler
	implements Handler<DeleteTraceCommandHandler["contract"]>
{
	static readonly key = "devtools/delete-trace";
	declare readonly contract: CommandContract<
		typeof DeleteTraceCommandHandler.key,
		Payload,
		Response
	>;

	constructor(private readonly tracer: Deps["tracer"]) {}

	async executor(payload: Payload): Promise<Response> {
		return { deleted: this.tracer.deleteTrace(payload.traceId) };
	}
}
