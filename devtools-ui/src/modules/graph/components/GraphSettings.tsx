import { Stack, Switch, Text } from "@mantine/core";
import type { ChangeEvent } from "react";
import { useGraphSettings } from "../GraphSettingsContext";

export function GraphSettings() {
	const {
		groupDynamicModules,
		impactOnly,
		selectedModuleAvailable,
		setGroupDynamicModules,
		setImpactOnly,
		setShowRelatedOnly,
		showRelatedOnly,
	} = useGraphSettings();

	return (
		<Stack gap="xs" align="stretch">
			<Text c="dimmed" size="xs" fw={700} tt="uppercase">
				Settings
			</Text>
			<Switch
				checked={showRelatedOnly}
				disabled={!selectedModuleAvailable}
				label="Related only"
				onChange={(event: ChangeEvent<HTMLInputElement>) =>
					setShowRelatedOnly(event.currentTarget.checked)
				}
			/>
			<Switch
				checked={impactOnly}
				label="Impact only"
				onChange={(event: ChangeEvent<HTMLInputElement>) =>
					setImpactOnly(event.currentTarget.checked)
				}
			/>
			<Switch
				checked={groupDynamicModules}
				label="Group dynamic"
				onChange={(event: ChangeEvent<HTMLInputElement>) =>
					setGroupDynamicModules(event.currentTarget.checked)
				}
			/>
		</Stack>
	);
}
