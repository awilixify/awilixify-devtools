import { Group, HoverCard, ScrollArea, Stack, Text } from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { LifetimeType, ModuleGraphNode } from "@/api/model";
import { formatEntrypointId } from "../../../route-playground/components/invocation-paper/EntrypointInvocationPaper";
import type { RoutePlaygroundSearch } from "../../../route-playground/route";
import { RoutePlaygroundModes } from "../../../route-playground/use-route-playground-settings";
import type { ModuleFlowNode } from "../../types";
import drawerStyles from "../ModuleDrawer/ModuleInspector.module.css";
import styles from "./ModuleNode.module.css";
import { LifetimeTypeIcon } from "./ProviderIcons";

export function EntrypointsHover({ data }: { data: ModuleFlowNode["data"] }) {
	const navigate = useNavigate({ from: "/" });
	const nonHttpGroups = groupEntrypointsByType(
		data.entrypoints.filter((entrypoint) => entrypoint.type !== "http"),
	);
	const total =
		data.routes.length +
		nonHttpGroups.reduce((count, group) => count + group.entrypoints.length, 0);

	if (total === 0) return null;

	const openRouteInPlayground = (route: ModuleGraphNode["routes"][number]) => {
		navigate({
			to: "/routes",
			search: {
				mode: RoutePlaygroundModes.route,
				route: formatRouteId(data.id, route),
			} satisfies RoutePlaygroundSearch,
		});
	};

	const openEntrypointInPlayground = (
		entrypoint: ModuleGraphNode["entrypoints"][number],
	) => {
		navigate({
			to: "/routes",
			search: {
				entrypoint: formatEntrypointId(data.id, entrypoint),
				mode: RoutePlaygroundModes.entrypoint,
				module: data.id,
			} satisfies RoutePlaygroundSearch,
		});
	};

	return (
		<HoverCard openDelay={150} position="bottom-end" shadow="md" withArrow>
			<HoverCard.Target>
				<button
					aria-label="Show entrypoints"
					className={styles.entrypointsTrigger}
					onClick={(event) => event.stopPropagation()}
					onPointerDown={(event) => event.stopPropagation()}
					type="button"
				>
					E
				</button>
			</HoverCard.Target>
			<HoverCard.Dropdown
				className={styles.entrypointsPopover}
				onClick={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<Stack gap={8}>
					<Group gap="sm" justify="space-between">
						<Text c="dimmed" fw={700} size="xs">
							Entrypoints
						</Text>
						<Text c="dimmed" fw={700} size="xs">
							{total}
						</Text>
					</Group>

					{data.routes.length > 0 && (
						<EntrypointSubGroup count={data.routes.length} label="HTTP">
							{data.routes.map((route) => (
								<RouteCard
									key={formatRouteKey(route)}
									lifetime={data.controllerLifetimeTypes[route.controller]}
									onClick={() => openRouteInPlayground(route)}
									route={route}
								/>
							))}
						</EntrypointSubGroup>
					)}

					{nonHttpGroups.map((group) => (
						<EntrypointSubGroup
							count={group.entrypoints.length}
							key={group.type}
							label={prettyEntrypointType(group.type)}
						>
							{group.entrypoints.map((entrypoint) => (
								<EntrypointCard
									entrypoint={entrypoint}
									key={formatEntrypointKey(entrypoint)}
									lifetime={data.controllerLifetimeTypes[entrypoint.controller]}
									onClick={() => openEntrypointInPlayground(entrypoint)}
								/>
							))}
						</EntrypointSubGroup>
					))}
				</Stack>
			</HoverCard.Dropdown>
		</HoverCard>
	);
}

function EntrypointSubGroup({
	label,
	count,
	children,
}: {
	label: string;
	count: number;
	children: ReactNode;
}) {
	return (
		<Stack gap={6}>
			<Group gap="sm" justify="space-between">
				<Text c="dimmed" fw={700} size="xs" tt="capitalize">
					{label}
				</Text>
				<Text c="dimmed" fw={700} size="xs">
					{count}
				</Text>
			</Group>
			<ScrollArea.Autosize className={drawerStyles.cardScroll} mah={196}>
				<Stack className={drawerStyles.cardList} gap={8}>
					{children}
				</Stack>
			</ScrollArea.Autosize>
		</Stack>
	);
}

function RouteCard({
	lifetime,
	route,
	onClick,
}: {
	lifetime?: LifetimeType;
	route: ModuleGraphNode["routes"][number];
	onClick: () => void;
}) {
	return (
		<Group
			align="flex-start"
			className={drawerStyles.clickableCard}
			gap={8}
			onClick={onClick}
			p={6}
			wrap="nowrap"
		>
			<Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
				<Text className={drawerStyles.entrypointDecorator} size="xs" truncate>
					<span className={drawerStyles.decoratorName}>@{route.method}</span>
					<span className={drawerStyles.decoratorPunct}>(</span>
					<span className={drawerStyles.decoratorArg}>'{route.path}'</span>
					<span className={drawerStyles.decoratorPunct}>)</span>
				</Text>
				<Text fw={500} size="sm" truncate>
					{route.controller}.{route.handler}
				</Text>
			</Stack>
			<LifetimeTypeIcon lifetime={lifetime} />
		</Group>
	);
}

function EntrypointCard({
	entrypoint,
	lifetime,
	onClick,
}: {
	entrypoint: ModuleGraphNode["entrypoints"][number];
	lifetime?: LifetimeType;
	onClick: () => void;
}) {
	const decorator = getEntrypointDecorator(entrypoint);

	return (
		<Group
			align="flex-start"
			className={drawerStyles.clickableCard}
			gap={8}
			onClick={onClick}
			p={6}
			wrap="nowrap"
		>
			<Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
				{decorator && (
					<Text className={drawerStyles.entrypointDecorator} size="xs" truncate>
						<span className={drawerStyles.decoratorName}>
							@{decorator.name}
						</span>
						{decorator.argument && (
							<>
								<span className={drawerStyles.decoratorPunct}>(</span>
								<span className={drawerStyles.decoratorArg}>
									{decorator.argument}
								</span>
								<span className={drawerStyles.decoratorPunct}>)</span>
							</>
						)}
					</Text>
				)}
				<Text fw={500} size="sm" truncate>
					{formatEntrypointName(entrypoint)}
				</Text>
			</Stack>
			<LifetimeTypeIcon lifetime={lifetime} />
		</Group>
	);
}

function getEntrypointDecorator(
	entrypoint: ModuleGraphNode["entrypoints"][number],
): { name: string; argument: string | null } | null {
	if (!entrypoint.decoratorName) return null;

	return {
		name: entrypoint.decoratorName,
		argument:
			entrypoint.label && entrypoint.label !== entrypoint.type
				? entrypoint.label
				: null,
	};
}

function formatRouteKey(route: ModuleGraphNode["routes"][number]): string {
	return `${route.method}:${route.path}:${route.controller}:${route.handler}`;
}

function formatRouteId(
	moduleId: string,
	route: ModuleGraphNode["routes"][number],
): string {
	return `${moduleId}:${route.method}:${route.path}:${route.controller}:${route.handler}`;
}

function formatEntrypointName(
	entrypoint: ModuleGraphNode["entrypoints"][number],
): string {
	return `${entrypoint.controller}.${entrypoint.handler}`;
}

function formatEntrypointKey(
	entrypoint: ModuleGraphNode["entrypoints"][number],
): string {
	return `${entrypoint.type}:${entrypoint.label}:${entrypoint.controller}:${entrypoint.handler}:${entrypoint.initializerKey}`;
}

function groupEntrypointsByType(
	entrypoints: ModuleGraphNode["entrypoints"],
): { type: string; entrypoints: ModuleGraphNode["entrypoints"] }[] {
	const byType = new Map<string, ModuleGraphNode["entrypoints"]>();

	for (const entrypoint of entrypoints) {
		byType.set(entrypoint.type, [
			...(byType.get(entrypoint.type) ?? []),
			entrypoint,
		]);
	}

	return [...byType.entries()].map(([type, grouped]) => ({
		type,
		entrypoints: grouped,
	}));
}

const ENTRYPOINT_TYPE_LABELS: Record<string, string> = {
	amqp: "RabbitMQ",
	cron: "Cron",
	event: "Events",
	rabbit: "RabbitMQ",
	rabbitmq: "RabbitMQ",
	schedule: "Cron",
};

function prettyEntrypointType(type: string): string {
	return (
		ENTRYPOINT_TYPE_LABELS[type.toLowerCase()] ??
		`${type.charAt(0).toUpperCase()}${type.slice(1)}`
	);
}
