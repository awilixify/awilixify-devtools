import type { CommandContract, Handler } from "awilixify";
import type { Deps } from "../devtools.module.js";
import type { ClearTracesResponse as Response } from "../dtos/index.js";

type Payload = Record<string, never>;

export class ClearTracesCommandHandler
	implements Handler<ClearTracesCommandHandler["contract"]>
{
	static readonly key = "devtools/clear-traces";
	declare readonly contract: CommandContract<
		typeof ClearTracesCommandHandler.key,
		Payload,
		Response
	>;

	constructor(private readonly tracer: Deps["tracer"]) {}

	async executor(): Promise<Response> {
		this.tracer.clearTraces();

		return { cleared: true };
	}
}
