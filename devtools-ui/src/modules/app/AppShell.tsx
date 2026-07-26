import {
	ActionIcon,
	Box,
	AppShell as MantineAppShell,
	Stack,
	Text,
	Title,
	Tooltip,
} from "@mantine/core";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { GraphIcon, RoutesIcon, TargetsIcon } from "./icons";

export function AppShell() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	return (
		<MantineAppShell navbar={{ width: 60, breakpoint: "sm" }} padding="lg">
			<MantineAppShell.Navbar p="sm">
				<Stack align="center" gap="xl">
					<Box ta="center">
						<Text c="dimmed" size="xs" fw={700} tt="uppercase">
							AWX
						</Text>
						<Title order={1} size="h4">
							DT
						</Title>
					</Box>

					<Stack gap="xs" component="nav" aria-label="DevTools sections">
						<Tooltip label="Graph" position="right" withArrow>
							<ActionIcon
								aria-label="Graph"
								color={pathname === "/" ? "teal" : "gray"}
								component={Link}
								size="lg"
								to="/"
								variant={pathname === "/" ? "light" : "subtle"}
							>
								<GraphIcon />
							</ActionIcon>
						</Tooltip>
						<Tooltip label="Playground" position="right" withArrow>
							<ActionIcon
								aria-label="Playground"
								color={pathname === "/routes" ? "teal" : "gray"}
								component={Link}
								size="lg"
								to="/routes"
								variant={pathname === "/routes" ? "light" : "subtle"}
							>
								<RoutesIcon />
							</ActionIcon>
						</Tooltip>
						<Tooltip label="Targets" position="right" withArrow>
							<ActionIcon
								aria-label="Targets"
								color={pathname === "/targets" ? "teal" : "gray"}
								component={Link}
								size="lg"
								to="/targets"
								variant={pathname === "/targets" ? "light" : "subtle"}
							>
								<TargetsIcon />
							</ActionIcon>
						</Tooltip>
					</Stack>
				</Stack>
			</MantineAppShell.Navbar>

			<MantineAppShell.Main>
				<Box>
					<Outlet />
				</Box>
			</MantineAppShell.Main>
		</MantineAppShell>
	);
}
