import { CodeHighlight } from "@mantine/code-highlight";
import {
	ActionIcon,
	Badge,
	Button,
	Code,
	Group,
	HoverCard,
	Stack,
	Text,
} from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { useState } from "react";
import type { LifetimeType, ModuleProviderImpact } from "@/api/model/index";
import type { RoutePlaygroundSearch } from "../../../route-playground/route";
import { RoutePlaygroundModes } from "../../../route-playground/use-route-playground-settings";
import { useGraphSettings } from "../../GraphSettingsContext";
import type {
	ModuleFlowNode,
	ProviderFocusHighlight,
	ProviderImpactStatusByName,
} from "../../types";
import { HighlightedText } from "./HighlightedText";
import styles from "./ModuleNode.module.css";
import { ProviderDependencyList } from "./ProviderDependencyPopover";
import { getDependencyProviderColorByName } from "./ProviderGroup";
import {
	AllowCircularIcon,
	EagerProviderIcon,
	ExportedProviderIcon,
	FactoryProviderIcon,
	LifetimeTypeIcon,
} from "./ProviderIcons";
import { ProviderStatusMark } from "./ProviderStatusDot";
import { resolveProviderStatus, STATUS_COLOR_VAR } from "./provider-status";

type ProviderSource = {
	providerAllowCircular: Record<string, boolean>;
	providerDependencies: Record<string, string[]>;
	providerEager: Record<string, boolean>;
	providerInitAfter: Record<string, string[]>;
	lifetimeTypes: Record<string, LifetimeType>;
};

