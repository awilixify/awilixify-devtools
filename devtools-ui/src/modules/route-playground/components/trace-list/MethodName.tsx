import { CodeHighlight } from "@mantine/code-highlight";
import { HoverCard, Text } from "@mantine/core";

export function formatMethodCall(methodName: string, args: unknown[]): string {
	if (!args || args.length === 0) return `${methodName}()`;

	const formattedArgs = args
		.map((arg) => JSON.stringify(arg, null, 2))
		.join(", ");

	return `${methodName}(${formattedArgs})`;
}

export function MethodName({
	methodName,
	args,
	fw,
	truncate = false,
}: {
	methodName: string;
	args: unknown[];
	fw?: number;
	truncate?: boolean;
}) {
	const hasArgs = args && args.length > 0;

	if (!hasArgs) {
		return (
			<Text
				fw={fw}
				size="sm"
				style={{ flex: truncate ? 1 : undefined, minWidth: 0 }}
				truncate={truncate}
			>
				{methodName}
				<Text span c="dimmed">
					()
				</Text>
			</Text>
		);
	}

	return (
		<HoverCard shadow="md" position="bottom-start" withArrow>
			<HoverCard.Target>
				<Text
					fw={fw}
					size="sm"
					style={{
						cursor: "help",
						flex: truncate ? 1 : undefined,
						minWidth: 0,
					}}
					truncate={truncate}
				>
					{methodName}
					<Text span c="dimmed">
						(...)
					</Text>
				</Text>
			</HoverCard.Target>
			<HoverCard.Dropdown
				style={{
					maxWidth: 600,
					maxHeight: 300,
					overflow: "auto",
					background: "var(--mantine-color-gray-0)",
				}}
			>
				<CodeHighlight
					code={formatMethodCall(methodName, args)}
					language="typescript"
					withCopyButton={false}
				/>
			</HoverCard.Dropdown>
		</HoverCard>
	);
}
