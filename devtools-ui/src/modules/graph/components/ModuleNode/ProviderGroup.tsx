import {
	Badge,
	Button,
	Group,
	HoverCard,
	Paper,
	Stack,
	Text,
} from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { Handle, Position } from "@xyflow/react";
import { Fragment } from "react";
import type { RoutePlaygroundSearch } from "../../../route-playground/route";
import { RoutePlaygroundModes } from "../../../route-playground/use-route-playground-settings";
import { useTargets } from "../../../targets/TargetsContext";
import { useGraphSettings } from "../../GraphSettingsContext";
import { PROVIDER_ROW_HEIGHT } from "../../hooks/provider-node-metrics";
import { getInvocationModuleId } from "../../module-id";
import type { ModuleFlowNode } from "../../types";
import { HighlightedText } from "./HighlightedText";
import styles from "./ModuleNode.module.css";
import { ProviderBadge } from "./ProviderBadge";
import { ExportedProviderIcon } from "./ProviderIcons";

export function ProviderGroup({
	data,
	group,
	groupKey,
	highlightExports = true,
	onProviderClick,
	providerPlaygroundModuleId = getInvocationModuleId(data),
	showHandles = true,
	showMembers = showHandles,
	showGroupColor = true,
	tag,
	width,
}: {
	data: ModuleFlowNode["data"];
	group?: ModuleFlowNode["data"]["importedProviderGroups"][number];
	groupKey: string;
	// The selection color that fills exported/entry chips and accents the group.
	// Only meaningful on the graph; the drawer passes false so its provider list
	// stays neutral regardless of which module is selected.
	highlightExports?: boolean;
	onProviderClick?: (provider: string) => void;
	providerPlaygroundModuleId?: string;
	showHandles?: boolean;
	showGroupColor?: boolean;
	showMembers?: boolean;
	tag?: string;
	width?: number | string;
}) {
	const navigate = useNavigate({ from: "/" });
	const { selectTarget } = useTargets();
	const { providerFocusHighlight, searchQuery } = useGraphSettings();
	const isOwnGroup = group === undefined;
	// providerRelationColor belongs to the OWN group only. Imported groups use just
	// their own group.color (set when they're a focused dependency of the selected
	// module) — never the fallback, or a dependency module would fill all its
	// imported groups with its own color instead of only its own providers group.
	const color =
		showGroupColor && highlightExports
			? isOwnGroup
				? data.providerRelationColor
				: group.color
			: undefined;
	const exportedProviders = group?.color ? group.providers : data.exports;
	const handleId = group ? `provider-group:${group.moduleId}` : undefined;
	const impact = group?.impact ?? data.impact;
	const source = group ?? data;
	const providerIsClass = group?.providerIsClass ?? data.providerIsClass;
	const providerIsFactory = group?.providerIsFactory ?? data.providerIsFactory;
	const providerClassNames =
		group?.providerClassNames ?? data.providerClassNames;
	const providerValues = group?.providerValues ?? data.providerValues;
	const providers =
		group?.providers ?? withDeletedProviders(data.providers, impact.deleted);
	const title = group?.moduleName ?? "Own providers";
	const exportedProviderNames = new Set(exportedProviders);
	// Non-provider members (interceptors/initializers/middlewares). Shown in the
	// graph node so local members and exports/imports of them have a visible
	// anchor; the drawer has dedicated sections for them.
	const members = showMembers ? (group ? group.members : data.ownMembers) : [];

	// Nothing to show for an imported group with neither providers nor members
	// (e.g. a members-only group in the drawer).
	if (!isOwnGroup && providers.length === 0 && members.length === 0) {
		return null;
	}

	const renderMemberRow = (member: (typeof members)[number]) => {
		const { all } = getMemberDecorators(member);
		// Members aren't part of the provider dependency chain, so when a provider
		// is focused they dim like any unrelated chip — keeping the spotlight on the
		// focused provider and its dependants.
		const focus = data.providerFocus;
		const isSelected = focus?.provider === member.className;
		const isDimmed = Boolean(
			focus &&
				focus.provider !== member.className &&
				!focus[providerFocusHighlight].includes(member.className),
		);
		const rowColor = isSelected ? undefined : color;

		return (
			<Group
				align="center"
				gap={6}
				// Styled like a provider chip; the kind badge distinguishes it. Members
				// are always exports, so the whole row fills solid with the group color
				// (white foreground for contrast) when its group is a focused dependency,
				// matching the exported provider chips. The own group marks them with ↗.
				style={{
					background: isSelected
						? "var(--mantine-color-orange-2)"
						: (rowColor ?? "var(--mantine-color-gray-0)"),
					borderRadius: 4,
					minHeight: PROVIDER_ROW_HEIGHT,
					opacity: isDimmed ? 0.48 : undefined,
					paddingInline: 6,
				}}
				wrap="nowrap"
			>
				<Badge
					color={getMemberKindColor(member.kind)}
					radius="sm"
					size="xs"
					style={{ flexShrink: 0 }}
					title={member.kind}
					tt="none"
					// On a solid colored row, a white-bg badge with kind-colored text
					// reads clearly; otherwise the usual light variant.
					variant={rowColor ? "white" : "light"}
				>
					{getMemberKindLabel(member.kind)}
				</Badge>
				<Text
					c={rowColor ? "white" : undefined}
					size="xs"
					style={{ flex: 1, minWidth: 0 }}
					truncate
				>
					{member.className}
				</Text>
				{all.length > 0 && (
					<Text
						c={rowColor ? "white" : "grape"}
						fw={700}
						size="xs"
						style={{ flexShrink: 0 }}
					>
						@{all.length}
					</Text>
				)}
				{isOwnGroup && member.exported && (
					<ExportedProviderIcon
						style={{ marginLeft: all.length > 0 ? 6 : "auto" }}
					/>
				)}
			</Group>
		);
	};

	return (
		<Paper
			component="section"
			p={8}
			style={{
				// The group itself stays plain — only the exported "entry" chips inside
				// fill (see ProviderBadge highlightColor), since a module may expose just
				// one of many providers. A colored left accent marks the group as the
				// focused arrow endpoint.
				background: "rgb(255 255 255 / 70%)",
				borderLeft: color ? `2px solid ${color}` : undefined,
				display: "grid",
				gap: 6,
				position: "relative",
				width,
			}}
		>
			{showHandles && isOwnGroup && (
				<Handle
					id="provider-group:own"
					type="target"
					position={Position.Left}
				/>
			)}
			{showHandles && handleId && (
				<Handle
					id={handleId}
					type="source"
					position={Position.Right}
					style={
						color
							? {
									background: color,
									borderColor: color,
								}
							: undefined
					}
				/>
			)}
			<Group gap={6} justify="space-between" wrap="nowrap">
				<Text
					c={isOwnGroup ? "dimmed" : (color ?? "dimmed")}
					fw={700}
					size="xs"
					style={{ minWidth: 0, overflowWrap: "anywhere" }}
				>
					<HighlightedText query={searchQuery} text={title} />
				</Text>
				{tag && (
					<Badge
						color="grape"
						radius="sm"
						size="xs"
						style={{ flexShrink: 0 }}
						variant="light"
					>
						{tag}
					</Badge>
				)}
			</Group>
			{providers.length > 0 && (
				<Stack className={styles.providerDepsList} gap={6}>
					{providers.map((provider) => (
						<ProviderBadge
							providerClassName={providerClassNames[provider]}
							data={data}
							exported={exportedProviderNames.has(provider)}
							highlightColor={color}
							isOwnGroup={isOwnGroup}
							groupKey={groupKey}
							impact={impact}
							invocable={providerIsClass[provider] !== false}
							isFactory={providerIsFactory[provider] === true}
							key={provider}
							onProviderClick={onProviderClick}
							provider={provider}
							playgroundModuleId={providerPlaygroundModuleId}
							source={source}
							value={providerValues[provider]}
						/>
					))}
				</Stack>
			)}
			{members.length > 0 && (
				<Stack gap={6}>
					{members.map((member) => {
						const rowKey = `${member.kind}:${member.name}`;
						const { all, used, hasAvailableOnly } = getMemberDecorators(member);
						const opensMiddlewarePlayground = member.kind === "middleware";
						const openMiddlewareInPlayground = () => {
							if (!opensMiddlewarePlayground) return;

							selectTarget(data.serviceName);
							navigate({
								to: "/routes",
								search: {
									middleware: member.name,
									mode: RoutePlaygroundModes.middleware,
									module: providerPlaygroundModuleId,
								} satisfies RoutePlaygroundSearch,
							});
						};

						if (all.length === 0 && !opensMiddlewarePlayground) {
							return (
								<Fragment key={rowKey}>{renderMemberRow(member)}</Fragment>
							);
						}

						return (
							<HoverCard
								key={rowKey}
								openDelay={150}
								position="right-start"
								shadow="md"
								withArrow
								withinPortal
							>
								<HoverCard.Target>{renderMemberRow(member)}</HoverCard.Target>
								<HoverCard.Dropdown className={styles.providerDepsPopover}>
									<Stack gap={6}>
										{opensMiddlewarePlayground && (
											<Button
												fullWidth
												onClick={openMiddlewareInPlayground}
												size="xs"
												variant="light"
											>
												Open in playground
											</Button>
										)}
										{all.length > 0 && (
											<>
												<Text c="dimmed" fw={700} size="xs">
													Decorators
												</Text>
												{hasAvailableOnly && (
													<Text c="dimmed" style={{ fontSize: 9 }}>
														colored = used here · grey = available
													</Text>
												)}
												<Group gap={4} wrap="wrap">
													{all.map((decorator) => {
														const isUsed = used.has(decorator);

														return (
															<Badge
																color={isUsed ? "grape" : "gray"}
																key={decorator}
																radius="sm"
																size="xs"
																style={isUsed ? undefined : { opacity: 0.6 }}
																tt="none"
																variant="outline"
															>
																@{decorator}
															</Badge>
														);
													})}
												</Group>
											</>
										)}
									</Stack>
								</HoverCard.Dropdown>
							</HoverCard>
						);
					})}
				</Stack>
			)}
			{isOwnGroup && providers.length === 0 && members.length === 0 && (
				<Text c="dimmed" size="xs">
					No providers
				</Text>
			)}
		</Paper>
	);
}

