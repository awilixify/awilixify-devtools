import {
	Badge,
	Group,
	Paper,
	SimpleGrid,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import { useQueries } from "@tanstack/react-query";
import { withDevtoolsBasePath } from "@/devtools-fetch";
import { getDevtoolsSettings } from "@/api/settings/settings";
import {
	RefreshIcon,
	ServerIcon,
	ServerOffIcon,
} from "../app/icons";
import { useTargets } from "./TargetsContext";
import type { DevtoolsTarget } from "./target-config";

export function TargetsView() {
	const { targets } = useTargets();
	const connections = useQueries({
		queries: targets.map((target) => ({
			queryKey: ["devtools-target", target.serviceName],
			queryFn: ({ signal }: { signal: AbortSignal }) =>
				checkTargetConnection(target, signal),
			refetchInterval: 5000,
			retry: false,
		})),
	});
	const connectedCount = connections.filter(
		(connection) => connection.isSuccess,
	).length;

	return (
		<Stack gap="lg" maw={1040} mx="auto">
			<Group justify="space-between" align="end">
				<div>
					<Title order={1} size="h2">
						Targets
					</Title>
					<Text c="dimmed" size="sm">
						DevTools APIs available to this UI instance
					</Text>
				</div>
				<Group gap="xs">
					<Badge color="gray" variant="light">
						{targets.length} configured
					</Badge>
					<Badge color={connectedCount > 0 ? "teal" : "red"} variant="light">
						{connectedCount} connected
					</Badge>
				</Group>
			</Group>

			<SimpleGrid cols={{ base: 1, sm: 2 }}>
				{targets.map((target, index) => {
					const connection = connections[index];

					return (
						<Paper key={target.serviceName}>
							<Stack gap="md">
								<Group justify="space-between" wrap="nowrap">
									<Group gap="sm" wrap="nowrap">
										{connection?.isSuccess ? (
											<ServerIcon color="var(--mantine-color-teal-6)" />
										) : (
											<ServerOffIcon color="var(--mantine-color-gray-6)" />
										)}
										<div>
											<Text fw={700}>{target.serviceName}</Text>
										</div>
									</Group>
									<TargetStatus
										error={connection?.isError ?? false}
										loading={connection?.isPending ?? true}
									/>
								</Group>

								<Text c="dimmed" size="sm">
									{connection?.data?.appUrl ?? target.basePath}
								</Text>
							</Stack>
						</Paper>
					);
				})}
			</SimpleGrid>
		</Stack>
	);
}

function TargetStatus({
	error,
	loading,
}: {
	error: boolean;
	loading: boolean;
}) {
	if (loading) {
		return (
			<Badge
				color="gray"
				leftSection={<RefreshIcon size={12} />}
				variant="light"
			>
				Connecting
			</Badge>
		);
	}

	return (
		<Badge color={error ? "red" : "teal"} variant="light">
			{error ? "Unavailable" : "Connected"}
		</Badge>
	);
}

async function checkTargetConnection(
	target: DevtoolsTarget,
	signal: AbortSignal,
) {
	const settings = await getDevtoolsSettings(
		withDevtoolsBasePath(target.basePath, { signal }),
	);

	if (settings.serviceName !== target.serviceName) {
		throw new Error(
			`Expected service "${target.serviceName}", received "${settings.serviceName}"`,
		);
	}

	return settings;
}
