import {
	Badge,
	Divider,
	Group,
	SegmentedControl,
	Stack,
	Text,
} from "@mantine/core";
import clsx from "clsx";
import { useGraphSettings } from "../GraphSettingsContext";
import type {
	GraphViewMode,
	ModuleProviderGroupMemberKind,
	ProviderFocusHighlight,
	ProviderImpactStatus,
} from "../types";
import styles from "./GraphLegend.module.css";
import {
	getMemberKindColor,
	getMemberKindLabel,
} from "./ModuleNode/ProviderGroup";
import { ProviderStatusMark } from "./ModuleNode/ProviderStatusDot";

const MEMBER_KINDS: { kind: ModuleProviderGroupMemberKind; label: string }[] = [
	{ kind: "interceptor", label: "Interceptor" },
	{ kind: "initializer", label: "Initializer" },
	{ kind: "middleware", label: "Middleware" },
];

const compactGap = "calc(var(--mantine-spacing-xs) / 2)";

export function GraphLegend() {
	const {
		providerFocusHighlight,
		setProviderFocusHighlight,
		setViewMode,
		viewMode,
	} = useGraphSettings();

	return (
		<Stack gap="xs">
			<Stack gap={compactGap}>
				<Text c="dimmed" fw={700} size="xs">
					Modules
				</Text>
				<div className={styles.moduleLegendGrid}>
					<LegendItem color="var(--graph-color-selected)" label="Selected" />
					<LegendItem
						color="var(--graph-color-dependency)"
						label="Dependency"
					/>
					<LegendItem color="var(--graph-color-dependent)" label="Dependent" />
					<LegendItem color="var(--graph-color-async)" label="Async relation" />
					<LegendItem color="var(--graph-color-global)" label="Global" />
					<LegendItem
						color="var(--graph-color-dynamic)"
						label="Dynamic group"
					/>
				</div>
				<SegmentedControl
					aria-label="Graph view mode"
					data={[
						{ label: "Dependencies", value: "dependencies" },
						{ label: "Providers", value: "providers" },
					]}
					fullWidth
					onChange={(value) => setViewMode(value as GraphViewMode)}
					size="xs"
					value={viewMode}
				/>
			</Stack>

			<Divider />

			<Stack gap={compactGap}>
				<Text c="dimmed" fw={700} size="xs">
					Provider focus
				</Text>

				<LegendItem color="var(--mantine-color-orange-2)" label="Selected" />
				<LegendItem
					color="var(--mantine-color-orange-1)"
					label="Same provider"
				/>
				<LegendItem
					color="var(--mantine-color-yellow-2)"
					label={
						providerFocusHighlight === "dependencies"
							? "Selected depends on"
							: "Depends on selected"
					}
				/>
				<SegmentedControl
					aria-label="Provider focus highlight direction"
					data={[
						{ label: "Consumers", value: "dependants" },
						{ label: "Dependencies", value: "dependencies" },
					]}
					fullWidth
					onChange={(value) =>
						setProviderFocusHighlight(value as ProviderFocusHighlight)
					}
					size="xs"
					value={providerFocusHighlight}
				/>
			</Stack>

			<Divider />

			<Group align="flex-start" gap="md" grow wrap="nowrap">
				<Stack gap={compactGap}>
					<Text c="dimmed" fw={700} size="xs">
						Status
					</Text>

					<StatusLegendItem label="New" status="new" />
					<StatusLegendItem label="Deleted" status="deleted" />
					<StatusLegendItem label="Changed" status="changed" />
					<StatusLegendItem label="Affected" status="affected" />
				</Stack>

				<Stack gap={compactGap}>
					<Text c="dimmed" fw={700} size="xs">
						Metadata
					</Text>

					<LegendItem
						color="var(--mantine-color-teal-6)"
						iconLabel="↗"
						label="Exported"
					/>
					<LegendItem
						color="var(--graph-color-scoped-provider)"
						iconLabel="S"
						label="Scoped"
					/>
					<LegendItem
						color="var(--graph-color-transient-provider)"
						iconLabel="T"
						label="Transient"
					/>
					<LegendItem
						color="var(--mantine-color-grape-6)"
						iconLabel="F"
						label="Factory"
					/>
					<LegendItem
						color="var(--graph-color-eager-provider)"
						iconLabel="E"
						label="Eager"
					/>
				</Stack>
			</Group>

			<Divider />

			<Group align="flex-start" gap="md" grow wrap="nowrap">
				<Stack gap={compactGap}>
					<Text c="dimmed" fw={700} size="xs">
						Members
					</Text>

					{MEMBER_KINDS.map(({ kind, label }) => (
						<Group gap={compactGap} key={kind} wrap="nowrap">
							<Badge
								color={getMemberKindColor(kind)}
								radius="sm"
								size="xs"
								tt="none"
								variant="light"
							>
								{getMemberKindLabel(kind)}
							</Badge>
							<Text size="xs">{label}</Text>
						</Group>
					))}
					<Group gap={compactGap} wrap="nowrap">
						<Text c="grape" fw={700} size="xs" style={{ width: 18 }}>
							@1
						</Text>
						<Text size="xs">Decorator count</Text>
					</Group>
				</Stack>

				<Stack gap={compactGap}>
					<Text c="dimmed" fw={700} size="xs">
						Connections
					</Text>
					<ConnectionLegendItem label="HTTP call" variant="http" />
					<ConnectionLegendItem label="Message call" variant="messaging" />
					<ConnectionLegendItem label="Published event" variant="publication" />
				</Stack>
			</Group>
		</Stack>
	);
}

function ConnectionLegendItem({
	label,
	variant,
}: {
	label: string;
	variant: "http" | "messaging" | "publication";
}) {
	return (
		<Group gap={compactGap} wrap="nowrap">
			<span
				aria-hidden="true"
				className={styles.lineSwatch}
				data-variant={variant}
			/>
			<Text size="xs">{label}</Text>
		</Group>
	);
}

function StatusLegendItem({
	label,
	status,
}: {
	label: string;
	status: ProviderImpactStatus;
}) {
	return (
		<Group gap={compactGap} wrap="nowrap">
			<ProviderStatusMark status={status} />
			<Text size="xs">{label}</Text>
		</Group>
	);
}

function LegendItem({
	background,
	color,
	iconLabel,
	label,
	size = "medium",
	variant = "filled",
}: {
	background?: string;
	color: string;
	iconLabel?: string;
	label: string;
	size?: "medium" | "small";
	variant?: "dashed" | "filled" | "outline";
}) {
	return (
		<Group gap={compactGap} wrap="nowrap">
			<span
				aria-hidden="true"
				className={clsx(styles.swatch, styles[size], styles[variant])}
				style={{
					background:
						variant === "outline" ? "transparent" : (background ?? color),
					borderColor: color,
					borderStyle: variant === "dashed" ? "dashed" : "solid",
				}}
			>
				{iconLabel}
			</span>

			<Text size="xs">{label}</Text>
		</Group>
	);
}
