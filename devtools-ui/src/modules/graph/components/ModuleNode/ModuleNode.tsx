import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import clsx from "clsx";
import { useGraphSettings } from "../../GraphSettingsContext";
import {
	CALLED_OPERATION_HANDLE_ID,
	MODULE_SOURCE_HANDLE_ID,
	MODULE_TARGET_HANDLE_ID,
	OWN_OPERATION_HANDLE_ID,
} from "../../operation-handles";
import type { ModuleFlowNode } from "../../types";
import { EntrypointsHover } from "./EntrypointsHover";
import { GlobalProvidersHover } from "./GlobalProvidersHover";
import { HighlightedText } from "./HighlightedText";
import styles from "./ModuleNode.module.css";
import { ModuleStatsHover } from "./ModuleStatsHover";
import { ProviderGroup } from "./ProviderGroup";

export function ModuleNode({ data, selected }: NodeProps<ModuleFlowNode>) {
	const { searchQuery, viewMode } = useGraphSettings();
	const isProviderMode = viewMode === "providers";
	const moduleTitle = getModuleTitle(data);

	return (
		<Paper
			className={clsx(styles.node, {
				[styles.providerMode]: isProviderMode,
				[styles.withProviderRelation]: data.providerRelationColor,
			})}
			component="article"
			data-module-node
			data-selected={selected ? "true" : undefined}
			shadow="md"
			style={{
				"--module-node-border-color": data.providerRelationColor,
			}}
		>
			{!isProviderMode && (
				<Handle
					id={MODULE_TARGET_HANDLE_ID}
					type="target"
					position={Position.Left}
				/>
			)}
			<Handle
				id={OWN_OPERATION_HANDLE_ID}
				type="target"
				position={Position.Top}
			/>
			<Handle
				id={CALLED_OPERATION_HANDLE_ID}
				type="source"
				position={Position.Bottom}
			/>

			<Group gap={6} justify="space-between" wrap="nowrap">
				<Text component="strong" fw={700} truncate>
					<HighlightedText query={searchQuery} text={moduleTitle} />
				</Text>
				<Group gap={4} wrap="nowrap">
					<ModuleStatsHover data={data} />
					<EntrypointsHover data={data} />
					<GlobalProvidersHover data={data} />
				</Group>
			</Group>

			{isProviderMode && (
				<Stack className={styles.providerGroups} gap={10}>
					<ProviderGroup data={data} groupKey="own" />
					{data.importedProviderGroups.map((group) => (
						<ProviderGroup
							data={data}
							group={group}
							groupKey={group.moduleId}
							key={group.moduleId}
						/>
					))}
				</Stack>
			)}

			{!isProviderMode && (
				<Group gap={8}>
					<Badge
						className={clsx(styles.moduleRelationBadge, styles.dependency)}
						radius="sm"
						variant="light"
					>
						{data.dependencyCount} deps
					</Badge>
					<Badge
						className={clsx(styles.moduleRelationBadge, styles.dependent)}
						radius="sm"
						variant="light"
					>
						{data.dependentCount} dependents
					</Badge>
				</Group>
			)}

			{!isProviderMode && (
				<Handle
					id={MODULE_SOURCE_HANDLE_ID}
					type="source"
					position={Position.Right}
				/>
			)}
		</Paper>
	);
}

function getModuleTitle(data: ModuleFlowNode["data"]): string {
	return data.grouped ? `${data.name} (${data.instanceCount})` : data.name;
}
