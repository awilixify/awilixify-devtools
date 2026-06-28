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

export function AppShell() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<MantineAppShell navbar={{ width: 72, breakpoint: "sm" }} padding="lg">
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
					</Stack>
				</Stack>
			</MantineAppShell.Navbar>

			<MantineAppShell.Main>
				<Outlet />
			</MantineAppShell.Main>
		</MantineAppShell>
	);
}

function GraphIcon() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="20"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width="20"
		>
			<circle cx="6" cy="6" r="3" />
			<circle cx="18" cy="6" r="3" />
			<circle cx="12" cy="18" r="3" />
			<path d="M8.7 7.4 10.8 15" />
			<path d="m15.3 7.4-2.1 7.6" />
		</svg>
	);
}

function RoutesIcon() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="20"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width="20"
		>
			<path d="M4 7h16" />
			<path d="M4 17h16" />
			<path d="M7 4v6" />
			<path d="M17 14v6" />
		</svg>
	);
}
