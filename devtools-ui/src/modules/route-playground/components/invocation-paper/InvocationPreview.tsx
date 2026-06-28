import { CodeHighlight } from "@mantine/code-highlight";
import { HoverCard } from "@mantine/core";

// One-line, ellipsized preview; the full invocation is shown in a hover card
// (not a tooltip) so it can be hovered into and its text selected.
export function InvocationPreview({
	code,
	multiline = false,
}: {
	code: string;
	multiline?: boolean;
}) {
	return (
		<HoverCard
			openDelay={300}
			position="bottom-start"
			shadow="md"
			withArrow
			withinPortal
		>
			<HoverCard.Target>
				<div
					style={{ cursor: "help", flex: 1, minWidth: 0, overflow: "hidden" }}
				>
					<CodeHighlight
						code={multiline ? code : toSingleLine(code)}
						language="typescript"
						styles={{
							codeHighlight: { maxWidth: "100%" },
							scrollarea: { maxWidth: "100%" },
						}}
						withCopyButton={false}
					/>
				</div>
			</HoverCard.Target>
			<HoverCard.Dropdown
				style={{
					background: "var(--mantine-color-gray-0)",
					maxHeight: 400,
					maxWidth: 700,
					overflow: "auto",
					padding: 0,
				}}
			>
				<CodeHighlight
					code={code}
					language="typescript"
					withCopyButton={false}
				/>
			</HoverCard.Dropdown>
		</HoverCard>
	);
}

function toSingleLine(code: string): string {
	return code.replace(/\s+/g, " ").trim();
}
