import { HoverCard, Stack, Text } from "@mantine/core";
import type { ModuleFlowNode, ModuleStatCount } from "../../types";
import styles from "./ModuleNode.module.css";

export function ModuleStatsHover({ data }: { data: ModuleFlowNode["data"] }) {
	const ownProviders = data.providers.length;
	const importedProviders = data.importedProviderGroups.reduce(
		(sum, group) => sum + group.providers.length,
		0,
	);
	const globalProviders = data.globalProviderGroupsDetailed
		.filter((group) => group.moduleId !== data.id)
		.reduce((sum, group) => sum + group.providers.length, 0);
	const availableProviders = ownProviders + importedProviders + globalProviders;
	const providers = {
		available: availableProviders,
		global: globalProviders,
		imported: importedProviders,
		own: ownProviders,
	};

	return (
		<HoverCard openDelay={150} position="bottom-end" shadow="md" withArrow>
			<HoverCard.Target>
				<button
					aria-label="Show module statistics"
					className={styles.moduleStatsTrigger}
					onClick={(event) => event.stopPropagation()}
					onPointerDown={(event) => event.stopPropagation()}
					type="button"
				>
					i
				</button>
			</HoverCard.Target>
			<HoverCard.Dropdown
				className={styles.moduleStatsPopover}
				onClick={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<Stack gap={6}>
					<Text c="dimmed" fw={700} size="xs">
						Module statistics
					</Text>
					<StatRow label="Providers" value={providers} />
					<StatRow label="Controllers" value={data.controllers.length} />
					<StatRow
						label="Imports"
						value={data.moduleStats.imports}
						withOwn={false}
					/>
					<StatRow label="Used by" value={data.dependentCount} />
					<StatRow label="Initializers" value={data.moduleStats.initializers} />
					<StatRow label="Interceptors" value={data.moduleStats.interceptors} />
					<StatRow label="Middlewares" value={data.moduleStats.middlewares} />
				</Stack>
			</HoverCard.Dropdown>
		</HoverCard>
	);
}

function StatRow({
	label,
	value,
	withOwn = true,
}: {
	label: string;
	value: ModuleStatCount | number;
	withOwn?: boolean;
}) {
	const formattedValue =
		typeof value === "number"
			? { details: [], main: String(value) }
			: formatCount(value, { withOwn });

	return (
		<div className={styles.moduleStatsRow}>
			<Text c="dimmed" size="xs">
				{label}
			</Text>
			<Text fw={700} size="xs" ta="right">
				{formattedValue.main}
			</Text>
			<Text c="dimmed" fs="italic" fw={500} size="10px">
				{formattedValue.details.length > 0
					? `(${formattedValue.details.join(", ")})`
					: ""}
			</Text>
		</div>
	);
}

function formatCount(
	{ available, global, imported, own }: ModuleStatCount,
	{ withOwn }: { withOwn: boolean },
): {
	details: string[];
	main: string;
} {
	const details = [
		withOwn && own > 0 ? `${own} own` : null,
		imported > 0 ? `${imported} imported` : null,
		global > 0 ? `${global} global` : null,
	].filter((part): part is string => Boolean(part));

	return {
		details,
		main: String(available),
	};
}
