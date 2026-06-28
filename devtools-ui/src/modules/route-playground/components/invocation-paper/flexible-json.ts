// Playground editors accept JS object literals (unquoted keys, single quotes,
// expressions like Date.now()) in addition to strict JSON. Non-JSON input is
// evaluated locally in the devtools UI, which carries the same trust model as
// typing into the browser console. The result must be JSON-serializable since
// it travels as a request body and packed URL state.
export function parseFlexibleJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		// `new Function` (not eval) so `{ ... }` parses as an object literal
		// instead of a block statement, and without closure access.
		const value = new Function(`"use strict"; return (${text});`)();
		const json = JSON.stringify(value);

		if (json === undefined) {
			throw new Error("Value is not JSON-serializable");
		}

		return JSON.parse(json);
	}
}