export function ProviderBadge({
	exported,
	groupKey,
	highlightColor,
	impact,
	invocable = true,
	isFactory = false,
	isOwnGroup = false,
	onProviderClick,
	provider,
	playgroundModuleId,
	providerClassName,
	source,
	value,
	data,
}: {
	data: ModuleFlowNode["data"];
	exported: boolean;
	// Implementation class name (class providers) — shown in the tooltip.
	providerClassName?: string;
	// Serialized value (value providers) — shown in the tooltip, hidden behind a
	// reveal toggle when the key looks secret.
	value?: string;
	// The focused-dependency color of this chip's group. Set only for the exported
	// providers that are the actual import connection, so just those "entry" chips
	// tint (not the whole group, which may be mostly private providers).
	highlightColor?: string;
	// Only the module's own group marks exports (an imported group is all exports
	// by definition, so the mark would be noise).
	isOwnGroup?: boolean;
	groupKey: string;
	impact: ModuleProviderImpact;
	invocable?: boolean;
	// Factory ({ useFactory }) provider — marked in the tooltip and on the chip.
	isFactory?: boolean;
	onProviderClick?: (provider: string) => void;
	provider: string;
	playgroundModuleId: string;
	source: ProviderSource;
}) {
	const navigate = useNavigate({ from: "/" });
	const { providerFocusHighlight, searchQuery, setProviderFocus } =
		useGraphSettings();
	const [valueRevealed, setValueRevealed] = useState(false);
	// A value whose key looks like a credential is hidden until revealed, so it
	// doesn't sit in the open in screenshots/screen-shares.
	const isSecretValue =
		value !== undefined && SECRET_KEY_PATTERN.test(provider);
	const occurrenceId = `${data.id}:${groupKey}:${provider}`;
	// The exported "entry" chips that carry the connection show the group color as
	// a right-edge bar (the export leaves via the right handle); the rest stay
	// neutral.
	const isHighlighted = Boolean(exported && highlightColor);
	const status = resolveProviderStatus({
		added: impact.added.includes(provider),
		affected: impact.affected.includes(provider),
		changed: impact.changed.includes(provider),
		deleted: impact.deleted.includes(provider),
	});
	const focusClass = getProviderFocusClass(
		provider,
		occurrenceId,
		data.providerFocus,
		providerFocusHighlight,
	);

	const dependencyProviderColorByName = getDependencyProviderColorByName(
		data.importedProviderGroups,
	);
	const providerImpactStatusByName = buildStatusByName([
		data.impact,
		...data.importedProviderGroups.map((g) => g.impact),
	]);

	// onProviderClick means we're in the drawer, navigating to the playground.
	// Value/factory providers can't be invoked there, so they don't navigate.
	const opensPlayground = Boolean(onProviderClick);
	const isInvocableInPlayground = opensPlayground && invocable;
	const isValueInPlayground = opensPlayground && !invocable;
	const openProviderInPlayground = () => {
		if (!invocable) return;

		if (onProviderClick) {
			onProviderClick(provider);
			return;
		}

		navigate({
			to: "/routes",
			search: {
				mode: RoutePlaygroundModes.provider,
				module: playgroundModuleId,
				provider,
			} satisfies RoutePlaygroundSearch,
		});
	};

	return (
		<HoverCard
			key={provider}
			openDelay={150}
			position="right-start"
			shadow="md"
			withArrow
			withinPortal
		>
			<HoverCard.Target>
				<Badge
					className={clsx(
						styles.providerDepsTrigger,
						styles[focusClass],
						isInvocableInPlayground && styles.providerInvocable,
						isValueInPlayground && styles.providerValueOnly,
					)}
					onClick={(event) => {
						event.stopPropagation();
						if (onProviderClick) {
							if (invocable) onProviderClick(provider);
							return;
						}

						setProviderFocus(
							data.providerFocus?.provider === provider &&
								data.providerFocus.occurrenceId === occurrenceId
								? null
								: { occurrenceId, provider },
						);
					}}
					onPointerDown={(event) => event.stopPropagation()}
					radius="sm"
					styles={{
						label: {
							textTransform: "none",
							// Flex row so the name grows and trailing icons (incl. the
							// far-right export mark) align to the right edge, like member rows.
							// flex:1 makes the label fill the flex root (Mantine sizes it to
							// content otherwise); textAlign left overrides Mantine's centered
							// badge text so the name sits left like the member rows.
							display: "flex",
							alignItems: "center",
							flex: 1,
							minWidth: 0,
							textAlign: "left",
						},
						root: {
							...getProviderChipStyles({
								focusClass,
								highlightColor,
								isHighlighted,
								statusColor: status ? STATUS_COLOR_VAR[status] : undefined,
							}),
							// Set inline so it wins over Mantine's Badge styles. Value
							// providers in the drawer aren't clickable; everything else is.
							cursor: isValueInPlayground ? "default" : "pointer",
						},
					}}
					variant="light"
				>
					<ProviderStatusMark status={status ?? undefined} />
					<span
						style={{
							flex: 1,
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							// Removed providers read as a diff deletion.
							textDecoration: status === "deleted" ? "line-through" : undefined,
						}}
					>
						<HighlightedText query={searchQuery} text={provider} />
					</span>
					{source.providerAllowCircular[provider] && <AllowCircularIcon />}
					{isFactory && <FactoryProviderIcon />}
					{source.providerEager[provider] && <EagerProviderIcon />}
					<LifetimeTypeIcon lifetime={source.lifetimeTypes[provider]} />
					{isOwnGroup && exported && <ExportedProviderIcon />}
				</Badge>
			</HoverCard.Target>
			<HoverCard.Dropdown
				className={styles.providerDepsPopover}
				onClick={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
			>
				{invocable && (
					<Button
						fullWidth
						mb={8}
						onClick={openProviderInPlayground}
						size="xs"
						variant="light"
					>
						Open in playground
					</Button>
				)}
				{providerClassName && (
					<Group gap={6} mb={6} wrap="nowrap">
						<Text c="dimmed" fw={700} size="xs">
							Class name:
						</Text>
						<Code>{providerClassName}</Code>
					</Group>
				)}
				{isFactory && (
					<Group gap={6} mb={6} wrap="nowrap">
						<Text c="dimmed" fw={700} size="xs">
							Factory:
						</Text>
						<Text size="xs">Value built by a useFactory function.</Text>
					</Group>
				)}
				{value !== undefined && (
					<Stack gap={4} mb={6}>
						<Group gap={6} justify="space-between" wrap="nowrap">
							<Text c="dimmed" fw={700} size="xs">
								Value:
							</Text>
							{isSecretValue && (
								<ActionIcon
									aria-label={valueRevealed ? "Hide value" : "Reveal value"}
									color="gray"
									onClick={() => setValueRevealed((shown) => !shown)}
									size="xs"
									variant="subtle"
								>
									{valueRevealed ? <EyeOffIcon /> : <EyeIcon />}
								</ActionIcon>
							)}
						</Group>
						{isSecretValue && !valueRevealed ? (
							<Text c="dimmed" size="sm">
								••••••••
							</Text>
						) : (
							<CodeHighlight
								code={value}
								language="typescript"
								styles={{
									code: { fontSize: "var(--mantine-font-size-xs)" },
								}}
								withCopyButton={false}
							/>
						)}
					</Stack>
				)}
				{isValueInPlayground && (
					<Text c="dimmed" mb={6} size="xs">
						Value provider — can't be invoked in the playground.
					</Text>
				)}
				{/* Constructor dependencies only make sense for class providers;
				    value/factory providers have none, so skip the section entirely. */}
				{invocable && (
					<ProviderDependencyList
						dependencyProviderColorByName={dependencyProviderColorByName}
						dependencies={source.providerDependencies[provider] ?? []}
						initAfter={source.providerInitAfter[provider] ?? []}
						providerImpactStatusByName={providerImpactStatusByName}
						lifetimeTypes={source.lifetimeTypes}
						searchQuery={searchQuery}
					/>
				)}
			</HoverCard.Dropdown>
		</HoverCard>
	);
}

// Registration keys that look like credentials — their value is masked until
// the user reveals it.
const SECRET_KEY_PATTERN = /pass|secret|token|key|cred|auth|priv/i;

function EyeIcon() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="12"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width="12"
		>
			<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

function EyeOffIcon() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="12"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width="12"
		>
			<path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
			<line x1="1" x2="23" y1="1" y2="23" />
		</svg>
	);
}

