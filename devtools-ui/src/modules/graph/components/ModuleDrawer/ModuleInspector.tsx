import {
	Badge,
	Box,
	Code,
	Divider,
	Group,
	HoverCard,
	ScrollArea,
	Stack,
	Text,
} from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	type ReactNode,
} from "react";
import { useGetDevtoolsGraphModulesModuleId } from "@/api/graph/graph";
import type {
	AvailableModuleFeature,
	GetModuleDetailsResponse,
	LifetimeType,
	ModuleGraphNode,
} from "@/api/model";
import { formatEntrypointId } from "../../../route-playground/components/invocation-paper/EntrypointInvocationPaper";
import type { RoutePlaygroundSearch } from "../../../route-playground/route";
import { RoutePlaygroundModes } from "../../../route-playground/use-route-playground-settings";
import { useGraphSettings } from "../../GraphSettingsContext";
import type { ModuleNodeData } from "../../types";
import { ProviderGroup } from "../ModuleNode/ProviderGroup";
import { LifetimeTypeIcon } from "../ModuleNode/ProviderIcons";
import styles from "./ModuleInspector.module.css";

type ModuleInspectorProps = {
	module: ModuleNodeData | null;
};

export function ModuleInspector({ module }: ModuleInspectorProps) {
	// Grouping happens on the client, so a grouped node's synthetic "group:*" id
	// isn't known to the backend. Resolve details from a real underlying instance
	// id instead (instances share the same structural details).
	const detailsModuleId = module ? getDetailsModuleId(module) : "";
	const detailsQuery = useGetDevtoolsGraphModulesModuleId(detailsModuleId, {
		query: { enabled: module !== null },
	});

	if (!module) {
		return null;
	}

	const details = detailsQuery.data ?? emptyModuleDetails(module);
	const availableDecorators = details.availableDecorators;
	// Interceptors moved to a FeatureStatRow above; only the clickable
	// prehandlers render as full sections now.
	const hasFeatureSections =
		details.availableQueryPreHandlerDetails.length > 0 ||
		details.availableCommandPreHandlerDetails.length > 0;

	return (
		<Stack gap="md" aria-label="Module inspector">
			<Stack gap={8}>
				<StatRow
					label="Providers"
					value={<ProviderCountValue module={module} />}
				/>
				<StatRow label="Controllers" value={module.controllers.length} />
				<ModuleRefStatRow
					detailsTitle="Imported & global modules"
					label="Imports"
					modules={[
						...details.importedModules.map((name) => ({ name })),
						...details.globalModules.map((name) => ({
							name,
							tag: "global",
						})),
					]}
				/>
				<ModuleRefStatRow
					detailsTitle="Used by modules"
					label="Used by"
					modules={details.usedByModules.map((name) => ({ name }))}
				/>
				<FeatureStatRow
					availableDecorators={availableDecorators}
					details={details.availableInitializerDetails}
					label="Initializers"
				/>
				<FeatureStatRow
					availableDecorators={availableDecorators}
					details={details.availableInterceptorDetails}
					label="Interceptors"
				/>
			</Stack>

			<Divider />

			{hasFeatureSections && (
				<>
					<FeatureSections details={details} />
					<Divider />
				</>
			)}

			<EntrypointsSection
				controllerLifetimeTypes={details.module.controllerLifetimeTypes}
				entrypoints={details.entrypoints}
				moduleId={module.id}
				routes={details.routes}
			/>

			<Divider />

			<ProviderSections data={module} />
		</Stack>
	);
}

