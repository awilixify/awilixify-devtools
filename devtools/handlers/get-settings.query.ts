import type { Handler, QueryContract } from "awilixify";
import type { Deps } from "../devtools.module.js";
import type { GetSettingsResponse as Response } from "../dtos/index.js";

type Payload = Record<string, never>;

export class GetSettingsQueryHandler
	implements Handler<GetSettingsQueryHandler["contract"]>
{
	static readonly key = "devtools/get-settings";
	declare readonly contract: QueryContract<
		typeof GetSettingsQueryHandler.key,
		Payload,
		Response
	>;

	constructor(private readonly options: Deps["options"]) {}

	async executor(): Promise<Response> {
		return { appUrl: this.options.appUrl ?? null };
	}
}
