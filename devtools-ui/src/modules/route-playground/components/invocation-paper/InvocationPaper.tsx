import { Paper, SegmentedControl, Stack } from "@mantine/core";
import {
	type RoutePlaygroundMode,
	RoutePlaygroundModes,
	useRoutePlaygroundSettings,
} from "../../use-route-playground-settings";
import { EntrypointInvocationPaper } from "./EntrypointInvocationPaper";
import { MediatorInvocationPaper } from "./MediatorInvocationPaper";
import { MiddlewareInvocationPaper } from "./MiddlewareInvocationPaper";
import { ProviderInvocationPaper } from "./ProviderInvocationPaper";
import { RouteInvocationPaper } from "./RouteInvocationPaper";

export function InvocationPaper() {
	const { playgroundMode, setPlaygroundMode } = useRoutePlaygroundSettings();

	return (
		<Paper
			style={{
				flex: 1,
			}}
		>
			<Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
				<SegmentedControl
					data={[
						{ label: "Route", value: RoutePlaygroundModes.route },
						{ label: "Entrypoints", value: RoutePlaygroundModes.entrypoint },
						{ label: "Provider", value: RoutePlaygroundModes.provider },
						{ label: "Mediator", value: RoutePlaygroundModes.mediator },
						{ label: "Middlewares", value: RoutePlaygroundModes.middleware },
					]}
					fullWidth
					onChange={(value) => setPlaygroundMode(value as RoutePlaygroundMode)}
					value={playgroundMode}
				/>

				{playgroundMode === RoutePlaygroundModes.route && (
					<RouteInvocationPaper />
				)}
				{playgroundMode === RoutePlaygroundModes.entrypoint && (
					<EntrypointInvocationPaper />
				)}
				{playgroundMode === RoutePlaygroundModes.provider && (
					<ProviderInvocationPaper />
				)}
				{playgroundMode === RoutePlaygroundModes.mediator && (
					<MediatorInvocationPaper />
				)}
				{playgroundMode === RoutePlaygroundModes.middleware && (
					<MiddlewareInvocationPaper />
				)}
			</Stack>
		</Paper>
	);
}
