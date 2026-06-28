import { HoverCard, Stack, Text } from "@mantine/core";
import type { ModuleFlowNode } from "../../types";
import styles from "./ModuleNode.module.css";
import { ProviderGroup } from "./ProviderGroup";

export function GlobalProvidersHover({
	data,
}: {
	data: ModuleFlowNode["data"];
}) {
	if (
		data.kind === "global" ||
		data.globalProviderGroupsDetailed.length === 0
	) {
		return null;
	}

	return (
		<HoverCard openDelay={150} position="bottom-end" shadow="md" withArrow>
			<HoverCard.Target>
				<button
					aria-label="Show exported global members"
					className={styles.globalProvidersTrigger}
					onClick={(event) => event.stopPropagation()}
					onPointerDown={(event) => event.stopPropagation()}
					type="button"
				>
					G
				</button>
			</HoverCard.Target>
			<HoverCard.Dropdown
				className={styles.globalProvidersPopover}
				onClick={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<Stack gap={8}>
					<Text c="dimmed" fw={700} size="xs">
						Exported global members
					</Text>
					{data.globalProviderGroupsDetailed.map((group) => (
						<ProviderGroup
							data={data}
							group={group}
							groupKey={`global-hover:${group.moduleId}`}
							key={group.moduleId}
							providerPlaygroundModuleId={group.moduleId}
							showHandles={false}
							showGroupColor={false}
							showMembers
							tag="global"
							width={250}
						/>
					))}
				</Stack>
			</HoverCard.Dropdown>
		</HoverCard>
	);
}
