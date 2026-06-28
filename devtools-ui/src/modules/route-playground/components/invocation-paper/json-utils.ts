import { parseFlexibleJson } from "./flexible-json";

export type RequestPayload = {
	params: string;
	query: string;
	headers: string;
	body: string;
};

export function parsePayload(payload: RequestPayload) {
	return {
		params: parseJsonObject(payload.params, "Params"),
		query: parseJsonObject(payload.query, "Query"),
		headers: parseJsonObject(payload.headers, "Headers"),
		body: parseJsonValue(payload.body, "Body"),
	};
}

export function parseJsonObject(
	text: string,
	label: string,
): Record<string, unknown> {
	const parsed = parseJsonValue(text, label);

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`${label} must be a JSON object.`);
	}

	return parsed as Record<string, unknown>;
}

export function parseJsonValue(text: string, label: string): unknown {
	try {
		return text.trim() ? parseFlexibleJson(text) : {};
	} catch (error) {
		throw new Error(
			`${label} JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function stringifyTemplate(value: unknown): string {
	return JSON.stringify(value ?? {}, null, 2);
}

export function createSchemaTemplate(schema: unknown): unknown {
	if (!schema || typeof schema !== "object") return {};

	const schemaObject = schema as Record<string, unknown>;

	if (schemaObject.default !== undefined) return schemaObject.default;
	if (schemaObject.const !== undefined) return schemaObject.const;
	if (Array.isArray(schemaObject.enum)) return schemaObject.enum[0] ?? null;

	switch (schemaObject.type) {
		case "object":
			return createObjectTemplate(schemaObject);
		case "array":
			return [createSchemaTemplate(schemaObject.items)];
		case "string":
			return "";
		case "number":
		case "integer":
			return schemaObject.minimum ?? 0;
		case "boolean":
			return false;
		case "null":
			return null;
		default:
			return createAnyOfTemplate(schemaObject);
	}
}

function createObjectTemplate(schema: Record<string, unknown>) {
	const properties = schema.properties;
	if (!properties || typeof properties !== "object") return {};

	return Object.fromEntries(
		Object.entries(properties as Record<string, unknown>).map(
			([key, value]) => [key, createSchemaTemplate(value)],
		),
	);
}

function createAnyOfTemplate(schema: Record<string, unknown>) {
	const variants = [schema.anyOf, schema.oneOf, schema.allOf].find(
		Array.isArray,
	);
	if (!Array.isArray(variants) || variants.length === 0) return {};

	return createSchemaTemplate(variants[0]);
}