type ProviderFocusClass =
	| "providerFocusDependant"
	| "providerFocusDimmed"
	| "providerFocusSame"
	| "providerFocusSelected"
	| "";

function getProviderFocusClass(
	provider: string,
	occurrenceId: string,
	providerFocus: ModuleFlowNode["data"]["providerFocus"],
	providerFocusHighlight: ProviderFocusHighlight,
): ProviderFocusClass {
	if (!providerFocus) return "";

	if (provider === providerFocus.provider) {
		return occurrenceId === providerFocus.occurrenceId
			? "providerFocusSelected"
			: "providerFocusSame";
	}
	if (providerFocus[providerFocusHighlight].includes(provider)) {
		return "providerFocusDependant";
	}

	return "providerFocusDimmed";
}

function getFocusFill(focusClass: ProviderFocusClass): string | undefined {
	switch (focusClass) {
		case "providerFocusSelected":
			return "var(--mantine-color-orange-2)";
		case "providerFocusSame":
			return "var(--mantine-color-orange-1)";
		case "providerFocusDependant":
			return "var(--mantine-color-yellow-2)";
		default:
			return undefined;
	}
}

function getProviderChipStyles({
	focusClass,
	highlightColor,
	isHighlighted,
	statusColor,
}: {
	focusClass: ProviderFocusClass;
	highlightColor?: string;
	isHighlighted: boolean;
	statusColor?: string;
}) {
	// Three independent channels so the signals never fight:
	//   interior fill = focus (selected/same/dependant); text color is derived
	//     from the effective fill, so a pale focus fill can't yield white text;
	//   left border = impact status (diff gutter).
	// Override Mantine's inline-grid/fit-content root with a full-width flex row
	// so the label fills the chip and trailing icons align right.
	const focusFill = getFocusFill(focusClass);
	const background =
		focusFill ??
		(isHighlighted
			? (highlightColor as string)
			: "var(--mantine-color-gray-0)");
	const color =
		isHighlighted && !focusFill
			? "var(--mantine-color-white)"
			: "var(--mantine-color-gray-8)";

	return {
		color,
		fontWeight: focusClass === "providerFocusSelected" ? 700 : 500,
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-start",
		maxWidth: "100%",
		width: "100%",
		// Match the interceptor/initializer member rows' horizontal padding
		// (Mantine's default badge padding-x is larger).
		paddingInline: 6,
		background,
		borderLeft: statusColor ? `4px solid ${statusColor}` : undefined,
	};
}

function buildStatusByName(
	impacts: ModuleProviderImpact[],
): ProviderImpactStatusByName {
	const byName: ProviderImpactStatusByName = {};

	for (const impact of impacts) {
		for (const provider of impact.affected) {
			byName[provider] = "affected";
		}
		for (const provider of impact.changed) {
			byName[provider] = "changed";
		}
		for (const provider of impact.added) {
			byName[provider] = "new";
		}
		for (const provider of impact.deleted) {
			byName[provider] = "deleted";
		}
	}

	return byName;
}
