import { CodeHighlight } from "@mantine/code-highlight";
import {
	ActionIcon,
	Badge,
	Box,
	Button,
	Collapse,
	Group,
	HoverCard,
	ScrollArea,
	Stack,
	Text,
	Tooltip,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import type { TraceSpan } from "@/api/model/index.js";
import { getErrorBadgeLabel, getOriginErrorSpanIds } from "./errorOrigin";
import { MethodName } from "./MethodName";
import { ProviderBadge } from "./ProviderBadge";
import { getDisplayArgs } from "./SpanDetails";

type SpanTreeNode = TraceSpan & {
	children: SpanTreeNode[];
};

type SpanTreeProps = {
	onSelect: (spanId: string) => void;
	selectedSpanId: string | null;
	spans: TraceSpan[];
};

export function SpanTree({ onSelect, selectedSpanId, spans }: SpanTreeProps) {
	const spanTree = useMemo(() => {
		const byId = new Map<string, SpanTreeNode>();

		for (const span of spans) {
			byId.set(span.id, { ...span, children: [] });
		}

		// Build visual tree: only providers nest under other providers
		const roots: SpanTreeNode[] = [];

		for (const span of byId.values()) {
			const parent = span.parentId ? byId.get(span.parentId) : null;

			// Only nest if BOTH this span and parent are providers
			const shouldNest =
				span.kind === "provider" && parent?.kind === "provider";

			if (shouldNest && parent) {
				parent.children.push(span);
				continue;
			}

			roots.push(span);
		}

		// Sort roots by startedAt for correct timeline order
		roots.sort((a, b) => a.startedAt - b.startedAt);

		return roots;
	}, [spans]);
	const parentSpanIds = useMemo(() => {
		const ids = new Set<string>();

		for (const span of spans) {
			if (span.parentId) {
				ids.add(span.parentId);
			}
		}

		return ids;
	}, [spans]);
	const originErrorSpanIds = useMemo(
		() => getOriginErrorSpanIds(spans),
		[spans],
	);
	const rootIds = useMemo(() => spanTree.map((span) => span.id), [spanTree]);
	const expandableIds = useMemo(
		() => getExpandableSpanIds(spanTree),
		[spanTree],
	);
	const [expandedSpanIds, setExpandedSpanIds] = useState<Set<string>>(
		() => new Set(rootIds),
	);

	useEffect(() => {
		setExpandedSpanIds(new Set(rootIds));
	}, [rootIds]);

	const toggleExpanded = (spanId: string) => {
		setExpandedSpanIds((current) => {
			const next = new Set(current);
			if (next.has(spanId)) {
				next.delete(spanId);
			} else {
				next.add(spanId);
			}

			return next;
		});
	};
	const expandAll = () => setExpandedSpanIds(new Set(expandableIds));
	const collapseAll = () => setExpandedSpanIds(new Set());

	const SpanRow = ({
		moduleName,
		span,
	}: {
		moduleName: string | null;
		span: SpanTreeNode;
	}) => {
		const selected = selectedSpanId === span.id;
		const hasChildren = span.children.length > 0;
		const hasTraceChildren = parentSpanIds.has(span.id);
		const expanded = expandedSpanIds.has(span.id);
		const decoratorInfo = getInterceptorDecoratorInfo(span);
		const errorTone =
			span.status === "error"
				? originErrorSpanIds.has(span.id)
					? "origin"
					: "propagated"
				: undefined;

		return (
			<Stack gap={4}>
				<Group
					bg={selected ? "teal.0" : "gray.0"}
					gap="xs"
					onClick={() => onSelect(span.id)}
					p={6}
					style={{
						border: selected
							? "1px solid var(--mantine-color-teal-4)"
							: "1px solid var(--mantine-color-gray-2)",
						borderRadius: 6,
						cursor: "pointer",
					}}
					wrap="nowrap"
				>
					{hasChildren ? (
						<ActionIcon
							aria-label={expanded ? "Collapse span" : "Expand span"}
							onClick={(event) => {
								event.stopPropagation();
								toggleExpanded(span.id);
							}}
							size="sm"
							variant="subtle"
						>
							{expanded ? "-" : "+"}
						</ActionIcon>
					) : (
						<Box h={22} w={22} />
					)}
					<ProviderBadge span={span} spans={spans} />
					{decoratorInfo && (
						<DecoratorBadge
							decoratorName={decoratorInfo.decoratorName}
							metadata={decoratorInfo.metadata}
						/>
					)}
					{errorTone && (
						<Badge
							color={"red"}
							size="xs"
							variant={errorTone === "origin" ? "filled" : "light"}
						>
							{getErrorBadgeLabel(errorTone, span.errorKind)}
						</Badge>
					)}
					<MethodName
						methodName={span.methodName}
						args={getDisplayArgs(span)}
					/>
					<Group gap={4} ml="auto" wrap="nowrap">
						<Text c="dimmed" fs="italic" fw={700} size="xs">
							{Math.round(span.selfDurationMs)} ms
						</Text>
						{hasTraceChildren && (
							<>
								<Text c="dimmed" size="xs">
									/
								</Text>
								<Text c="dimmed" size="xs">
									{Math.round(span.durationMs)} ms
								</Text>
							</>
						)}
					</Group>
				</Group>
				{hasChildren && (
					<Collapse expanded={expanded}>
						<SpanChildren parentModuleName={moduleName} spans={span.children} />
					</Collapse>
				)}
			</Stack>
		);
	};

	const SpanChildren = ({
		parentModuleName,
		spans,
		isRoot = false,
	}: {
		parentModuleName: string | null;
		spans: SpanTreeNode[];
		isRoot?: boolean;
	}) => {
		const groups = groupSpansByModule(spans, parentModuleName);

		return (
			<Stack gap={4} ml={isRoot ? 0 : "md"}>
				{groups.map((group, index) => {
					const prevGroup = groups[index - 1];
					const showHeader =
						group.moduleName !== parentModuleName ||
						(prevGroup && prevGroup.moduleName !== group.moduleName);

					return (
						<Stack gap={4} key={group.key}>
							{showHeader && (
								<Text c="dimmed" fw={700} size="xs">
									{group.moduleName}
								</Text>
							)}
							{group.spans.map((span) => (
								<SpanRow
									key={span.id}
									moduleName={group.moduleName}
									span={span}
								/>
							))}
						</Stack>
					);
				})}
			</Stack>
		);
	};

	return (
		<Stack gap={6} style={{ height: "100%", minHeight: 0 }}>
			<Group gap="xs" justify="space-between" pr="xl">
				<Group gap="xs">
					<Button
						disabled={expandableIds.length === 0}
						onClick={expandAll}
						size="xs"
						variant="subtle"
					>
						Expand all
					</Button>
					<Button
						disabled={expandableIds.length === 0}
						onClick={collapseAll}
						size="xs"
						variant="subtle"
					>
						Collapse all
					</Button>
				</Group>
				<Tooltip
					label={
						<Stack gap={4}>
							<Text size="xs">
								<Text span fs="italic" fw={700}>
									First value
								</Text>{" "}
								excludes direct child calls.
							</Text>
							<Text size="xs">
								Second value, when shown, is how long the whole span took.
							</Text>
							<Text size="xs">
								Trace duration and span totals can differ from adding child
								spans because time between child calls may include Node.js,
								framework work, or untracked code.
							</Text>
						</Stack>
					}
					multiline
					w={320}
					withArrow
				>
					<ActionIcon
						aria-label="Trace timing help"
						color="gray"
						size="sm"
						variant="subtle"
					>
						<InfoIcon />
					</ActionIcon>
				</Tooltip>
			</Group>
			<ScrollArea
				style={{ flex: 1, height: "100%", minHeight: 0 }}
				styles={{ viewport: { height: "100%", paddingRight: 12 } }}
				type="auto"
			>
				<SpanChildren isRoot parentModuleName={null} spans={spanTree} />
			</ScrollArea>
		</Stack>
	);
}

function InfoIcon() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="14"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width="14"
		>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 16v-4" />
			<path d="M12 8h.01" />
		</svg>
	);
}

