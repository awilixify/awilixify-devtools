import { Center, Grid, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { Suspense } from "react";

import { InvocationPaper } from "./components/invocation-paper/InvocationPaper";
import { TraceDetailsPaper } from "./components/TraceDetailsPaper";
import { TraceHistoryPaper } from "./components/TraceHistoryPaper";

export function RoutePlaygroundView() {
	return (
		<Stack gap="md">
			<Group align="flex-start" justify="space-between">
				<Stack gap={2}>
					<Title order={2}>Playground</Title>
					<Text c="dimmed" size="sm">
						Send route requests or invoke live providers with shared trace
						history.
					</Text>
				</Stack>
			</Group>

			{/* The papers suspend on the module graph query; show a page loader
			    instead of a blank area until it resolves. */}
			<Suspense
				fallback={
					<Center style={{ height: "88vh" }}>
						<Stack align="center" gap="xs">
							<Loader />
							<Text c="dimmed" size="sm">
								Loading...
							</Text>
						</Stack>
					</Center>
				}
			>
				<Grid gap="md" align="stretch">
					<Grid.Col span={{ base: 12, lg: 4 }}>
						<Stack
							gap="md"
							style={{
								height: "88vh",
							}}
						>
							<InvocationPaper />

							<TraceHistoryPaper />
						</Stack>
					</Grid.Col>

					<Grid.Col span={{ base: 12, lg: 8 }}>
						<TraceDetailsPaper />
					</Grid.Col>
				</Grid>
			</Suspense>
		</Stack>
	);
}
