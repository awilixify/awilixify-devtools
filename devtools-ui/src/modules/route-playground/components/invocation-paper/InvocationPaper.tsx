import {
	Box,
	Group,
	Paper,
	SegmentedControl,
	Select,
	Stack,
} from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { getServiceColor } from "../../../graph/service-colors";
import { useTargets } from "../../../targets/TargetsContext";
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
	const { selectedTarget, selectTarget, targets } = useTargets();
	const navigate = useNavigate({ from: "/routes" });

	// Switching the invocation target reroutes the whole playground, so drop the
	// mode-specific params (and the selected trace) that belong to the old
	// service. Mirrors the previous page-level service selector.
	const selectService = (serviceName: string | null) => {
		if (!serviceName || serviceName === selectedTarget.serviceName) return;

		selectTarget(serviceName);
		navigate({
			replace: true,
			search: (previous) => ({
				...previous,
				entrypoint: undefined,
				handler: undefined,
				method: undefined,
				middleware: undefined,
				middlewares: undefined,
				module: undefined,
				provider: undefined,
				route: undefined,
				state: undefined,
				trace: undefined,
			}),
		});
	};

	return (
		<Paper
			style={{
				borderLeft: `3px solid ${getServiceColor(selectedTarget.serviceName)}`,
				flex: 1,
				minHeight: 420,
				overflow: "hidden",
			}}
		>
			<Stack gap="md" style={{ height: "100%", minHeight: 0 }}>
				<Group gap="xs" wrap="nowrap">
					<Select
						allowDeselect={false}
						aria-label="Playground service"
						data={targets.map((target) => ({
							label: target.serviceName,
							value: target.serviceName,
						}))}
						onChange={selectService}
						value={selectedTarget.serviceName}
						w={150}
					/>

					<SegmentedControl
						data={[
							{ label: "Route", value: RoutePlaygroundModes.route },
							{ label: "Entrypoints", value: RoutePlaygroundModes.entrypoint },
							{ label: "Provider", value: RoutePlaygroundModes.provider },
							{ label: "Mediator", value: RoutePlaygroundModes.mediator },
							{ label: "Middlewares", value: RoutePlaygroundModes.middleware },
						]}
						onChange={(value) =>
							setPlaygroundMode(value as RoutePlaygroundMode)
						}
						style={{ flex: 1 }}
						value={playgroundMode}
					/>
				</Group>

				<Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
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
				</Box>
			</Stack>
		</Paper>
	);
}