// HTTP routes, rabbit listeners, crons, etc. are all entrypoints into the
// module, so they share one section with a sub-group per type for visual
// grouping.
function EntrypointsSection({
	controllerLifetimeTypes,
	entrypoints,
	moduleId,
	routes,
}: {
	// Controller class name -> lifetime; entrypoints show their controller's
	// scoped/transient mark.
	controllerLifetimeTypes: Record<string, LifetimeType>;
	entrypoints: ModuleGraphNode["entrypoints"];
	moduleId: string;
	routes: ModuleGraphNode["routes"];
}) {
	const navigate = useNavigate({ from: "/" });
	const nonHttpGroups = groupEntrypointsByType(
		entrypoints.filter((entrypoint) => entrypoint.type !== "http"),
	);
	const total =
		routes.length +
		nonHttpGroups.reduce((count, group) => count + group.entrypoints.length, 0);

	const openRouteInPlayground = (route: ModuleGraphNode["routes"][number]) => {
		navigate({
			to: "/routes",
			search: {
				mode: RoutePlaygroundModes.route,
				route: formatRouteId(moduleId, route),
			} satisfies RoutePlaygroundSearch,
		});
	};

	const openEntrypointInPlayground = (
		entrypoint: ModuleGraphNode["entrypoints"][number],
	) => {
		navigate({
			to: "/routes",
			search: {
				entrypoint: formatEntrypointId(moduleId, entrypoint),
				mode: RoutePlaygroundModes.entrypoint,
				module: moduleId,
			} satisfies RoutePlaygroundSearch,
		});
	};

	return (
		<Stack gap={8}>
			<Group justify="space-between" gap="sm">
				<Text fw={700} size="sm">
					Entrypoints
				</Text>
				<Text c="dimmed" fw={700} size="sm">
					{total}
				</Text>
			</Group>

			{total === 0 ? (
				<Text c="dimmed" size="sm">
					No entrypoints
				</Text>
			) : (
				<Stack gap={12}>
					{routes.length > 0 && (
						<EntrypointSubGroup label="HTTP" count={routes.length}>
							{routes.map((route) => (
								<RouteCard
									key={formatRouteKey(route)}
									lifetime={controllerLifetimeTypes[route.controller]}
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
									lifetime={controllerLifetimeTypes[entrypoint.controller]}
									onClick={() => openEntrypointInPlayground(entrypoint)}
								/>
							))}
						</EntrypointSubGroup>
					))}
				</Stack>
			)}
		</Stack>
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
			<ScrollArea.Autosize className={styles.cardScroll} mah={196} type="auto">
				<Stack className={styles.cardList} gap={8}>
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
			className={styles.clickableCard}
			gap={8}
			onClick={onClick}
			p={6}
			wrap="nowrap"
		>
			<Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
				<Text className={styles.entrypointDecorator} size="xs" truncate>
					<span className={styles.decoratorName}>@{route.method}</span>
					<span className={styles.decoratorPunct}>(</span>
					<span className={styles.decoratorArg}>'{route.path}'</span>
					<span className={styles.decoratorPunct}>)</span>
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
			className={styles.clickableCard}
			gap={8}
			onClick={onClick}
			p={6}
			wrap="nowrap"
		>
			<Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
				{decorator && (
					<Text className={styles.entrypointDecorator} size="xs" truncate>
						<span className={styles.decoratorName}>@{decorator.name}</span>
						{decorator.argument && (
							<>
								<span className={styles.decoratorPunct}>(</span>
								<span className={styles.decoratorArg}>
									{decorator.argument}
								</span>
								<span className={styles.decoratorPunct}>)</span>
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

// The decorator that registered the entrypoint, e.g. "@onEvent(CatsViewedEvent)".
// The argument comes from the entrypoint's label (the decorator's metadata
// name); null when there's no meaningful argument.
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

const ENTRYPOINT_TYPE_LABELS: Record<string, string> = {
	amqp: "RabbitMQ",
	rabbit: "RabbitMQ",
	rabbitmq: "RabbitMQ",
	cron: "Cron",
	schedule: "Cron",
	event: "Events",
};

function prettyEntrypointType(type: string): string {
	return (
		ENTRYPOINT_TYPE_LABELS[type.toLowerCase()] ??
		`${type.charAt(0).toUpperCase()}${type.slice(1)}`
	);
}

function formatEntrypointName(
	entrypoint: ModuleGraphNode["entrypoints"][number],
): string {
	return `${entrypoint.controller}.${entrypoint.handler}`;
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

function formatEntrypointKey(
	entrypoint: ModuleGraphNode["entrypoints"][number],
): string {
	return `${entrypoint.type}:${entrypoint.label}:${entrypoint.controller}:${entrypoint.handler}:${entrypoint.initializerKey}`;
}

function formatRouteId(
	moduleId: string,
	route: ModuleGraphNode["routes"][number],
): string {
	return `${moduleId}:${route.method}:${route.path}:${route.controller}:${route.handler}`;
}

// The row summarizes provider reach as `available (own)`: the module's own
// providers plus everything reachable through imported and global modules,
// mirroring the grouped list in ProviderSections below. No tooltip — the
// section carries the names.
function ProviderCountValue({ module }: { module: ModuleNodeData }) {
	const own = module.providers.length;
	const available = own + countGroupedProviders(module);

	if (available === own) {
		return <>{own}</>;
	}

	return (
		<>
			{available}{" "}
			<Text component="span" c="dimmed" fw={400} size="sm">
				({own} own)
			</Text>
		</>
	);
}

function countGroupedProviders(module: ModuleNodeData): number {
	const imported = module.importedProviderGroups.reduce(
		(sum, group) => sum + group.providers.length,
		0,
	);
	const global = getVisibleGlobalProviderGroups(module).reduce(
		(sum, group) => sum + group.providers.length,
		0,
	);

	return imported + global;
}

// Global groups are graph-wide. Only drop the module's own group so a global
// module viewed in the drawer doesn't list its providers twice (once as "own",
// once as "global").
function getVisibleGlobalProviderGroups(
	module: ModuleNodeData,
): ModuleNodeData["globalProviderGroupsDetailed"] {
	return module.globalProviderGroupsDetailed.filter(
		(group) => group.moduleId !== module.id,
	);
}

function ProviderSections({ data }: { data: ModuleNodeData }) {
	const navigate = useNavigate({ from: "/" });
	// Global providers aren't owned by the viewed module, so the playground can't
	// resolve them in this scope — select them in their own (global) module
	// instead. Own/imported providers resolve fine from the viewed module.
	const openProviderInPlayground = (
		provider: string,
		moduleId: string = data.id,
	) => {
		navigate({
			to: "/routes",
			search: {
				mode: RoutePlaygroundModes.provider,
				module: moduleId,
				provider,
			} satisfies RoutePlaygroundSearch,
		});
	};

	const globalProviderGroups = getVisibleGlobalProviderGroups(data);

	return (
		<Stack gap={8}>
			<Text fw={700} size="sm">
				Providers
			</Text>
			<Stack gap={8}>
				<ProviderGroup
					data={data}
					groupKey="own"
					highlightExports={false}
					onProviderClick={openProviderInPlayground}
					showHandles={false}
				/>
				{data.importedProviderGroups.map((group) => (
					<ProviderGroup
						data={data}
						group={group}
						groupKey={group.moduleId}
						highlightExports={false}
						key={group.moduleId}
						onProviderClick={openProviderInPlayground}
						showHandles={false}
					/>
				))}
				{globalProviderGroups.map((group) => (
					<ProviderGroup
						data={data}
						group={group}
						groupKey={`global:${group.moduleId}`}
						highlightExports={false}
						key={`global:${group.moduleId}`}
						onProviderClick={(provider) =>
							openProviderInPlayground(provider, group.moduleId)
						}
						showHandles={false}
						tag="global"
					/>
				))}
			</Stack>
		</Stack>
	);
}

function FeatureSections({ details }: { details: GetModuleDetailsResponse }) {
	const navigate = useNavigate({ from: "/" });

	// Pre-handlers are the standalone middlewares: they share the uniform
	// execute(payload, context, executionContext) signature and open in the
	// middleware playground, resolved by their own module + registration key.
	const openMiddlewareInPlayground = (item: AvailableModuleFeature) => {
		navigate({
			to: "/routes",
			search: {
				middleware: item.key,
				mode: RoutePlaygroundModes.middleware,
				module: item.moduleName,
			} satisfies RoutePlaygroundSearch,
		});
	};

	return (
		<Stack gap={12}>
			<FeatureSection
				details={details.availableQueryPreHandlerDetails}
				label="Query prehandlers"
				onItemClick={openMiddlewareInPlayground}
			/>
			<FeatureSection
				details={details.availableCommandPreHandlerDetails}
				label="Command prehandlers"
				onItemClick={openMiddlewareInPlayground}
			/>
		</Stack>
	);
}

function FeatureSection({
	details,
	label,
	onItemClick,
}: {
	details: AvailableModuleFeature[];
	label: string;
	onItemClick?: (item: AvailableModuleFeature) => void;
}) {
	if (details.length === 0) return null;

	return (
		<Stack gap={8}>
			<Group gap="sm" justify="space-between">
				<Text fw={700} size="sm">
					{label}
				</Text>
				<Text c="dimmed" fw={700} size="sm">
					{details.length}
				</Text>
			</Group>
			<ScrollArea.Autosize className={styles.cardScroll} mah={196} type="auto">
				<Stack className={styles.cardList} gap={8}>
					{details.map((item) => (
						<FeatureItem
							item={item}
							key={item.key}
							onClick={onItemClick ? () => onItemClick(item) : undefined}
						/>
					))}
				</Stack>
			</ScrollArea.Autosize>
		</Stack>
	);
}

function FeatureItem({
	item,
	onClick,
}: {
	item: AvailableModuleFeature;
	onClick?: () => void;
}) {
	return (
		<Group
			align="center"
			className={styles.clickableCard}
			gap={8}
			onClick={onClick}
			p={6}
			wrap="nowrap"
		>
			<Stack gap={3} style={{ flex: 1, minWidth: 0 }}>
				<Group gap={0} style={{ minWidth: 0 }} wrap="nowrap">
					<Text fw={500} size="sm" truncate>
						{item.className}
					</Text>
					<LifetimeTypeIcon lifetime={item.lifetime} />
				</Group>
				<Text c="dimmed" size="xs" truncate>
					{item.moduleName}
				</Text>
			</Stack>
			<Group gap={4} wrap="nowrap">
				<Badge
					color={getOriginBadgeColor(item.origin)}
					size="xs"
					tt="none"
					variant="light"
				>
					{item.origin}
				</Badge>
				{item.origin === "own" && item.exported && (
					<Badge color="green" size="xs" tt="none" variant="outline">
						exported
					</Badge>
				)}
			</Group>
		</Group>
	);
}

function getOriginBadgeColor(origin: AvailableModuleFeature["origin"]): string {
	switch (origin) {
		case "global":
			return "grape";
		case "imported":
			return "blue";
		case "own":
			return "teal";
	}
}

// True when any member has a decorator that's available but not used here, so
// the used/available legend is only shown when there's actually a grey badge.
function hasAvailableDecorators(
	details: AvailableModuleFeature[],
	availableDecorators: Record<string, string[]>,
): boolean {
	return details.some((item) => {
		const used = new Set(item.decoratorNames);

		return (availableDecorators[item.className] ?? []).some(
			(name) => !used.has(name),
		);
	});
}

// A compact stat row for non-invocable helper members (initializers,
// interceptors): just a count-less label with a hover card listing details.
// These aren't clickable, so they don't warrant a full FeatureSection list.
function FeatureStatRow({
	details,
	label,
	availableDecorators,
}: {
	details: AvailableModuleFeature[];
	label: string;
	// Class name -> decorators bound to it (static analysis). Shown greyed when
	// available but unused; used decorators are colored.
	availableDecorators: Record<string, string[]>;
}) {
	const hasDetails = details.length > 0;

	return (
		<Group justify="space-between" gap="md">
			<Group gap={6}>
				<Text c="dimmed" size="sm">
					{label}
				</Text>
				{hasDetails && (
					<HoverCard
						openDelay={150}
						position="left-start"
						shadow="md"
						withArrow
					>
						<HoverCard.Target>
							<InfoDot label={`Show ${label.toLowerCase()} details`} />
						</HoverCard.Target>
						<HoverCard.Dropdown style={{ maxWidth: 300, padding: 10 }}>
							<Stack gap={10}>
								{hasAvailableDecorators(details, availableDecorators) && (
									<Text c="dimmed" style={{ fontSize: 9 }}>
										colored = used here · grey = available
									</Text>
								)}
								{details.map((item) => {
									// Show every decorator bound to this class, with the ones
									// actually used in this module colored and the rest (available
									// but unused) greyed. Union so a used decorator missing from
									// static analysis still shows.
									const used = new Set(item.decoratorNames);
									const availableOnly = (
										availableDecorators[item.className] ?? []
									).filter((name) => !used.has(name));
									const decorators = [...item.decoratorNames, ...availableOnly];

									return (
										<Stack gap={4} key={item.key}>
											<Group
												align="flex-start"
												gap={6}
												justify="space-between"
												wrap="nowrap"
											>
												<Text
													fw={700}
													size="sm"
													style={{
														flex: 1,
														minWidth: 0,
														wordBreak: "break-word",
													}}
												>
													{item.className}
												</Text>
												<Group gap={4} wrap="nowrap">
													<Badge
														color={getOriginBadgeColor(item.origin)}
														size="xs"
														tt="none"
														variant="light"
													>
														{item.origin}
													</Badge>
													{item.origin === "own" && item.exported && (
														<Badge
															color="green"
															size="xs"
															tt="none"
															variant="outline"
														>
															exported
														</Badge>
													)}
												</Group>
											</Group>
											{decorators.length > 0 && (
												<Stack gap={3}>
													<Text c="dimmed" fw={600} style={{ fontSize: 10 }}>
														Decorators
													</Text>
													<Group gap={4} wrap="wrap">
														{decorators.map((name) => {
															const isUsed = used.has(name);

															return (
																<Badge
																	color={isUsed ? "grape" : "gray"}
																	key={name}
																	size="xs"
																	style={isUsed ? undefined : { opacity: 0.6 }}
																	tt="none"
																	variant="outline"
																>
																	@{name}
																</Badge>
															);
														})}
													</Group>
												</Stack>
											)}
											{item.origin !== "own" && (
												<Stack gap={3}>
													<Text c="dimmed" fw={600} style={{ fontSize: 10 }}>
														Imported from:
													</Text>
													<Text size="xs" style={{ wordBreak: "break-word" }}>
														{item.moduleName}
													</Text>
												</Stack>
											)}
										</Stack>
									);
								})}
							</Stack>
						</HoverCard.Dropdown>
					</HoverCard>
				)}
			</Group>
			<Text fw={700}>{details.length}</Text>
		</Group>
	);
}

function StatRow({
	details,
	detailsTitle,
	label,
	value,
}: {
	details?: string[];
	detailsTitle?: string;
	label: string;
	value: ReactNode;
}) {
	const hasDetails = Boolean(details?.length);

	return (
		<Group justify="space-between" gap="md">
			<Group gap={6}>
				<Text c="dimmed" size="sm">
					{label}
				</Text>
				{hasDetails && (
					<HoverCard
						openDelay={150}
						position="left-start"
						shadow="md"
						withArrow
					>
						<HoverCard.Target>
							<InfoDot label={`Show ${label.toLowerCase()} details`} />
						</HoverCard.Target>
						<HoverCard.Dropdown style={{ maxWidth: 300, padding: 8 }}>
							<Stack gap={6}>
								<Text c="dimmed" fw={700} size="xs">
									{detailsTitle ?? label}
								</Text>
								<ScrollArea.Autosize mah={180} type="auto">
									<Stack gap={4}>
										{details?.map((item) => (
											<Code key={item} block>
												{item}
											</Code>
										))}
									</Stack>
								</ScrollArea.Autosize>
							</Stack>
						</HoverCard.Dropdown>
					</HoverCard>
				)}
			</Group>
			<Text fw={700}>{value}</Text>
		</Group>
	);
}

type ModuleRef = { name: string; tag?: string };

// A stat row whose tooltip lists related modules as clickable rows. Clicking a
// module centers the graph camera on it (without changing the selection).
function ModuleRefStatRow({
	detailsTitle,
	label,
	modules,
}: {
	detailsTitle?: string;
	label: string;
	modules: ModuleRef[];
}) {
	const { requestCenterModule } = useGraphSettings();
	const hasDetails = modules.length > 0;

	return (
		<Group justify="space-between" gap="md">
			<Group gap={6}>
				<Text c="dimmed" size="sm">
					{label}
				</Text>
				{hasDetails && (
					<HoverCard
						openDelay={150}
						position="left-start"
						shadow="md"
						withArrow
					>
						<HoverCard.Target>
							<InfoDot label={`Show ${label.toLowerCase()} details`} />
						</HoverCard.Target>
						<HoverCard.Dropdown style={{ maxWidth: 300, padding: 8 }}>
							<Stack gap={6}>
								<Text c="dimmed" fw={700} size="xs">
									{detailsTitle ?? label}
								</Text>
								<ScrollArea.Autosize mah={220} type="auto">
									<Stack gap={4}>
										{modules.map((module) => (
											<Group
												align="center"
												gap={6}
												key={module.name}
												onClick={() => requestCenterModule(module.name)}
												p={6}
												style={{
													background: "var(--mantine-color-gray-0)",
													border: "1px solid var(--mantine-color-gray-2)",
													borderRadius: 6,
													cursor: "pointer",
												}}
												title="Center on graph"
												wrap="nowrap"
											>
												<Text
													size="sm"
													style={{ flex: 1, minWidth: 0 }}
													truncate
												>
													{module.name}
												</Text>
												{module.tag && (
													<Badge color="grape" size="xs" variant="light">
														{module.tag}
													</Badge>
												)}
												<Text c="dimmed" size="sm" style={{ lineHeight: 1 }}>
													⌖
												</Text>
											</Group>
										))}
									</Stack>
								</ScrollArea.Autosize>
							</Stack>
						</HoverCard.Dropdown>
					</HoverCard>
				)}
			</Group>
			<Text fw={700}>{modules.length}</Text>
		</Group>
	);
}

const InfoDot = forwardRef<
	HTMLSpanElement,
	{ label: string } & ComponentPropsWithoutRef<"span">
>(function InfoDot({ label, ...others }, ref) {
	return (
		<Box
			aria-label={label}
			component="span"
			ref={ref}
			{...others}
			style={{
				alignItems: "center",
				border: "1px solid var(--mantine-color-gray-4)",
				borderRadius: 999,
				color: "var(--mantine-color-gray-6)",
				cursor: "help",
				display: "inline-flex",
				fontSize: 10,
				fontWeight: 700,
				height: 16,
				justifyContent: "center",
				lineHeight: 1,
				width: 16,
			}}
		>
			i
		</Box>
	);
});

function getDetailsModuleId(module: ModuleNodeData): string {
	if (!module.id.startsWith("group:")) return module.id;

	// Fall back to the group id only if, unexpectedly, there are no instances.
	return module.instances[0]?.id ?? module.id;
}

function emptyModuleDetails(module: ModuleNodeData): GetModuleDetailsResponse {
	return {
		availableCommandPreHandlerDetails: module.commandPreHandlers.map((key) => ({
			className: module.commandPreHandlerClassNames[key] ?? key,
			decoratorNames: [],
			exported: module.commandPreHandlerExports.includes(key),
			key,
			lifetime: module.commandPreHandlerLifetimeTypes[key],
			moduleName: module.name,
			origin: "own",
		})),
		availableCommandPreHandlers: module.commandPreHandlers,
		availableInitializerDetails: module.initializers.map((key) => ({
			className: key,
			decoratorNames: [],
			exported: module.initializerExports.includes(key),
			key,
			moduleName: module.name,
			origin: "own",
		})),
		availableInitializers: module.initializers,
		availableInterceptorDetails: module.interceptors.map((key) => ({
			className: key,
			decoratorNames: [],
			exported: module.interceptorExports.includes(key),
			key,
			moduleName: module.name,
			origin: "own",
		})),
		availableInterceptors: module.interceptors,
		availableQueryPreHandlerDetails: module.queryPreHandlers.map((key) => ({
			className: module.queryPreHandlerClassNames[key] ?? key,
			decoratorNames: [],
			exported: module.queryPreHandlerExports.includes(key),
			key,
			lifetime: module.queryPreHandlerLifetimeTypes[key],
			moduleName: module.name,
			origin: "own",
		})),
		availableQueryPreHandlers: module.queryPreHandlers,
		globalModules: [],
		importedModules: [],
		module: module as unknown as GetModuleDetailsResponse["module"],
		entrypoints: module.entrypoints,
		routes: module.routes,
		usedByModules: [],
		availableDecorators: {},
	};
}