type Member =
	ModuleFlowNode["data"]["importedProviderGroups"][number]["members"][number];

type MemberKind = Member["kind"];

// Merges a member's used + available decorators into a single render list: used
// decorators first (colored), then the rest of the catalog (greyed). Union so a
// used decorator missing from static analysis still shows. Mirrors the module
// drawer's FeatureStatRow so both surfaces read the same.
function getMemberDecorators(member: Member): {
	all: string[];
	used: Set<string>;
	hasAvailableOnly: boolean;
} {
	const used = new Set(member.usedDecorators);
	const availableOnly = member.availableDecorators.filter(
		(name) => !used.has(name),
	);

	return {
		all: [...member.usedDecorators, ...availableOnly],
		used,
		hasAvailableOnly: availableOnly.length > 0,
	};
}

export function getMemberKindColor(kind: MemberKind): string {
	switch (kind) {
		case "interceptor":
			return "grape";
		case "initializer":
			return "blue";
		case "middleware":
			return "cyan";
	}
}

// Short legend codes (see GraphLegend). Kept compact so a member row reads as
// "Ic  SomeInterceptor  @Cache".
export function getMemberKindLabel(kind: MemberKind): string {
	switch (kind) {
		case "interceptor":
			return "Ic";
		case "initializer":
			return "In";
		case "middleware":
			return "Mw";
	}
}

function withDeletedProviders(
	providers: string[],
	deletedProviders: string[],
): string[] {
	return [...new Set([...providers, ...deletedProviders])];
}

export function getDependencyProviderColorByName(
	groups: ModuleFlowNode["data"]["importedProviderGroups"],
): Record<string, string> {
	const colorByName: Record<string, string> = {};

	for (const group of groups) {
		if (!group.color) continue;

		for (const provider of group.providers) {
			colorByName[provider] = group.color;
		}
	}

	return colorByName;
}