function getExpandableSpanIds(spans: SpanTreeNode[]) {
	const ids: string[] = [];

	for (const span of spans) {
		if (span.children.length > 0) {
			ids.push(span.id);
		}

		ids.push(...getExpandableSpanIds(span.children));
	}

	return ids;
}

type SpanGroup = {
	key: string;
	moduleName: string | null;
	spans: SpanTreeNode[];
};

function groupSpansByModule(
	spans: SpanTreeNode[],
	parentModuleName: string | null,
): SpanGroup[] {
	const groups: SpanGroup[] = [];

	for (const span of spans) {
		const moduleName = span.moduleName ?? parentModuleName;
		const lastGroup = groups[groups.length - 1];

		if (lastGroup && lastGroup.moduleName === moduleName) {
			lastGroup.spans.push(span);
		} else {
			groups.push({
				key: `${moduleName}-${span.id}`,
				moduleName,
				spans: [span],
			});
		}
	}

	return groups;
}

type InterceptorDecoratorInfo = {
	decoratorName: string;
	metadata: unknown;
};

function getInterceptorDecoratorInfo(
	span: SpanTreeNode,
): InterceptorDecoratorInfo | null {
	if (span.kind !== "interceptor") return null;

	const context = span.args?.[0] as
		| { decoratorName?: string; metadata?: unknown }
		| undefined;

	if (!context?.decoratorName) return null;

	return {
		decoratorName: context.decoratorName,
		metadata: context.metadata,
	};
}

/**
 * Extracts decorator arguments from metadata.
 * For { timeoutMs: 3000 } returns [3000]
 * For { retry: { maxAttempts: 3 } } returns [{ maxAttempts: 3 }]
 */
function extractArgsFromMetadata(metadata: unknown): unknown[] {
	if (!metadata || typeof metadata !== "object") return [];

	const values = Object.values(metadata as Record<string, unknown>);

	if (values.length === 0) return [];

	return values;
}

function formatDecoratorCall(name: string, metadata: unknown): string {
	const args = extractArgsFromMetadata(metadata);

	if (args.length === 0) {
		return `@${name}()`;
	}

	const formattedArgs = args
		.map((arg) => JSON.stringify(arg, null, 2))
		.join(", ");

	return `@${name}(${formattedArgs})`;
}

function DecoratorBadge({
	decoratorName,
	metadata,
}: {
	decoratorName: string;
	metadata: unknown;
}) {
	const args = extractArgsFromMetadata(metadata);
	const hasArgs = args.length > 0;

	if (!hasArgs) {
		return (
			<Badge
				styles={{ label: { textTransform: "none" } }}
				color="orange"
				size="sm"
				variant="outline"
			>
				@{decoratorName}()
			</Badge>
		);
	}

	return (
		<HoverCard shadow="md" position="bottom-start" withArrow>
			<HoverCard.Target>
				<Badge
					styles={{ label: { textTransform: "none", cursor: "help" } }}
					color="orange"
					size="sm"
					variant="outline"
				>
					@{decoratorName}(...)
				</Badge>
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
					code={formatDecoratorCall(decoratorName, metadata)}
					language="typescript"
					withCopyButton={false}
				/>
			</HoverCard.Dropdown>
		</HoverCard>
	);
}
