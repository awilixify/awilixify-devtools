export function stringifyPretty(value: unknown): string {
	if (value === undefined) return "undefined";

	return JSON.stringify(value, null, 2);
}
