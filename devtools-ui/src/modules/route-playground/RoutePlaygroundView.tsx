import { Center, Grid, Loader, Paper, Stack } from "@mantine/core";
import { type CSSProperties, Suspense } from "react";

import { InvocationPaper } from "./components/invocation-paper/InvocationPaper";
import { TraceDetailsPaper } from "./components/TraceDetailsPaper";
import { TraceHistoryPaper } from "./components/TraceHistoryPaper";
import { useTraceStream } from "./use-trace-stream";

export function RoutePlaygroundView() {
	// Live-push new traces (and async distributed legs) into the query cache.
	useTraceStream();

	return (
		<Stack gap="md">
			<Grid align="stretch" gap="md">
				<Grid.Col span={{ base: 12, lg: 4 }}>
					<Stack
						gap="md"
						style={{
							height: "calc(100vh - 50px)",
							minHeight: 760,
						}}
					>
						<Suspense
							fallback={<PanelLoader style={{ flex: 1, minHeight: 420 }} />}
						>
							<InvocationPaper />
						</Suspense>

						<Suspense
							fallback={<PanelLoader style={{ flex: 1.25, minHeight: 420 }} />}
						>
							<TraceHistoryPaper />
						</Suspense>
					</Stack>
				</Grid.Col>

				<Grid.Col span={{ base: 12, lg: 8 }}>
					<Suspense
						fallback={
							<PanelLoader
								style={{ height: "calc(100vh - 50px)", minHeight: 760 }}
							/>
						}
					>
						<TraceDetailsPaper />
					</Suspense>
				</Grid.Col>
			</Grid>
		</Stack>
	);
}

function PanelLoader({ style }: { style: CSSProperties }) {
	return (
		<Paper style={{ ...style, display: "flex" }}>
			<Center style={{ flex: 1 }}>
				<Loader size="sm" />
			</Center>
		</Paper>
	);
}
