import type { Static, TSchema } from "@sinclair/typebox";
import type { RouteSchema } from "awilixify/http";
import type { FastifyRequest } from "fastify";

export type Request<S extends RouteSchema> = FastifyRequest<{
	Querystring: S["querystring"] extends TSchema
		? Static<S["querystring"]>
		: unknown;
	Params: S["params"] extends TSchema ? Static<S["params"]> : unknown;
	Body: S["body"] extends TSchema ? Static<S["body"]> : unknown;
}>;
