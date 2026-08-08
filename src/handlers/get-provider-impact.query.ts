import type { Handler, QueryContract } from "awilixify";
import type { Deps } from "../devtools.module.js";
import type { GetProviderImpactResponse as Response } from "../dtos/index.js";

type Payload = Record<string, never>;

export class GetProviderImpactQueryHandler
	implements Handler<GetProviderImpactQueryHandler["contract"]>
{
	static readonly key = "devtools/get-provider-impact";
	declare readonly contract: QueryContract<
		typeof GetProviderImpactQueryHandler.key,
		Payload,
		Response
	>;

	constructor(
		private readonly providerImpactAnalyzer: Deps["providerImpactAnalyzer"],
	) {}

	async executor(): Promise<Response> {
		return this.providerImpactAnalyzer.analyze();
	}
}
