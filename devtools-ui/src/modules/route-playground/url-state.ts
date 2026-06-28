// Free-form JSON parts of playground state (payloads, args, request bodies)
// are bundled per mode into a single `state` search param as base64url-encoded
// compact JSON, so they survive reloads and can be shared as links. Identifier
// params (mode, module, handler, ...) stay plain: they are already short and
// URL-safe, and base64 would only inflate them. Decode failures fall back to
// null so malformed/stale links degrade to defaults instead of breaking the
// page.

export function packUrlState(value: unknown): string {
	const bytes = new TextEncoder().encode(JSON.stringify(value));
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export function unpackUrlState<T>(packed: string | undefined): T | null {
	if (!packed) return null;

	try {
		const base64 = packed.replace(/-/g, "+").replace(/_/g, "/");
		const binary = atob(base64);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

		return JSON.parse(new TextDecoder().decode(bytes)) as T;
	} catch {
		return null;
	}
}

// Renders a decoded state field into a JSON editor; absent fields show the
// empty-object default.
export function formatStateField(value: unknown): string {
	return value === undefined ? "{}" : JSON.stringify(value, null, 2);
}

// Default field values are omitted from the packed state to keep URLs short.
export function isDefaultStateField(value: unknown): boolean {
	return value === undefined || JSON.stringify(value) === "{}";
}

// Packs only the fields with recorded values, so empty parts stay out of the
// URL; returns undefined when nothing was recorded.
export function packDefinedFields(
	fields: Record<string, unknown>,
): string | undefined {
	const entries = Object.entries(fields).filter(
		([, value]) => value !== undefined && value !== null,
	);

	return entries.length > 0
		? packUrlState(Object.fromEntries(entries))
		: undefined;
}
