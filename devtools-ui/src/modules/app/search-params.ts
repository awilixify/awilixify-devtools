export function readBooleanSearch(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (value === "1" || value === "true") return true;
	if (value === "0" || value === "false") return false;

	return undefined;
}

export function readStringSearch(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}
