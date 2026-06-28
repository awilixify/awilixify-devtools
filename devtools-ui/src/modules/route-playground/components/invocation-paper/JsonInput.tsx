import { Textarea } from "@mantine/core";
import { parseFlexibleJson } from "./flexible-json";

export function JsonInput({
	error,
	label,
	onChange,
	placeholder,
	value,
}: {
	error: boolean;
	label: string;
	onChange: (value: string) => void;
	placeholder: string;
	value: string;
}) {
	return (
		<Textarea
			autosize
			error={error}
			label={label}
			maxRows={8}
			minRows={4}
			onChange={(event) => onChange(event.currentTarget.value)}
			placeholder={placeholder}
			spellCheck={false}
			styles={{
				input: {
					fontSize: 13,
					fontFamily:
						"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
				},
			}}
			value={value}
		/>
	);
}

export function parseJsonInput(text: string): { ok: boolean; value: unknown } {
	const trimmed = text.trim();

	if (!trimmed) return { ok: true, value: undefined };

	try {
		return { ok: true, value: parseFlexibleJson(trimmed) };
	} catch {
		return { ok: false, value: undefined };
	}
}

// Renders an editor's content as pretty-printed JSON for invocation previews.
export function formatJsonPretty(text: string, fallback: string): string {
	const trimmed = text.trim();

	if (!trimmed) return fallback;

	try {
		return JSON.stringify(parseFlexibleJson(trimmed), null, 2);
	} catch {
		return trimmed;
	}
}

// Indents every line after the first, so multi-line values can be embedded
// into an already-indented invocation preview.
export function indentTail(text: string, indent: string): string {
	return text.split("\n").join(`\n${indent}`);
}
