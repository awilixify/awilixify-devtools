import {
	Checkbox,
	Group,
	Paper,
	Stack,
	Text,
	Tooltip,
	UnstyledButton,
} from "@mantine/core";
import { FilterIcon } from "../../app/icons";
import styles from "./OverviewedApps.module.css";

export type OverviewedApp = {
	background: string;
	color: string;
	name: string;
	visible: boolean;
};

export function OverviewedApps({
	apps,
	onCenter,
	onVisibilityChange,
}: {
	apps: OverviewedApp[];
	onCenter: (serviceName: string) => void;
	onVisibilityChange: (serviceName: string, visible: boolean) => void;
}) {
	const visibleCount = apps.filter((app) => app.visible).length;

	return (
		<Paper className={styles.overview} p="xs" radius="md" shadow="sm">
			<Group gap="xs" justify="space-between" mb="xs" wrap="nowrap">
				<Text c="dimmed" fw={700} size="xs" tt="uppercase">
					Overviewed apps
				</Text>
				<Tooltip label="Filter services" position="left" withArrow>
					<span>
						<FilterIcon size={16} />
					</span>
				</Tooltip>
			</Group>

			<Stack gap={6}>
				{apps.map((app) => (
					<Group
						className={styles.serviceRow}
						gap="xs"
						key={app.name}
						style={{ background: app.background }}
						wrap="nowrap"
					>
						<Checkbox
							aria-label={`Show ${app.name}`}
							checked={app.visible}
							disabled={app.visible && visibleCount === 1}
							onChange={(event) =>
								onVisibilityChange(app.name, event.currentTarget.checked)
							}
							size="xs"
						/>
						<UnstyledButton
							className={styles.serviceButton}
							disabled={!app.visible}
							onClick={() => onCenter(app.name)}
						>
							<Text fw={600} size="sm" truncate>
								{app.name}
							</Text>
						</UnstyledButton>
					</Group>
				))}
			</Stack>
		</Paper>
	);
}
