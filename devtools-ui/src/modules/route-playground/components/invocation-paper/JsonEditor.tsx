import { JsonInput } from "@mantine/core";

type JsonEditorProps = {
	value: string;
	onChange: (value: string) => void;
	hasError?: boolean;
	fixedRows?: number;
	minRows?: number;
	maxRows?: number;
	placeholder?: string;
};

export function JsonEditor({
	value,
	onChange,
	hasError,
	fixedRows,
	minRows = 5,
	maxRows = 5,
	placeholder,
}: JsonEditorProps) {
	return (
		<JsonInput
			autosize={fixedRows === undefined}
			error={hasError}
			maxRows={maxRows}
			minRows={minRows}
			onChange={onChange}
			placeholder={placeholder}
			rows={fixedRows}
			spellCheck={false}
			styles={{
				input: {
					fontSize: 13,
					fontFamily:
						"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
					overflowY: fixedRows === undefined ? undefined : "auto",
				},
			}}
			value={value}
		/>
	);
}
